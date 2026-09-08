"""
Step Observation Model
Structured output produced after a plan step finishes execution.
"""

import time
import uuid
from dataclasses import dataclass, field
from typing import Dict, Any, Optional


@dataclass
class StepObservation:
    """
    Structured observation produced by executing an atomic PlanStep.
    Contains raw output, errors, latency, and telemetry correlation metadata.
    """
    step_id: str
    task_id: str
    success: bool
    output: Any = None
    error: Optional[str] = None
    duration_ms: float = 0.0
    tool_used: Optional[str] = None
    model_used: Optional[str] = None
    correlation_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    metadata: Dict[str, Any] = field(default_factory=dict)
    timestamp: float = field(default_factory=time.time)

    def to_dict(self) -> Dict[str, Any]:
        """Serialize observation for storage and telemetry."""
        return {
            "step_id": self.step_id,
            "task_id": self.task_id,
            "success": self.success,
            "output": self.output,
            "error": self.error,
            "duration_ms": round(self.duration_ms, 2),
            "tool_used": self.tool_used,
            "model_used": self.model_used,
            "correlation_id": self.correlation_id,
            "metadata": self.metadata,
            "timestamp": self.timestamp,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "StepObservation":
        """Reconstruct StepObservation from dictionary."""
        return cls(
            step_id=data["step_id"],
            task_id=data["task_id"],
            success=data.get("success", False),
            output=data.get("output"),
            error=data.get("error"),
            duration_ms=data.get("duration_ms", 0.0),
            tool_used=data.get("tool_used"),
            model_used=data.get("model_used"),
            correlation_id=data.get("correlation_id", str(uuid.uuid4())),
            metadata=data.get("metadata", {}),
            timestamp=data.get("timestamp", time.time()),
        )
