"""
Agent Plan Model & Plan Validator
Defines structured plan representations and deterministic dependency DAG validation.
"""

import time
import uuid
from dataclasses import dataclass, field
from typing import Dict, Any, Optional, List, Tuple, Set

from brain.agent.step import PlanStep, StepStatus


@dataclass
class AgentPlan:
    """
    Structured plan containing sequenced or dependency-linked steps to accomplish a task.
    """
    task_id: str
    goal: str
    steps: List[PlanStep] = field(default_factory=list)
    plan_id: str = field(default_factory=lambda: f"plan_{uuid.uuid4().hex[:8]}")
    created_at: float = field(default_factory=time.time)
    metadata: Dict[str, Any] = field(default_factory=dict)

    def get_step(self, step_id: str) -> Optional[PlanStep]:
        """Lookup step by ID."""
        for step in self.steps:
            if step.step_id == step_id:
                return step
        return None

    def get_ready_steps(self, completed_step_ids: Set[str]) -> List[PlanStep]:
        """
        Return all steps whose dependencies are fully satisfied and are not yet executed.
        """
        ready: List[PlanStep] = []
        for step in self.steps:
            if step.status in (StepStatus.PENDING, StepStatus.READY):
                # Check if all declared dependencies have completed
                deps_met = all(dep in completed_step_ids for dep in step.dependencies)
                if deps_met:
                    step.mark_ready()
                    ready.append(step)
        return ready

    def is_all_completed(self) -> bool:
        """Check if every step has completed or skipped."""
        return len(self.steps) > 0 and all(
            s.status in (StepStatus.COMPLETED, StepStatus.SKIPPED) for s in self.steps
        )

    def has_failed_steps(self) -> bool:
        """Check if any step in the plan has permanently failed."""
        return any(s.status == StepStatus.FAILED for s in self.steps)

    def to_dict(self) -> Dict[str, Any]:
        """Serialize plan to dictionary."""
        return {
            "plan_id": self.plan_id,
            "task_id": self.task_id,
            "goal": self.goal,
            "steps": [s.to_dict() for s in self.steps],
            "created_at": self.created_at,
            "metadata": self.metadata,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "AgentPlan":
        """Reconstruct AgentPlan from dictionary."""
        steps = [PlanStep.from_dict(s) for s in data.get("steps", [])]
        return cls(
            task_id=data["task_id"],
            goal=data["goal"],
            steps=steps,
            plan_id=data.get("plan_id", f"plan_{uuid.uuid4().hex[:8]}"),
            created_at=data.get("created_at", time.time()),
            metadata=data.get("metadata", {}),
        )


class PlanValidator:
    """
    Validates plan structure, dependency DAG consistency, and resource bounds.
    """

    @classmethod
    def validate(cls, plan: AgentPlan, max_steps: int = 20) -> Tuple[bool, Optional[str]]:
        """
        Validate an AgentPlan for structural correctness and acyclicity.
        Returns (is_valid: bool, error_message: Optional[str]).
        """
        if not plan.steps:
            return False, "Plan contains no steps."

        if len(plan.steps) > max_steps:
            return False, f"Plan exceeds maximum allowed steps limit ({len(plan.steps)} > {max_steps})."

        step_ids: Set[str] = set()
        for step in plan.steps:
            if not step.step_id:
                return False, "Plan contains a step with an empty step_id."
            if step.step_id in step_ids:
                return False, f"Duplicate step_id detected in plan: '{step.step_id}'."
            step_ids.add(step.step_id)

        # Verify all dependencies reference existing steps
        for step in plan.steps:
            for dep in step.dependencies:
                if dep not in step_ids:
                    return False, f"Step '{step.step_id}' depends on non-existent step '{dep}'."
                if dep == step.step_id:
                    return False, f"Step '{step.step_id}' cannot depend on itself."

        # Cycle detection using topological sort (Kahn's Algorithm)
        in_degree: Dict[str, int] = {s.step_id: 0 for s in plan.steps}
        adj_list: Dict[str, List[str]] = {s.step_id: [] for s in plan.steps}

        for step in plan.steps:
            for dep in step.dependencies:
                adj_list[dep].append(step.step_id)
                in_degree[step.step_id] += 1

        queue = [s_id for s_id, deg in in_degree.items() if deg == 0]
        visited_count = 0

        while queue:
            node = queue.pop(0)
            visited_count += 1
            for neighbor in adj_list[node]:
                in_degree[neighbor] -= 1
                if in_degree[neighbor] == 0:
                    queue.append(neighbor)

        if visited_count != len(plan.steps):
            return False, "Cyclic dependency detected in plan steps."

        return True, None
