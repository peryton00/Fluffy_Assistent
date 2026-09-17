"""
Canonical Plan Compiler for Fluffy Assistant

Transforms parser output (CommandUnderstanding) or task specifications
into validated, dependency-aware AgentPlan DAGs without side effects.
"""

import time
import uuid
from typing import Dict, Any, Optional, List, Union

from brain.agent.plan import AgentPlan, PlanValidator
from brain.agent.step import PlanStep, StepStatus
from brain.agent.task import AgentTask


class PlanCompilationError(Exception):
    """Raised when plan compilation fails or produces an unexecutable plan."""

    def __init__(
        self,
        message: str,
        category: str = "compilation_error",
        details: Optional[Dict[str, Any]] = None,
    ):
        super().__init__(message)
        self.message = message
        self.category = category
        self.details = details or {}


class PlanCompiler:
    """
    Transforms CommandUnderstanding or AgentTask into a validated AgentPlan DAG.

    Guarantees:
    - Side-effect free: never executes capabilities, models, or system commands.
    - Deterministic: generates stable step IDs and dependencies.
    - DAG-validated: ensures Kahn's topological sort and acyclicity via PlanValidator.
    """

    def __init__(self, max_steps: int = 20):
        self.max_steps = max_steps

    def compile(
        self,
        understanding: Any,
        task_id: Optional[str] = None,
        goal: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> AgentPlan:
        """
        Compile a CommandUnderstanding or dict into an AgentPlan.

        Args:
            understanding: CommandUnderstanding object or dictionary from parser.
            task_id: Optional task identifier (generated if omitted).
            goal: Optional high-level goal description.
            metadata: Optional execution metadata.

        Returns:
            Validated AgentPlan.

        Raises:
            PlanCompilationError: If clarification is needed, new functionality is required,
                                  or DAG validation fails.
        """
        effective_task_id = task_id or f"task_{uuid.uuid4().hex[:10]}"

        # 1. Check for clarification requirement
        needs_clarification = getattr(
            understanding, "needs_clarification", False
        ) or (isinstance(understanding, dict) and understanding.get("needs_clarification", False))
        if needs_clarification:
            clarify_text = getattr(understanding, "text", "") or (
                understanding.get("text", "") if isinstance(understanding, dict) else ""
            ) or "User request is ambiguous and requires clarification."
            raise PlanCompilationError(
                message=clarify_text,
                category="clarification_needed",
                details={"understanding": self._to_dict_safe(understanding)},
            )

        # 2. Check for unsupported / new functionality request
        requires_new_func = getattr(
            understanding, "requires_new_functionality", False
        ) or (isinstance(understanding, dict) and understanding.get("requires_new_functionality", False))
        if requires_new_func:
            impl_desc = getattr(understanding, "suggested_implementation", "") or (
                understanding.get("suggested_implementation", "") if isinstance(understanding, dict) else ""
            )
            intent_name = getattr(understanding, "intent", "") or (
                understanding.get("intent", "") if isinstance(understanding, dict) else ""
            )
            raise PlanCompilationError(
                message=f"Request requires new functionality '{intent_name}': {impl_desc}",
                category="unsupported_functionality",
                details={
                    "intent": intent_name,
                    "suggested_implementation": impl_desc,
                },
            )

        # 3. Extract steps payload
        raw_steps = getattr(understanding, "steps", None)
        if raw_steps is None and isinstance(understanding, dict):
            raw_steps = understanding.get("steps")

        intent = getattr(understanding, "intent", "") or (
            understanding.get("intent", "") if isinstance(understanding, dict) else ""
        )
        user_text = getattr(understanding, "text", "") or (
            understanding.get("text", "") if isinstance(understanding, dict) else ""
        )
        orig_text = getattr(understanding, "original_text", "") or (
            understanding.get("original_text", "") if isinstance(understanding, dict) else ""
        )
        params = getattr(understanding, "parameters", {}) or (
            understanding.get("parameters", {}) if isinstance(understanding, dict) else {}
        )

        effective_goal = goal or orig_text or user_text or intent or "Execute task"

        # 4. Multi-step compilation
        if (intent == "multi_step" or raw_steps) and isinstance(raw_steps, list) and len(raw_steps) > 0:
            steps = self._compile_multi_steps(raw_steps, orig_text=orig_text)
        else:
            # 5. Single-step compilation
            steps = self._compile_single_step(
                intent=intent,
                parameters=params,
                text=user_text,
                original_text=orig_text,
            )

        plan_meta = {
            "source": "plan_compiler",
            "compiled_at": time.time(),
            **(metadata or {}),
        }

        plan = AgentPlan(
            task_id=effective_task_id,
            goal=effective_goal,
            steps=steps,
            metadata=plan_meta,
        )

        # 6. Authoritative DAG validation
        is_valid, val_err = PlanValidator.validate(plan, max_steps=self.max_steps)
        if not is_valid:
            raise PlanCompilationError(
                message=f"Compiled plan failed validation: {val_err}",
                category="validation_error",
                details={"plan": plan.to_dict(), "validation_error": val_err},
            )

        return plan

    def compile_from_task(self, task: AgentTask) -> AgentPlan:
        """
        Compile an AgentPlan directly from an existing AgentTask.

        Preserves full compatibility with AgentOrchestrator default planning.
        """
        # If task context contains a parsed understanding, compile it
        if "understanding" in task.context:
            return self.compile(
                understanding=task.context["understanding"],
                task_id=task.task_id,
                goal=task.goal or task.user_request,
                metadata=task.metadata,
            )

        # Extract explicit tool/model requirements from context or parameters
        tool_req = (
            task.context.get("tool_requirement") or
            task.context.get("parameters", {}).get("tool_requirement")
        )
        model_req = (
            task.context.get("model_requirement") or
            task.context.get("parameters", {}).get("model_requirement")
        )
        params = task.context.get("parameters", {})

        step = PlanStep(
            objective=task.goal or task.user_request,
            step_id="step_1",
            description=task.goal or task.user_request,
            dependencies=[],
            tool_requirement=tool_req,
            model_requirement=model_req,
            input_parameters=params,
            status=StepStatus.PENDING,
            metadata={"source": "agent_task_direct"},
        )

        plan = AgentPlan(
            task_id=task.task_id,
            goal=task.goal or task.user_request,
            steps=[step],
            metadata={"source": "plan_compiler_from_task", **task.metadata},
        )

        is_valid, val_err = PlanValidator.validate(plan, max_steps=self.max_steps)
        if not is_valid:
            raise PlanCompilationError(
                message=f"Task plan failed validation: {val_err}",
                category="validation_error",
                details={"plan": plan.to_dict(), "validation_error": val_err},
            )

        return plan

    def _compile_single_step(
        self,
        intent: str,
        parameters: Dict[str, Any],
        text: str,
        original_text: str,
    ) -> List[PlanStep]:
        """Compile a single-intent command into one PlanStep."""
        objective = text or original_text or intent or "Execute action"
        tool_req = parameters.get("tool_requirement")
        model_req = parameters.get("model_requirement")

        if not tool_req and intent and intent not in ("chat", "multi_step", "confirm", "cancel"):
            # Map canonical system commands or extensions to tool requirements
            tool_req = intent

        step = PlanStep(
            objective=objective,
            step_id="step_1",
            description=objective,
            dependencies=[],
            tool_requirement=tool_req,
            model_requirement=model_req,
            input_parameters=parameters,
            status=StepStatus.PENDING,
            metadata={"intent": intent},
        )
        return [step]

    def _compile_multi_steps(
        self,
        raw_steps: List[Any],
        orig_text: str = "",
    ) -> List[PlanStep]:
        """
        Compile multi-step parser items into dependency-linked PlanSteps.

        Preserves explicit dependencies if provided; otherwise enforces
        deterministic sequential dependency chains (step_1 -> step_2 -> ...).
        """
        steps: List[PlanStep] = []
        step_id_map: Dict[int, str] = {}

        # 1. First pass: establish deterministic step IDs
        for idx in range(len(raw_steps)):
            step_id_map[idx] = f"step_{idx + 1}"

        # 2. Second pass: construct PlanSteps with dependencies
        for idx, step_item in enumerate(raw_steps):
            step_id = step_id_map[idx]

            if isinstance(step_item, dict):
                intent = step_item.get("intent", "")
                params = step_item.get("parameters", {})
                obj = step_item.get("text") or step_item.get("objective") or intent or f"Step {idx + 1}"
                tool_req = step_item.get("tool_requirement") or (
                    intent if intent and intent not in ("chat", "multi_step") else None
                )
                model_req = step_item.get("model_requirement")

                # Dependency resolution
                if "dependencies" in step_item and isinstance(step_item["dependencies"], list):
                    # Explicit dependencies
                    deps = []
                    for d in step_item["dependencies"]:
                        if isinstance(d, int) and d in step_id_map:
                            deps.append(step_id_map[d])
                        elif isinstance(d, str):
                            deps.append(d)
                else:
                    # Deterministic sequential dependency: step_i depends on step_{i-1}
                    deps = [step_id_map[idx - 1]] if idx > 0 else []

            else:
                # String or primitive step
                obj = str(step_item)
                params = {}
                tool_req = None
                model_req = None
                deps = [step_id_map[idx - 1]] if idx > 0 else []

            step = PlanStep(
                objective=obj,
                step_id=step_id,
                description=obj,
                dependencies=deps,
                tool_requirement=tool_req,
                model_requirement=model_req,
                input_parameters=params,
                status=StepStatus.PENDING,
                metadata={"sequence_index": idx + 1, "original_text": orig_text},
            )
            steps.append(step)

        return steps

    @staticmethod
    def _to_dict_safe(obj: Any) -> Dict[str, Any]:
        """Safely convert object to dict without throwing."""
        if hasattr(obj, "to_dict") and callable(obj.to_dict):
            return obj.to_dict()
        if isinstance(obj, dict):
            return obj
        return {"raw": str(obj)}
