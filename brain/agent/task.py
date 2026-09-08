"""
Agent Task Data Structure & Lifecycle State Machine
Defines typed task representations and strict transition validation.
"""

import time
import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, Any, Optional, Set


class TaskStatus(str, Enum):
    """Explicit lifecycle states for an AgentTask."""
    CREATED = "created"
    ANALYZING = "analyzing"
    PLANNING = "planning"
    READY = "ready"
    EXECUTING = "executing"
    WAITING_CONFIRMATION = "waiting_confirmation"
    WAITING = "waiting"
    PAUSED = "paused"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


# Explicit valid state transition matrix
_VALID_TRANSITIONS: Dict[TaskStatus, Set[TaskStatus]] = {
    TaskStatus.CREATED: {TaskStatus.ANALYZING, TaskStatus.PLANNING, TaskStatus.READY, TaskStatus.FAILED, TaskStatus.CANCELLED},
    TaskStatus.ANALYZING: {TaskStatus.PLANNING, TaskStatus.READY, TaskStatus.FAILED, TaskStatus.CANCELLED},
    TaskStatus.PLANNING: {TaskStatus.READY, TaskStatus.EXECUTING, TaskStatus.FAILED, TaskStatus.CANCELLED},
    TaskStatus.READY: {TaskStatus.EXECUTING, TaskStatus.PAUSED, TaskStatus.FAILED, TaskStatus.CANCELLED},
    TaskStatus.EXECUTING: {
        TaskStatus.WAITING_CONFIRMATION,
        TaskStatus.WAITING,
        TaskStatus.PAUSED,
        TaskStatus.COMPLETED,
        TaskStatus.FAILED,
        TaskStatus.CANCELLED,
    },
    TaskStatus.WAITING_CONFIRMATION: {TaskStatus.EXECUTING, TaskStatus.CANCELLED, TaskStatus.FAILED},
    TaskStatus.WAITING: {TaskStatus.EXECUTING, TaskStatus.PAUSED, TaskStatus.CANCELLED, TaskStatus.FAILED},
    TaskStatus.PAUSED: {TaskStatus.READY, TaskStatus.EXECUTING, TaskStatus.CANCELLED},
    TaskStatus.COMPLETED: set(),
    TaskStatus.FAILED: set(),
    TaskStatus.CANCELLED: set(),
}


@dataclass
class AgentTask:
    """
    Task-scoped container representing a user goal or instruction for orchestration.
    """
    user_request: str
    goal: Optional[str] = None
    task_id: str = field(default_factory=lambda: f"task_{uuid.uuid4().hex[:10]}")
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)
    status: TaskStatus = TaskStatus.CREATED
    priority: int = 1
    constraints: Dict[str, Any] = field(default_factory=dict)
    context: Dict[str, Any] = field(default_factory=dict)
    metadata: Dict[str, Any] = field(default_factory=dict)
    correlation_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    error: Optional[str] = None

    def __post_init__(self):
        if not self.goal:
            self.goal = self.user_request

    def transition_to(self, target_status: TaskStatus, reason: str = "") -> None:
        """
        Transition task to a new lifecycle status.
        Raises ValueError if the transition is illegal.
        """
        allowed = _VALID_TRANSITIONS.get(self.status, set())
        if target_status not in allowed:
            raise ValueError(
                f"Invalid task state transition from '{self.status.value}' to '{target_status.value}'. "
                f"Allowed transitions: {[s.value for s in allowed]}"
            )
        self.status = target_status
        self.updated_at = time.time()
        if reason:
            self.metadata["last_transition_reason"] = reason

    @property
    def is_terminal(self) -> bool:
        """Check if task is in a terminal state."""
        return self.status in (TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.CANCELLED)

    def to_dict(self) -> Dict[str, Any]:
        """Serialize task for storage or diagnostics."""
        return {
            "task_id": self.task_id,
            "user_request": self.user_request,
            "goal": self.goal,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "status": self.status.value,
            "priority": self.priority,
            "constraints": self.constraints,
            "context": self.context,
            "metadata": self.metadata,
            "correlation_id": self.correlation_id,
            "error": self.error,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "AgentTask":
        """Reconstruct AgentTask from serialized dictionary."""
        task = cls(
            user_request=data["user_request"],
            goal=data.get("goal"),
            task_id=data["task_id"],
            created_at=data.get("created_at", time.time()),
            updated_at=data.get("updated_at", time.time()),
            status=TaskStatus(data.get("status", TaskStatus.CREATED.value)),
            priority=data.get("priority", 1),
            constraints=data.get("constraints", {}),
            context=data.get("context", {}),
            metadata=data.get("metadata", {}),
            correlation_id=data.get("correlation_id", str(uuid.uuid4())),
            error=data.get("error"),
        )
        return task
