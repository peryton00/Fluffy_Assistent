"""
Unit tests for ToolResolver.
"""

import unittest
from brain.tools.definitions import ToolDefinition, ToolKind
from brain.tools.registry import ToolRegistry
from brain.tools.resolver import ToolResolver
from brain.tools.adapters.native import NativeToolAdapter


class TestToolResolver(unittest.TestCase):
    """Tests for resolving tool IDs, legacy formats, and preventing invalid fuzzy matching."""

    def setUp(self):
        self.registry = ToolRegistry(populate_defaults=False)
        self.resolver = ToolResolver(registry=self.registry)

    def test_direct_resolution(self):
        tool = ToolDefinition(
            tool_id="native.files.create_file",
            name="create_file",
            description="Create file",
            kind=ToolKind.NATIVE,
        )
        adapter = NativeToolAdapter()
        self.registry.register(tool, adapter=adapter)

        res_def, res_adapter = self.resolver.resolve("native.files.create_file")
        self.assertIsNotNone(res_def)
        self.assertEqual(res_def.tool_id, "native.files.create_file")
        self.assertEqual(res_adapter, adapter)

    def test_legacy_format_normalization(self):
        tool = ToolDefinition(
            tool_id="rust.system.get_hardware",
            name="GetHardware",
            description="Hardware",
            kind=ToolKind.RUST,
        )
        self.registry.register(tool)

        # Resolving "rust:System.GetHardware" should normalize to "rust.system.get_hardware"
        res_def, res_adapter = self.resolver.resolve("rust:System.GetHardware")
        self.assertIsNotNone(res_def)
        self.assertEqual(res_def.tool_id, "rust.system.get_hardware")

    def test_unknown_tool_fails_safely(self):
        res_def, res_adapter = self.resolver.resolve("unknown.nonexistent.tool")
        self.assertIsNone(res_def)
        self.assertIsNone(res_adapter)


if __name__ == "__main__":
    unittest.main()
