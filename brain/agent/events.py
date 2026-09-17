"""
Canonical Execution Event System for Fluffy Assistant
Provides a typed, immutable, transport-neutral execution event stream and bounded in-process event bus.
"""

import threading
import time
import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, Any, Optional, List, Callable


class AgentEventType(str, Enum):
    """Canonical execution lifecycle event types."""
    # Task Lifecycle
    TASK_CREATED = "task_created"
    TASK_STARTED = "task_started"
    TASK_PLANNING_STARTED = "task_planning_started"
    TASK_PAUSED = "task_paused"
    TASK_RESUMED = "task_resumed"
    TASK_COMPLETED = "task_completed"
    TASK_FAILED = "task_failed"
    TASK_CANCELLED = "task_cancelled"

    # Plan Lifecycle
    PLAN_CREATED = "plan_created"
    PLAN_VALIDATED = "plan_validated"
    PLAN_STARTED = "plan_started"
    PLAN_COMPLETED = "plan_completed"

    # Step Lifecycle
    STEP_READY = "step_ready"
    STEP_STARTED = "step_started"
    STEP_WAITING_CONFIRMATION = "step_waiting_confirmation"
    STEP_COMPLETED = "step_completed"
    STEP_FAILED = "step_failed"
    STEP_BLOCKED = "step_blocked"
    STEP_RETRIED = "step_retried"
    STEP_CANCELLED = "step_cancelled"

    # Capability Lifecycle: Tool
    TOOL_SELECTED = "tool_selected"
    TOOL_STARTED = "tool_started"
    TOOL_COMPLETED = "tool_completed"
    TOOL_FAILED = "tool_failed"

    # Capability Lifecycle: Model
    MODEL_SELECTED = "model_selected"
    MODEL_STARTED = "model_started"
    MODEL_COMPLETED = "model_completed"
    MODEL_FAILED = "model_failed"

    # Capability Lifecycle: Knowledge
    KNOWLEDGE_STARTED = "knowledge_started"
    KNOWLEDGE_COMPLETED = "knowledge_completed"
    KNOWLEDGE_FAILED = "knowledge_failed"

    # Capability Lifecycle: Artifact
    ARTIFACT_STARTED = "artifact_started"
    ARTIFACT_COMPLETED = "artifact_completed"
    ARTIFACT_FAILED = "artifact_failed"

    # Confirmation Lifecycle
    CONFIRMATION_REQUIRED = "confirmation_required"
    CONFIRMATION_RESOLVED = "confirmation_resolved"

    # Recovery & Error Handling
    RETRY_STARTED = "retry_started"
    RECOVERY_STARTED = "recovery_started"
    RECOVERY_COMPLETED = "recovery_completed"
    EXECUTION_ERROR = "execution_error"


@dataclass(frozen=True)
class AgentEvent:
    """
    Immutable structured event emitted during canonical agent execution.
    Preserves task, step, and correlation identity without leaking sensitive document content.
    """
    event_type: AgentEventType
    task_id: str
    step_id: Optional[str] = None
    event_id: str = field(default_factory=lambda: f"evt_{uuid.uuid4().hex[:10]}")
    timestamp: float = field(default_factory=time.time)
    status: Optional[str] = None
    source: str = "agent_orchestrator"
    correlation_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    payload: Dict[str, Any] = field(default_factory=dict)

    @property
    def type(self) -> AgentEventType:
        """Alias for event_type for contract conformance."""
        return self.event_type

    def to_dict(self) -> Dict[str, Any]:
        """Serialize event to dictionary."""
        return {
            "event_id": self.event_id,
            "event_type": self.event_type.value,
            "type": self.event_type.value,
            "task_id": self.task_id,
            "step_id": self.step_id,
            "timestamp": self.timestamp,
            "status": self.status,
            "source": self.source,
            "correlation_id": self.correlation_id,
            "payload": self.payload,
        }


class EventEmitter:
    """
    Thread-safe, transport-neutral publisher and bounded in-memory event bus
    for canonical agent execution events.
    """

    def __init__(self, max_history: int = 1000):
        self._listeners: List[Callable[[AgentEvent], None]] = []
        self._history: List[AgentEvent] = []
        self._max_history = max_history
        self._lock = threading.RLock()

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
        """Broadcast an event to all registered listeners and record in bounded history."""
        with self._lock:
            self._history.append(event)
            if len(self._history) > self._max_history:
                self._history = self._history[-self._max_history:]
            listeners = list(self._listeners)

        for listener in listeners:
            try:
                listener(event)
            except Exception:
                # Subscriber exceptions must never interrupt orchestration or execution
                pass

    def get_history(self, task_id: Optional[str] = None) -> List[AgentEvent]:
        """Retrieve chronological history of events, optionally filtered by task_id."""
        with self._lock:
            if task_id is None:
                return list(self._history)
            return [e for e in self._history if e.task_id == task_id]

    def clear_history(self, task_id: Optional[str] = None) -> None:
        """Clear event history globally or for a specific task_id."""
        with self._lock:
            if task_id is None:
                self._history.clear()
            else:
                self._history = [e for e in self._history if e.task_id != task_id]


# Semantic alias for ExecutionEventEmitter
ExecutionEventEmitter = EventEmitter

# Global singleton
_global_event_emitter: Optional[EventEmitter] = None


def get_event_emitter() -> EventEmitter:
    """Retrieve global ExecutionEventEmitter singleton."""
    global _global_event_emitter
    if _global_event_emitter is None:
        _global_event_emitter = EventEmitter()
    return _global_event_emitter


def set_event_emitter(emitter: Optional[EventEmitter]) -> None:
    """Set or reset global ExecutionEventEmitter singleton."""
    global _global_event_emitter
    _global_event_emitter = emitter
