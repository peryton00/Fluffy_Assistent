"""
Unit tests for Tool Conflict and Priority Handling in ToolRegistry.
"""

import unittest
from brain.tools.definitions import ToolDefinition, ToolKind
from brain.tools.registry import ToolRegistry


class TestToolConflicts(unittest.TestCase):
    """Tests for conflict resolution when duplicate tool IDs are registered."""

    def test_higher_priority_registration_preserved(self):
        registry = ToolRegistry(populate_defaults=False)

        tool_v1 = ToolDefinition(
            tool_id="native.files.list",
            name="list_files_native",
            description="Native file listing",
            kind=ToolKind.NATIVE,
        )
        registry.register(tool_v1, priority=100)

        # Attempt to register lower-priority override
        tool_v2 = ToolDefinition(
            tool_id="native.files.list",
            name="list_files_override",
            description="Low priority override",
            kind=ToolKind.MCP,
        )
        registered_v2 = registry.register(tool_v2, priority=50, allow_override=False)

        self.assertFalse(registered_v2)
        current = registry.get("native.files.list")
        self.assertEqual(current.kind, ToolKind.NATIVE)
        self.assertEqual(current.name, "list_files_native")


if __name__ == "__main__":
    unittest.main()
