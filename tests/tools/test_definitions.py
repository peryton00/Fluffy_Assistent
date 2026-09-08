"""
Unit tests for ToolDefinition and ToolSecurityMetadata.
"""

import unittest
from brain.tools.definitions import (
    ToolDefinition,
    ToolKind,
    ToolRiskLevel,
    ToolSecurityMetadata,
)


class TestToolDefinitions(unittest.TestCase):
    """Tests for ToolDefinition and ToolSecurityMetadata serialization and properties."""

    def test_tool_definition_initialization_and_serialization(self):
        sec = ToolSecurityMetadata(
            risk_level=ToolRiskLevel.READ_ONLY,
            requires_confirmation=False,
            offline_capable=True,
        )
        tool = ToolDefinition(
            tool_id="native.test.tool",
            name="test_tool",
            description="A test tool definition",
            provider="test_provider",
            kind=ToolKind.NATIVE,
            input_schema={"type": "object", "properties": {"val": {"type": "string"}}},
            security=sec,
            platforms=["windows", "linux"],
            timeout=15.0,
        )

        self.assertEqual(tool.tool_id, "native.test.tool")
        self.assertEqual(tool.kind, ToolKind.NATIVE)
        self.assertTrue(tool.offline_capable)
        self.assertFalse(tool.requires_confirmation)
        self.assertEqual(tool.risk_level, ToolRiskLevel.READ_ONLY)
        self.assertTrue(tool.is_platform_supported("windows"))
        self.assertTrue(tool.is_platform_supported("linux"))
        self.assertFalse(tool.is_platform_supported("darwin"))

        # Serialization round-trip
        data = tool.to_dict()
        restored = ToolDefinition.from_dict(data)
        self.assertEqual(restored.tool_id, tool.tool_id)
        self.assertEqual(restored.kind, tool.kind)
        self.assertEqual(restored.risk_level, ToolRiskLevel.READ_ONLY)
        self.assertEqual(restored.timeout, 15.0)


if __name__ == "__main__":
    unittest.main()
