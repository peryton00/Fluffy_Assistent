"""
Task-Scoped Agent State
Maintains execution progress, observations, and blackboard variables for a specific task.
"""

import time
from dataclasses import dataclass, field
from typing import Dict, Any, Optional, List, TYPE_CHECKING

from brain.agent.task import AgentTask

if TYPE_CHECKING:
    from brain.agent.plan import AgentPlan
    from brain.agent.observation import StepObservation


@dataclass
class AgentState:
    """
    Task-scoped state container.
    Decoupled from global singletons to allow concurrent task execution and persistence.
    """
    task: AgentTask
    plan: Optional["AgentPlan"] = None
    current_step_id: Optional[str] = None
    completed_steps: List[str] = field(default_factory=list)
    failed_steps: List[str] = field(default_factory=list)
    observations: Dict[str, Any] = field(default_factory=dict)
    variables: Dict[str, Any] = field(default_factory=dict)
    artifacts: List[Dict[str, Any]] = field(default_factory=list)
    pending_confirmations: Dict[str, Dict[str, Any]] = field(default_factory=dict)
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)

    def set_variable(self, key: str, value: Any) -> None:
        """Store a variable in the blackboard."""
        self.variables[key] = value
        self.updated_at = time.time()

    def get_variable(self, key: str, default: Any = None) -> Any:
        """Retrieve a variable from the blackboard."""
        return self.variables.get(key, default)

    def record_observation(self, observation: Any) -> None:
        """Record a structured step observation."""
        step_id = getattr(observation, "step_id", str(observation.get("step_id") if isinstance(observation, dict) else ""))
        if step_id:
            self.observations[step_id] = observation
            if getattr(observation, "success", False) or (isinstance(observation, dict) and observation.get("success")):
                if step_id not in self.completed_steps:
                    self.completed_steps.append(step_id)
            else:
                if step_id not in self.failed_steps:
                    self.failed_steps.append(step_id)
        self.updated_at = time.time()

    def add_pending_confirmation(self, confirmation_id: str, payload: Dict[str, Any]) -> None:
        """Store pending confirmation metadata."""
        self.pending_confirmations[confirmation_id] = payload
        self.updated_at = time.time()

    def resolve_confirmation(self, confirmation_id: str) -> Optional[Dict[str, Any]]:
        """Remove and return a resolved confirmation."""
        result = self.pending_confirmations.pop(confirmation_id, None)
        self.updated_at = time.time()
        return result

    def to_dict(self) -> Dict[str, Any]:
        """Serialize state for persistence."""
        plan_dict = self.plan.to_dict() if self.plan and hasattr(self.plan, "to_dict") else None
        obs_dict = {
            k: (v.to_dict() if hasattr(v, "to_dict") else v)
            for k, v in self.observations.items()
        }
        return {
            "task": self.task.to_dict(),
            "plan": plan_dict,
            "current_step_id": self.current_step_id,
            "completed_steps": list(self.completed_steps),
            "failed_steps": list(self.failed_steps),
            "observations": obs_dict,
            "variables": self.variables,
            "artifacts": self.artifacts,
            "pending_confirmations": self.pending_confirmations,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }
