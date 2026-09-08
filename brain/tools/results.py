"""
Canonical Tool Result and Error Types
Encapsulates structured execution outcomes across all tool kinds without leaking raw exceptions.
"""

from enum import Enum
from typing import Dict, Any, Optional
from dataclasses import dataclass, field


class ToolErrorType(Enum):
    """Structured error classifications for tool execution failures."""
    VALIDATION_ERROR = "validation_error"
    NOT_FOUND = "not_found"
    UNAVAILABLE = "unavailable"
    TIMEOUT = "timeout"
    CANCELLED = "cancelled"
    SECURITY_DENIED = "security_denied"
    CONFIRMATION_REQUIRED = "confirmation_required"
    EXECUTION_ERROR = "execution_error"
    PROTOCOL_ERROR = "protocol_error"
    OFFLINE_VIOLATION = "offline_violation"
    UNSUPPORTED_OPERATION = "unsupported_operation"


@dataclass
class ToolResult:
    """
    Canonical execution outcome returned from any tool execution.
    """
    request_id: str
    tool_id: str
    success: bool
    output: Any = None
    error: Optional[str] = None
    error_type: Optional[ToolErrorType] = None
    duration_ms: float = 0.0
    metadata: Dict[str, Any] = field(default_factory=dict)

    @classmethod
    def ok(
        cls,
        request_id: str,
        tool_id: str,
        output: Any,
        duration_ms: float = 0.0,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> "ToolResult":
        return cls(
            request_id=request_id,
            tool_id=tool_id,
            success=True,
            output=output,
            error=None,
            error_type=None,
            duration_ms=duration_ms,
            metadata=metadata or {},
        )

    @classmethod
    def fail(
        cls,
        request_id: str,
        tool_id: str,
        error: str,
        error_type: ToolErrorType = ToolErrorType.EXECUTION_ERROR,
        duration_ms: float = 0.0,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> "ToolResult":
        return cls(
            request_id=request_id,
            tool_id=tool_id,
            success=False,
            output=None,
            error=error,
            error_type=error_type,
            duration_ms=duration_ms,
            metadata=metadata or {},
        )

    def to_dict(self) -> Dict[str, Any]:
        return {
            "request_id": self.request_id,
            "tool_id": self.tool_id,
            "success": self.success,
            "output": self.output,
            "error": self.error,
            "error_type": self.error_type.value if self.error_type else None,
            "duration_ms": self.duration_ms,
            "metadata": self.metadata,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "ToolResult":
        err_type_str = data.get("error_type")
        err_type = ToolErrorType(err_type_str) if err_type_str in ToolErrorType._value2member_map_ else None
        return cls(
            request_id=data["request_id"],
            tool_id=data["tool_id"],
            success=data.get("success", False),
            output=data.get("output"),
            error=data.get("error"),
            error_type=err_type,
            duration_ms=float(data.get("duration_ms", 0.0)),
            metadata=data.get("metadata", {}),
        )
