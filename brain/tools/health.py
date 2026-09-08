"""
Tool Health and Diagnostic State
Tracks capability availability, response latency, and error states without invoking destructive operations.
"""

from enum import Enum
from typing import Dict, Any, Optional
from dataclasses import dataclass, field
import time


class ToolHealthStatus(Enum):
    """Health classification for a tool or server."""
    AVAILABLE = "available"
    DEGRADED = "degraded"
    UNAVAILABLE = "unavailable"
    UNKNOWN = "unknown"


@dataclass
class ToolHealth:
    """Diagnostic health state for a tool capability."""
    tool_id: str
    status: ToolHealthStatus = ToolHealthStatus.UNKNOWN
    latency_ms: float = 0.0
    last_error: Optional[str] = None
    last_checked: float = field(default_factory=time.time)
    metadata: Dict[str, Any] = field(default_factory=dict)

    @property
    def is_available(self) -> bool:
        return self.status == ToolHealthStatus.AVAILABLE

    def to_dict(self) -> Dict[str, Any]:
        return {
            "tool_id": self.tool_id,
            "status": self.status.value,
            "latency_ms": self.latency_ms,
            "last_error": self.last_error,
            "last_checked": self.last_checked,
            "metadata": self.metadata,
        }
