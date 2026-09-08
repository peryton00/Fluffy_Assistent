"""
Runtime package for Fluffy AI.
"""

from brain.ai.runtime.interface import (
    AIModelRuntime,
    GenerationRequest,
    GenerationResponse,
    GenerationChunk,
    CancellationHandle,
)
from brain.ai.runtime.lifecycle import (
    ModelLifecycleState,
    LifecycleEvent,
    ModelLifecycleTracker,
    get_lifecycle_tracker,
)
from brain.ai.runtime.health import (
    HealthStatus,
    ComponentHealth,
    RuntimeHealth,
)
from brain.ai.runtime.manager import (
    RuntimeManager,
    get_runtime,
    set_runtime,
)

__all__ = [
    "AIModelRuntime",
    "GenerationRequest",
    "GenerationResponse",
    "GenerationChunk",
    "CancellationHandle",
    "ModelLifecycleState",
    "LifecycleEvent",
    "ModelLifecycleTracker",
    "get_lifecycle_tracker",
    "HealthStatus",
    "ComponentHealth",
    "RuntimeHealth",
    "RuntimeManager",
    "get_runtime",
    "set_runtime",
]
