"""
Transport-Neutral Agent Event System
Emits structured telemetry and state change events during agent orchestration.
"""

import time
import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, Any, Optional, List, Callable
import threading


class AgentEventType(str, Enum):
    """Types of events emitted during task lifecycle and orchestration."""
    TASK_CREATED = "task_created"
    TASK_PLANNING_STARTED = "task_planning_started"
    PLAN_CREATED = "plan_created"
    STEP_READY = "step_ready"
    STEP_STARTED = "step_started"
    STEP_WAITING_CONFIRMATION = "step_waiting_confirmation"
    STEP_COMPLETED = "step_completed"
    STEP_FAILED = "step_failed"
    STEP_RETRIED = "step_retried"
    TASK_PAUSED = "task_paused"
    TASK_RESUMED = "task_resumed"
    TASK_COMPLETED = "task_completed"
    TASK_FAILED = "task_failed"
    TASK_CANCELLED = "task_cancelled"
    MODEL_SELECTED = "model_selected"
    TOOL_SELECTED = "tool_selected"


@dataclass(frozen=True)
class AgentEvent:
    """
    Immutable structured event emitted by the agent orchestrator.
    """
    event_type: AgentEventType
    task_id: str
    step_id: Optional[str] = None
    event_id: str = field(default_factory=lambda: f"evt_{uuid.uuid4().hex[:10]}")
    timestamp: float = field(default_factory=time.time)
    correlation_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    payload: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        """Serialize event to dictionary."""
        return {
            "event_id": self.event_id,
            "event_type": self.event_type.value,
            "task_id": self.task_id,
            "step_id": self.step_id,
            "timestamp": self.timestamp,
            "correlation_id": self.correlation_id,
            "payload": self.payload,
        }


class EventEmitter:
    """
    Thread-safe, transport-neutral publisher for agent events.
    Does not depend on any specific UI, WebSocket, or transport layer.
    """

    def __init__(self):
        self._listeners: List[Callable[[AgentEvent], None]] = []
        self._lock = threading.Lock()

    def subscribe(self, listener: Callable[[AgentEvent], None]) -> None:
        """Register an event listener callback."""
        with self._lock:
            if listener not in self._listeners:
                self._listeners.append(listener)

    def unsubscribe(self, listener: Callable[[AgentEvent], None]) -> bool:
        """Unregister an event listener callback."""
        with self._lock:
            if listener in self._listeners:
                self._listeners.remove(listener)
                return True
            return False

    def emit(self, event: AgentEvent) -> None:
        """Broadcast an event to all registered listeners."""
        with self._lock:
            listeners = list(self._listeners)

        for listener in listeners:
            try:
                listener(event)
            except Exception as e:
                # Listener exceptions must not interrupt orchestration
                pass
