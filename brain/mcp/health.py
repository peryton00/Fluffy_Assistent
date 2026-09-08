"""
Model Context Protocol (MCP) Server Health Tracking
"""

from typing import Dict, Any, Optional
from dataclasses import dataclass, field
import time


@dataclass
class MCPServerHealth:
    """Diagnostic health information for an active MCP server connection."""
    server_id: str
    is_connected: bool = False
    latency_ms: float = 0.0
    tool_count: int = 0
    last_error: Optional[str] = None
    last_checked: float = field(default_factory=time.time)
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "server_id": self.server_id,
            "is_connected": self.is_connected,
            "latency_ms": self.latency_ms,
            "tool_count": self.tool_count,
            "last_error": self.last_error,
            "last_checked": self.last_checked,
            "metadata": self.metadata,
        }
