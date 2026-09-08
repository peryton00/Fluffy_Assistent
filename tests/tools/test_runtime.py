"""
Unit tests for UnifiedToolRuntime.
"""

import unittest
from brain.tools.definitions import ToolDefinition, ToolKind
from brain.tools.requests import ToolRequest
from brain.tools.registry import ToolRegistry
from brain.tools.runtime import UnifiedToolRuntime
from brain.tools.adapters.native import NativeToolAdapter


class TestUnifiedToolRuntime(unittest.TestCase):
    """Tests for UnifiedToolRuntime pipeline: resolution, validation, execution, and events."""

    def setUp(self):
        self.registry = ToolRegistry(populate_defaults=False)
        self.runtime = UnifiedToolRuntime(registry=self.registry)
        self.native_adapter = NativeToolAdapter()

    def test_successful_runtime_execution_pipeline(self):
        tool = ToolDefinition(
            tool_id="native.math.add",
            name="add",
            description="Add numbers",
            kind=ToolKind.NATIVE,
            input_schema={
                "type": "object",
                "required": ["a", "b"],
                "properties": {"a": {"type": "integer"}, "b": {"type": "integer"}},
            },
        )
        self.native_adapter.register_handler("native.math.add", lambda p: p["a"] + p["b"])
        self.registry.register(tool, adapter=self.native_adapter)

        req = ToolRequest(tool_id="native.math.add", parameters={"a": 10, "b": 25})
        result = self.runtime.execute(req)

        self.assertTrue(result.success)
        self.assertEqual(result.output, 35)

    def test_missing_parameter_fails_at_runtime_validation(self):
        tool = ToolDefinition(
            tool_id="native.math.add",
            name="add",
            description="Add numbers",
            kind=ToolKind.NATIVE,
            input_schema={
                "type": "object",
                "required": ["a", "b"],
                "properties": {"a": {"type": "integer"}, "b": {"type": "integer"}},
            },
        )
        self.registry.register(tool, adapter=self.native_adapter)

        # Missing "b"
        req = ToolRequest(tool_id="native.math.add", parameters={"a": 10})
        result = self.runtime.execute(req)

        self.assertFalse(result.success)
        self.assertEqual(result.error_type.value, "validation_error")
        self.assertIn("Missing required parameter 'b'", result.error)

    def test_unregistered_tool_returns_not_found(self):
        req = ToolRequest(tool_id="unknown.tool", parameters={})
        result = self.runtime.execute(req)

        self.assertFalse(result.success)
        self.assertEqual(result.error_type.value, "not_found")


if __name__ == "__main__":
    unittest.main()
