"""
Agent Orchestration Interfaces & Result Types
Defines abstract orchestrator protocol and structured execution results.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Dict, Any, Optional

from brain.agent.state import AgentState
from brain.agent.task import AgentTask, TaskStatus
from brain.agent.plan import AgentPlan


@dataclass
class AgentResult:
    """
    Final or intermediate execution result produced by the Agent Orchestrator.
    """
    task_id: str
    status: TaskStatus
    success: bool
    summary: str
    observations: Dict[str, Any] = field(default_factory=dict)
    duration_ms: float = 0.0
    state: Optional[AgentState] = None
    waiting_confirmation: bool = False
    confirmation_id: Optional[str] = None
    confirmation_message: Optional[str] = None
    error: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert result to dictionary."""
        return {
            "task_id": self.task_id,
            "status": self.status.value,
            "success": self.success,
            "summary": self.summary,
            "observations": {
                k: (v.to_dict() if hasattr(v, "to_dict") else v)
                for k, v in self.observations.items()
            },
            "duration_ms": round(self.duration_ms, 2),
            "waiting_confirmation": self.waiting_confirmation,
            "confirmation_id": self.confirmation_id,
            "confirmation_message": self.confirmation_message,
            "error": self.error,
        }


class AgentOrchestratorInterface(ABC):
    """
    Abstract contract for agent orchestration engines.
    """

    @abstractmethod
    def run(self, task: AgentTask, plan: Optional[AgentPlan] = None) -> AgentResult:
        """Execute a task, optionally using a pre-constructed/validated plan."""
        pass

    @abstractmethod
    def resume(self, task_id: str, confirmed: bool, confirmation_id: Optional[str] = None) -> AgentResult:
        """Resume a task that was waiting for confirmation."""
        pass

    @abstractmethod
    def cancel(self, task_id: str) -> bool:
        """Cancel an in-flight or waiting task."""
        pass

    @abstractmethod
    def get_state(self, task_id: str) -> Optional[AgentState]:
        """Retrieve task-scoped state."""
        pass
