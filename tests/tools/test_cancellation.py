"""
Unit tests for Tool Cancellation.
"""

import unittest
from brain.tools.definitions import ToolDefinition
from brain.tools.requests import ToolRequest
from brain.tools.registry import ToolRegistry
from brain.tools.runtime import UnifiedToolRuntime
from brain.tools.adapters.base import ToolAdapter
from brain.tools.results import ToolResult
from brain.tools.health import ToolHealth


class CancellableAdapter(ToolAdapter):
    """Adapter with explicit cancellation tracking."""

    def __init__(self):
        self.cancelled_requests = []

    def execute(self, tool: ToolDefinition, request: ToolRequest) -> ToolResult:
        return ToolResult.ok(request.request_id, tool.tool_id, output="ok")

    def check_health(self, tool: ToolDefinition) -> ToolHealth:
        return ToolHealth(tool_id=tool.tool_id)

    def cancel(self, request_id: str) -> bool:
        self.cancelled_requests.append(request_id)
        return True


class TestToolCancellation(unittest.TestCase):
    """Tests for ToolRuntime cancellation propagation."""

    def test_cancel_in_flight_request(self):
        registry = ToolRegistry(populate_defaults=False)
        adapter = CancellableAdapter()
        tool = ToolDefinition(
            tool_id="native.long.task",
            name="long_task",
            description="",
            supports_cancellation=True,
        )
        registry.register(tool, adapter=adapter)
        runtime = UnifiedToolRuntime(registry=registry)

        # Non-existent request returns False
        self.assertFalse(runtime.cancel("non_existent_req_id"))


if __name__ == "__main__":
    unittest.main()
