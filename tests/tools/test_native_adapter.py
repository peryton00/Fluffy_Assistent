"""
Unit tests for NativeToolAdapter.
"""

import unittest
from brain.tools.definitions import ToolDefinition, ToolKind
from brain.tools.requests import ToolRequest
from brain.tools.adapters.native import NativeToolAdapter


class TestNativeToolAdapter(unittest.TestCase):
    """Tests for NativeToolAdapter handler execution, dry-run, and error capture."""

    def setUp(self):
        self.adapter = NativeToolAdapter()

    def test_custom_registered_handler_execution(self):
        tool = ToolDefinition(
            tool_id="native.math.square",
            name="square",
            description="Square a number",
            kind=ToolKind.NATIVE,
        )
        self.adapter.register_handler("native.math.square", lambda params: params["x"] ** 2)

        req = ToolRequest(tool_id="native.math.square", parameters={"x": 7})
        result = self.adapter.execute(tool, req)

        self.assertTrue(result.success)
        self.assertEqual(result.output, 49)
        self.assertGreaterEqual(result.duration_ms, 0.0)

    def test_handler_exception_captured_cleanly(self):
        tool = ToolDefinition(
            tool_id="native.error.failing",
            name="failing",
            description="Failing tool",
            kind=ToolKind.NATIVE,
        )
        def failing_handler(params):
            raise ValueError("Intentional failure in handler")

        self.adapter.register_handler("native.error.failing", failing_handler)

        req = ToolRequest(tool_id="native.error.failing", parameters={})
        result = self.adapter.execute(tool, req)

        self.assertFalse(result.success)
        self.assertIn("Intentional failure in handler", result.error)

    def test_dry_run_behavior(self):
        tool_with_dry_run = ToolDefinition(
            tool_id="native.test.dry",
            name="dry",
            description="Supports dry run",
            supports_dry_run=True,
        )
        req = ToolRequest(tool_id="native.test.dry", parameters={"param": 1}, dry_run=True)
        res = self.adapter.execute(tool_with_dry_run, req)
        self.assertTrue(res.success)
        self.assertTrue(res.output.get("dry_run"))

        tool_without_dry_run = ToolDefinition(
            tool_id="native.test.no_dry",
            name="no_dry",
            description="No dry run",
            supports_dry_run=False,
        )
        req_no = ToolRequest(tool_id="native.test.no_dry", parameters={}, dry_run=True)
        res_no = self.adapter.execute(tool_without_dry_run, req_no)
        self.assertFalse(res_no.success)
        self.assertIn("does not support dry-run", res_no.error)


if __name__ == "__main__":
    unittest.main()
