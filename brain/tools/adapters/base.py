"""
Base Tool Adapter Interface
Abstract boundary defining how different capability providers execute, report health, and cancel requests.
"""

from abc import ABC, abstractmethod
from typing import Optional, Dict, Any

from brain.tools.definitions import ToolDefinition
from brain.tools.requests import ToolRequest
from brain.tools.results import ToolResult
from brain.tools.health import ToolHealth


class ToolAdapter(ABC):
    """
    Abstract adapter interface for executing tools of a specific kind (Native, Rust, MCP, Python).
    """

    @abstractmethod
    def execute(self, tool: ToolDefinition, request: ToolRequest) -> ToolResult:
        """Execute a tool request synchronously and return a structured ToolResult."""
        pass

    @abstractmethod
    def check_health(self, tool: ToolDefinition) -> ToolHealth:
        """Perform a non-destructive health check on the tool."""
        pass

    def cancel(self, request_id: str) -> bool:
        """
        Attempt to cancel an in-flight request.
        Returns True if cancellation was successfully propagated, False otherwise.
        """
        return False
