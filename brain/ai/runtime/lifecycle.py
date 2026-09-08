"""
Model Lifecycle Management Module
Defines explicit model lifecycle states and tracks state transitions.
"""

import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, List, Optional, Any


class ModelLifecycleState(str, Enum):
    """Explicit lifecycle states for AI models."""
    AVAILABLE = "available"      # Model is registered and present on disk, but not loaded into memory
    LOADING = "loading"          # Model weights are actively being loaded into RAM/VRAM
    LOADED = "loaded"            # Model is resident in memory
    READY = "ready"              # Model is initialized and ready to accept inference requests
    UNLOADING = "unloading"      # Model is actively being released from memory
    FAILED = "failed"            # Model failed to load
    ERROR = "error"              # Runtime error encountered during inference
    UNLOADED = "unloaded"        # Model has been cleanly unloaded


@dataclass(frozen=True)
class LifecycleEvent:
    """Structured telemetry event recording model state transitions."""
    event_type: str
    model_id: str
    state: ModelLifecycleState
    timestamp: float = field(default_factory=time.time)
    details: Optional[Dict[str, Any]] = None


class ModelLifecycleTracker:
    """
    Tracks and validates model lifecycle states.
    Maintains transition histories for telemetry and debugging.
    """

    def __init__(self):
        self._states: Dict[str, ModelLifecycleState] = {}
        self._events: List[LifecycleEvent] = []

    def get_state(self, model_id: str) -> ModelLifecycleState:
        """Get current lifecycle state for a model."""
        return self._states.get(model_id, ModelLifecycleState.AVAILABLE)

    def transition(
        self,
        model_id: str,
        target_state: ModelLifecycleState,
        details: Optional[Dict[str, Any]] = None,
    ) -> LifecycleEvent:
        """
        Record a state transition.
        Logs structured telemetry event and updates tracking map.
        """
        self._states[model_id] = target_state
        event = LifecycleEvent(
            event_type=f"model_{target_state.value}",
            model_id=model_id,
            state=target_state,
            timestamp=time.time(),
            details=details or {},
        )
        self._events.append(event)
        # Cap event history to avoid unbounded memory growth
        if len(self._events) > 500:
            self._events = self._events[-500:]
        return event

    def get_events(self, model_id: Optional[str] = None) -> List[LifecycleEvent]:
        """Get recent lifecycle events, optionally filtered by model."""
        if model_id:
            return [e for e in self._events if e.model_id == model_id]
        return list(self._events)


# Global singleton instance
_lifecycle_tracker: Optional[ModelLifecycleTracker] = None


def get_lifecycle_tracker() -> ModelLifecycleTracker:
    """Get or create the global ModelLifecycleTracker instance."""
    global _lifecycle_tracker
    if _lifecycle_tracker is None:
        _lifecycle_tracker = ModelLifecycleTracker()
    return _lifecycle_tracker

