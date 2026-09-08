"""
Plan Step Model & Lifecycle Status
Defines atomic units of agent execution with explicit dependency requirements.
"""

import time
import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, Any, Optional, List


class StepStatus(str, Enum):
    """Lifecycle state of an individual plan step."""
    PENDING = "pending"
    READY = "ready"
    EXECUTING = "executing"
    WAITING_CONFIRMATION = "waiting_confirmation"
    WAITING = "waiting"
    COMPLETED = "completed"
    FAILED = "failed"
    SKIPPED = "skipped"
    CANCELLED = "cancelled"


@dataclass
class PlanStep:
    """
    An atomic executable action within an AgentPlan.
    """
    objective: str
    step_id: str = field(default_factory=lambda: f"step_{uuid.uuid4().hex[:8]}")
    description: Optional[str] = None
    dependencies: List[str] = field(default_factory=list)
    status: StepStatus = StepStatus.PENDING
    tool_requirement: Optional[str] = None       # e.g., "rust:System.GetHardware", "tool:web_search"
    model_requirement: Optional[Dict[str, Any]] = None  # e.g., {"task_type": "reasoning", "quality": "high"}
    input_parameters: Dict[str, Any] = field(default_factory=dict)
    output: Optional[Any] = None
    attempt_count: int = 0
    timeout: float = 30.0
    created_at: float = field(default_factory=time.time)
    completed_at: Optional[float] = None
    error: Optional[str] = None
    correlation_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    metadata: Dict[str, Any] = field(default_factory=dict)

    def __post_init__(self):
        if not self.description:
            self.description = self.objective

    @property
    def is_terminal(self) -> bool:
        """Check if step has reached terminal status."""
        return self.status in (StepStatus.COMPLETED, StepStatus.FAILED, StepStatus.SKIPPED, StepStatus.CANCELLED)

    def mark_ready(self) -> None:
        """Transition step to READY."""
        if self.status == StepStatus.PENDING:
            self.status = StepStatus.READY

    def mark_executing(self) -> None:
        """Transition step to EXECUTING and bump attempt count."""
        self.status = StepStatus.EXECUTING
        self.attempt_count += 1

    def mark_completed(self, output: Any) -> None:
        """Transition step to COMPLETED with output payload."""
        self.status = StepStatus.COMPLETED
        self.output = output
        self.completed_at = time.time()

    def mark_failed(self, error: str) -> None:
        """Transition step to FAILED with error message."""
        self.status = StepStatus.FAILED
        self.error = error
        self.completed_at = time.time()

    def mark_waiting_confirmation(self, details: Optional[Dict[str, Any]] = None) -> None:
        """Transition step to WAITING_CONFIRMATION."""
        self.status = StepStatus.WAITING_CONFIRMATION
        if details:
            self.metadata["confirmation_details"] = details

    def to_dict(self) -> Dict[str, Any]:
        """Serialize step for transport or storage."""
        return {
            "step_id": self.step_id,
            "objective": self.objective,
            "description": self.description,
            "dependencies": list(self.dependencies),
            "status": self.status.value,
            "tool_requirement": self.tool_requirement,
            "model_requirement": self.model_requirement,
            "input_parameters": self.input_parameters,
            "output": self.output,
            "attempt_count": self.attempt_count,
            "timeout": self.timeout,
            "created_at": self.created_at,
            "completed_at": self.completed_at,
            "error": self.error,
            "correlation_id": self.correlation_id,
            "metadata": self.metadata,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "PlanStep":
        """Reconstruct PlanStep from dictionary."""
        return cls(
            objective=data["objective"],
            step_id=data["step_id"],
            description=data.get("description"),
            dependencies=list(data.get("dependencies", [])),
            status=StepStatus(data.get("status", StepStatus.PENDING.value)),
            tool_requirement=data.get("tool_requirement"),
            model_requirement=data.get("model_requirement"),
            input_parameters=data.get("input_parameters", {}),
            output=data.get("output"),
            attempt_count=data.get("attempt_count", 0),
            timeout=data.get("timeout", 30.0),
            created_at=data.get("created_at", time.time()),
            completed_at=data.get("completed_at"),
            error=data.get("error"),
            correlation_id=data.get("correlation_id", str(uuid.uuid4())),
            metadata=data.get("metadata", {}),
        )
