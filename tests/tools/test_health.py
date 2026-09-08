"""
Unit tests for ToolHealth and health checks.
"""

import unittest
from brain.tools.definitions import ToolDefinition, ToolKind
from brain.tools.health import ToolHealth, ToolHealthStatus
from brain.tools.registry import ToolRegistry
from brain.tools.runtime import UnifiedToolRuntime


class TestToolHealth(unittest.TestCase):
    """Tests for ToolHealth monitoring and non-destructive status checks."""

    def test_tool_health_serialization(self):
        health = ToolHealth(
            tool_id="native.test.tool",
            status=ToolHealthStatus.AVAILABLE,
            latency_ms=1.5,
        )
        data = health.to_dict()
        self.assertEqual(data["tool_id"], "native.test.tool")
        self.assertEqual(data["status"], "available")
        self.assertEqual(data["latency_ms"], 1.5)

    def test_runtime_check_health_for_native_tool(self):
        registry = ToolRegistry(populate_defaults=False)
        tool = ToolDefinition(
            tool_id="native.ping.tool",
            name="ping",
            description="Ping tool",
            kind=ToolKind.NATIVE,
        )
        registry.register(tool)
        runtime = UnifiedToolRuntime(registry=registry)

        health = runtime.check_health("native.ping.tool")
        self.assertTrue(health.is_available)
        self.assertEqual(health.status, ToolHealthStatus.AVAILABLE)


if __name__ == "__main__":
    unittest.main()
