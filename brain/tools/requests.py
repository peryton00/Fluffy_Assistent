"""
Canonical Tool Request
Encapsulates a structured, serializable request to execute a tool capability.
"""

from typing import Dict, Any, Optional
from dataclasses import dataclass, field
import uuid


@dataclass
class ToolRequest:
    """
    Serializable tool invocation request.
    Prevents direct execution of arbitrary unstructured model outputs.
    """
    tool_id: str
    parameters: Dict[str, Any] = field(default_factory=dict)
    request_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    task_id: Optional[str] = None
    step_id: Optional[str] = None
    timeout: Optional[float] = None
    dry_run: bool = False
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "request_id": self.request_id,
            "tool_id": self.tool_id,
            "parameters": self.parameters,
            "task_id": self.task_id,
            "step_id": self.step_id,
            "timeout": self.timeout,
            "dry_run": self.dry_run,
            "metadata": self.metadata,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "ToolRequest":
        return cls(
            tool_id=data["tool_id"],
            parameters=data.get("parameters", {}),
            request_id=data.get("request_id") or str(uuid.uuid4()),
            task_id=data.get("task_id"),
            step_id=data.get("step_id"),
            timeout=float(data["timeout"]) if data.get("timeout") is not None else None,
            dry_run=data.get("dry_run", False),
            metadata=data.get("metadata", {}),
        )
