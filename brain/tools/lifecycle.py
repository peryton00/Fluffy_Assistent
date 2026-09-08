"""
Tool Lifecycle Management and Event System
Defines lifecycle transitions and transport-neutral tool lifecycle events.
"""

from enum import Enum
from typing import Dict, Any, Optional, Callable, List
from dataclasses import dataclass, field
import time


class ToolLifecycleState(Enum):
    """Lifecycle stages for registered tools or server connections."""
    REGISTERED = "registered"
    INITIALIZING = "initializing"
    READY = "ready"
    DEGRADED = "degraded"
    DISABLED = "disabled"
    STOPPING = "stopping"
    STOPPED = "stopped"
    FAILED = "failed"


class ToolEventType(Enum):
    """Structured event types emitted by the Tool Runtime."""
    TOOL_REGISTERED = "tool_registered"
    TOOL_UNREGISTERED = "tool_unregistered"
    TOOL_DISCOVERED = "tool_discovered"
    TOOL_SELECTED = "tool_selected"
    TOOL_EXECUTION_STARTED = "tool_execution_started"
    TOOL_EXECUTION_COMPLETED = "tool_execution_completed"
    TOOL_EXECUTION_FAILED = "tool_execution_failed"
    TOOL_CONFIRMATION_REQUIRED = "tool_confirmation_required"
    TOOL_HEALTH_CHANGED = "tool_health_changed"
    MCP_SERVER_STARTED = "mcp_server_started"
    MCP_SERVER_STOPPED = "mcp_server_stopped"
    MCP_SERVER_FAILED = "mcp_server_failed"


@dataclass
class ToolEvent:
    """Structured, transport-neutral tool runtime event."""
    event_type: ToolEventType
    tool_id: Optional[str] = None
    request_id: Optional[str] = None
    timestamp: float = field(default_factory=time.time)
    payload: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "event_type": self.event_type.value,
            "tool_id": self.tool_id,
            "request_id": self.request_id,
            "timestamp": self.timestamp,
            "payload": self.payload,
        }


class ToolEventEmitter:
    """Pub/sub dispatcher for ToolEvents."""

    def __init__(self):
        self._subscribers: List[Callable[[ToolEvent], None]] = []

    def subscribe(self, callback: Callable[[ToolEvent], None]) -> None:
        self._subscribers.append(callback)

    def unsubscribe(self, callback: Callable[[ToolEvent], None]) -> None:
        if callback in self._subscribers:
            self._subscribers.remove(callback)

    def emit(self, event: ToolEvent) -> None:
        for sub in list(self._subscribers):
            try:
                sub(event)
            except Exception as e:
                # Observers must not crash the tool execution loop
                print(f"[ToolEventEmitter] Subscriber error: {e}")
