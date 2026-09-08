"""
Unit tests for ToolRegistry and ToolDiscoveryResult.
"""

import unittest
from brain.tools.definitions import ToolDefinition, ToolKind, ToolRiskLevel, ToolSecurityMetadata
from brain.tools.registry import ToolRegistry


class TestToolRegistry(unittest.TestCase):
    """Tests for ToolRegistry registration, listing, discovery, and aliases."""

    def setUp(self):
        self.registry = ToolRegistry(populate_defaults=False)

    def test_register_and_get_tool(self):
        tool = ToolDefinition(
            tool_id="native.calc.add",
            name="add",
            description="Add two numbers",
            kind=ToolKind.NATIVE,
        )
        registered = self.registry.register(tool)
        self.assertTrue(registered)
        self.assertTrue(self.registry.has("native.calc.add"))

        retrieved = self.registry.get("native.calc.add")
        self.assertIsNotNone(retrieved)
        self.assertEqual(retrieved.name, "add")

    def test_register_alias(self):
        tool = ToolDefinition(
            tool_id="native.calc.add",
            name="add",
            description="Add numbers",
            kind=ToolKind.NATIVE,
        )
        self.registry.register(tool)
        self.registry.register_alias("calc_add", "native.calc.add")

        self.assertTrue(self.registry.has("calc_add"))
        retrieved = self.registry.get("calc_add")
        self.assertEqual(retrieved.tool_id, "native.calc.add")

    def test_unregister_tool(self):
        tool = ToolDefinition(tool_id="native.temp.tool", name="temp", description="temp")
        self.registry.register(tool)
        self.registry.register_alias("temp_alias", "native.temp.tool")

        unregistered = self.registry.unregister("native.temp.tool")
        self.assertTrue(unregistered)
        self.assertFalse(self.registry.has("native.temp.tool"))
        self.assertFalse(self.registry.has("temp_alias"))

    def test_discover_tools(self):
        tool = ToolDefinition(
            tool_id="rust.system.get_hardware",
            name="GetHardware",
            description="System specs",
            kind=ToolKind.RUST,
            provider="rust_core",
            capabilities=["system_info"],
            security=ToolSecurityMetadata(risk_level=ToolRiskLevel.READ_ONLY),
        )
        self.registry.register(tool)

        discovery = self.registry.discover()
        self.assertEqual(len(discovery), 1)
        self.assertEqual(discovery[0].tool_id, "rust.system.get_hardware")
        self.assertEqual(discovery[0].kind, "rust")
        self.assertEqual(discovery[0].risk_level, "read_only")


if __name__ == "__main__":
    unittest.main()
