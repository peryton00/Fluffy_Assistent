"""
Step Execution Engine
Dispatches plan steps to Unified Tool Runtime or AI Model Runtime through canonical security gates.
"""

import time
import uuid
from typing import Dict, Any, Optional

from brain.agent.observation import StepObservation
from brain.agent.state import AgentState
from brain.agent.step import PlanStep, StepStatus
from brain.ai.router.interface import ModelRouter
from brain.ai.router.request import RoutingRequest, TaskType, QualityRequirement
from brain.ai.router.router import get_router
from brain.ai.runtime.interface import AIModelRuntime, GenerationRequest
from brain.ai.runtime.manager import get_runtime
from brain.runtime.rust_capability_client import RustCapabilityClient, get_capability_client
from brain.security.action_validator import ActionValidator, SafetyLevel
from brain.tools.runtime import UnifiedToolRuntime, get_tool_runtime
from brain.tools.registry import get_tool_registry, ToolRegistry
from brain.tools.policies.policy import ToolSecurityPolicy
from brain.tools.requests import ToolRequest
from brain.tools.results import ToolResult, ToolErrorType


class StepExecutor:
    """
    Executes an individual PlanStep through canonical Tool Runtime and Model Router boundaries.
    Decoupled from orchestrator lifecycle and state loops.
    """

    def __init__(
        self,
        tool_runtime: Optional[UnifiedToolRuntime] = None,
        rust_client: Optional[RustCapabilityClient] = None,
        model_router: Optional[ModelRouter] = None,
        ai_runtime: Optional[AIModelRuntime] = None,
        action_validator: Optional[ActionValidator] = None,
    ):
        self._tool_runtime = tool_runtime
        self._rust_client = rust_client
        self._model_router = model_router
        self._ai_runtime = ai_runtime
        self._action_validator = action_validator

    @property
    def tool_runtime(self) -> UnifiedToolRuntime:
        if self._tool_runtime is None:
            registry = get_tool_registry()
            if self._rust_client is not None:
                from brain.tools.definitions import ToolKind
                from brain.tools.adapters.rust import RustToolAdapter
                rust_adapter = RustToolAdapter(rust_client=self._rust_client)
                for tool in registry.list(kind=ToolKind.RUST):
                    registry.register(tool, adapter=rust_adapter, allow_override=True)
            sec_policy = ToolSecurityPolicy(action_validator=self.action_validator)
            self._tool_runtime = UnifiedToolRuntime(
                registry=registry,
                security_policy=sec_policy,
            )
        return self._tool_runtime

    @property
    def rust_client(self) -> RustCapabilityClient:
        if self._rust_client is None:
            self._rust_client = get_capability_client()
        return self._rust_client

    @property
    def model_router(self) -> ModelRouter:
        if self._model_router is None:
            self._model_router = get_router()
        return self._model_router

    @property
    def ai_runtime(self) -> AIModelRuntime:
        if self._ai_runtime is None:
            self._ai_runtime = get_runtime()
        return self._ai_runtime

    @property
    def action_validator(self) -> ActionValidator:
        if self._action_validator is None:
            self._action_validator = ActionValidator()
        return self._action_validator

    def execute_step(
        self,
        step: PlanStep,
        state: AgentState,
        confirmed: bool = False,
    ) -> StepObservation:
        """
        Execute a plan step with security validation and produce a StepObservation.
        """
        start_time = time.perf_counter()
        step.mark_executing()

        try:
            # 1. Resolve variable interpolations in input_parameters from state blackboard
            resolved_params = self._resolve_parameters(step.input_parameters, state)

            # 2. Route AI Model reasoning if step is model-driven
            if step.model_requirement or (step.tool_requirement and step.tool_requirement.startswith("model:")):
                obs = self._execute_model_inference(resolved_params, step, state, start_time)
            elif step.tool_requirement:
                # 3. Route executable capabilities through Unified Tool Runtime
                obs = self._execute_via_tool_runtime(step, resolved_params, state, confirmed, start_time)
            else:
                # 4. Default observation if step is a pure data/blackboard step
                obs = StepObservation(
                    step_id=step.step_id,
                    task_id=state.task.task_id,
                    success=True,
                    output=resolved_params,
                    duration_ms=(time.perf_counter() - start_time) * 1000.0,
                )

            # Update step status based on observation
            if obs.success:
                step.mark_completed(obs.output)
            elif not obs.metadata.get("waiting_confirmation"):
                step.mark_failed(obs.error or "Step execution failed")

            return obs

        except Exception as e:
            err_msg = str(e)
            step.mark_failed(err_msg)
            return StepObservation(
                step_id=step.step_id,
                task_id=state.task.task_id,
                success=False,
                error=err_msg,
                duration_ms=(time.perf_counter() - start_time) * 1000.0,
            )

    def _execute_via_tool_runtime(
        self,
        step: PlanStep,
        parameters: Dict[str, Any],
        state: AgentState,
        confirmed: bool,
        start_time: float,
    ) -> StepObservation:
        """Execute tool capability through the Unified Tool Runtime."""
        tool_req = ToolRequest(
            tool_id=step.tool_requirement,
            parameters=parameters,
            request_id=step.correlation_id or str(uuid.uuid4()),
            task_id=state.task.task_id,
            step_id=step.step_id,
            timeout=step.timeout,
            metadata={"objective": step.objective},
        )

        res: ToolResult = self.tool_runtime.execute(tool_req, confirmed=confirmed)
        duration_ms = (time.perf_counter() - start_time) * 1000.0

        if res.error_type == ToolErrorType.CONFIRMATION_REQUIRED:
            conf_id = res.metadata.get("confirmation_id") or f"conf_{uuid.uuid4().hex[:8]}"
            msg = res.metadata.get("message") or res.error or "Action requires user confirmation"
            step.mark_waiting_confirmation({
                "confirmation_id": conf_id,
                "message": msg,
                "parameters": parameters,
            })
            state.add_pending_confirmation(conf_id, {
                "step_id": step.step_id,
                "task_id": state.task.task_id,
                "message": msg,
                "parameters": parameters,
            })
            return StepObservation(
                step_id=step.step_id,
                task_id=state.task.task_id,
                success=False,
                error="Waiting for user confirmation",
                duration_ms=duration_ms,
                tool_used=step.tool_requirement,
                correlation_id=step.correlation_id,
                metadata={"waiting_confirmation": True, "confirmation_id": conf_id, "message": msg},
            )

        is_sec_blocked = (res.error_type in (ToolErrorType.SECURITY_DENIED, ToolErrorType.OFFLINE_VIOLATION))

        rust_resp = res.metadata.get("rust_response")
        if rust_resp is None and step.tool_requirement and "rust" in step.tool_requirement.lower():
            rust_resp = {
                "success": res.success,
                "data": res.output if res.success else None,
                "error": res.metadata.get("rust_error") or {"code": res.error_type.value if res.error_type else "error", "message": res.error or "Rust execution failed"},
            }

        return StepObservation(
            step_id=step.step_id,
            task_id=state.task.task_id,
            success=res.success,
            output=res.output,
            error=res.error,
            duration_ms=duration_ms,
            tool_used=step.tool_requirement,
            correlation_id=step.correlation_id,
            metadata={
                "tool_result": res.to_dict(),
                "security_blocked": is_sec_blocked,
                "rust_response": rust_resp,
            },
        )

    def _execute_model_inference(
        self,
        parameters: Dict[str, Any],
        step: PlanStep,
        state: AgentState,
        start_time: float,
    ) -> StepObservation:
        """Route and execute AI model inference for reasoning/generation."""
        model_req_spec = step.model_requirement or {}
        task_type_str = model_req_spec.get("task_type", "general_chat")
        task_type = TaskType(task_type_str) if task_type_str in TaskType._value2member_map_ else TaskType.GENERAL_CHAT
        
        qual_str = model_req_spec.get("quality", "medium")
        quality = QualityRequirement(qual_str) if qual_str in QualityRequirement._value2member_map_ else QualityRequirement.MEDIUM

        # 1. Query Model Router
        router_req = RoutingRequest(
            task_type=task_type,
            minimum_quality=quality,
            minimum_context_length=model_req_spec.get("min_context", 2048),
            preferred_model=model_req_spec.get("preferred_model"),
            request_id=step.correlation_id,
        )
        decision = self.model_router.route(router_req)

        # 2. Build prompt from parameters or objective
        prompt = parameters.get("prompt") or step.objective
        if "context" in parameters:
            prompt = f"Context:\n{parameters['context']}\n\nTask:\n{prompt}"

        # 3. Call AI Runtime
        gen_req = GenerationRequest(
            model_id=decision.selected_model_id,
            prompt=prompt,
            max_tokens=parameters.get("max_tokens", 2048),
            temperature=parameters.get("temperature", 0.7),
            task_id=step.correlation_id,
        )
        gen_resp = self.ai_runtime.generate(gen_req)
        duration_ms = (time.perf_counter() - start_time) * 1000.0

        return StepObservation(
            step_id=step.step_id,
            task_id=state.task.task_id,
            success=True,
            output=gen_resp.text,
            duration_ms=duration_ms,
            model_used=decision.selected_model_id,
            correlation_id=step.correlation_id,
            metadata={
                "routing_decision": decision.to_dict(),
                "latency_ms": gen_resp.latency_ms,
            },
        )

    def _resolve_parameters(self, params: Dict[str, Any], state: AgentState) -> Dict[str, Any]:
        """Resolve ${var_name} or ${step_id.output} references from blackboard."""
        resolved: Dict[str, Any] = {}
        for k, v in params.items():
            if isinstance(v, str) and v.startswith("${") and v.endswith("}"):
                var_key = v[2:-1].strip()
                if "." in var_key:
                    parts = var_key.split(".", 1)
                    s_id, attr = parts[0], parts[1]
                    obs = state.observations.get(s_id)
                    if obs:
                        resolved[k] = getattr(obs, attr, obs.get(attr) if isinstance(obs, dict) else None)
                    else:
                        resolved[k] = v
                else:
                    resolved[k] = state.get_variable(var_key, v)
            else:
                resolved[k] = v
        return resolved
