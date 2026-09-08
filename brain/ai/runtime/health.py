"""
Runtime Health Module
Provides structured health diagnostics for the local AI runtime.
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, List, Optional, Any


class HealthStatus(str, Enum):
    """Overall status indicator."""
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    UNHEALTHY = "unhealthy"
    OFFLINE = "offline"


@dataclass
class ComponentHealth:
    """Health check for an individual AI component."""
    name: str
    status: HealthStatus
    message: str
    details: Dict[str, Any] = field(default_factory=dict)


@dataclass
class RuntimeHealth:
    """
    Comprehensive runtime health diagnostics report.
    Feeds UI status indicators and system observability.
    """
    status: HealthStatus
    runtime_available: bool
    backend_available: bool
    backend_id: Optional[str]
    loaded_models: List[str]
    hardware_accelerator: str
    memory_pressure: str             # "low", "medium", "high"
    last_inference_timestamp: Optional[float] = None
    error_state: Optional[str] = None
    components: List[ComponentHealth] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        """Serialize health report to dictionary."""
        return {
            "status": self.status.value,
            "runtime_available": self.runtime_available,
            "backend_available": self.backend_available,
            "backend_id": self.backend_id,
            "loaded_models": self.loaded_models,
            "hardware_accelerator": self.hardware_accelerator,
            "memory_pressure": self.memory_pressure,
            "last_inference_timestamp": self.last_inference_timestamp,
            "error_state": self.error_state,
            "components": [
                {
                    "name": c.name,
                    "status": c.status.value,
                    "message": c.message,
                    "details": c.details,
                }
                for c in self.components
            ],
        }
