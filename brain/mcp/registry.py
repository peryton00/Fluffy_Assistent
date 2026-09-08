"""
MCP (Model Context Protocol) and Native Tool Registry Interface Boundary.

Unified Architecture:
ToolRegistry → Native Tools + MCP Tools → Policy/Security Boundary (ActionValidator)

Note: This defines the structural interface contract for future MCP integration.
Runtime MCP server execution is deferred to subsequent phases.
"""

from typing import Dict, Any, List, Optional, Callable
from dataclasses import dataclass, field
from enum import Enum


class ToolType(Enum):
    NATIVE = "native"
    EXTENSION = "extension"
    MCP = "mcp"


@dataclass
class ToolDefinition:
    name: str
    description: str
    tool_type: ToolType
    parameters_schema: Dict[str, Any] = field(default_factory=dict)
    handler: Optional[Callable] = None
    server_name: Optional[str] = None
    safety_classification: str = "safe"


class ToolRegistry:
    """
    Unified Tool Registry that manages discovery, registration, and dispatch
    for Native tools, Extensions, and future MCP tools through a single
    security boundary.
    """

    def __init__(self):
        self._tools: Dict[str, ToolDefinition] = {}

    def register_tool(self, tool: ToolDefinition) -> None:
        """Register a tool definition."""
        self._tools[tool.name] = tool

    def get_tool(self, name: str) -> Optional[ToolDefinition]:
        """Retrieve a tool definition by name."""
        return self._tools.get(name)

    def list_tools(self, tool_type: Optional[ToolType] = None) -> List[ToolDefinition]:
        """List registered tools, optionally filtered by type."""
        if tool_type is None:
            return list(self._tools.values())
        return [t for t in self._tools.values() if t.tool_type == tool_type]

    def has_tool(self, name: str) -> bool:
        """Check if a tool is registered."""
        return name in self._tools


_global_registry = ToolRegistry()


def get_tool_registry() -> ToolRegistry:
    """Get the global ToolRegistry singleton."""
    return _global_registry
