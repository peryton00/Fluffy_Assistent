"""
Unit tests for Tool Security Policies & Confirmation Gates.
"""

import unittest
from brain.tools.definitions import ToolDefinition, ToolKind, ToolRiskLevel, ToolSecurityMetadata
from brain.tools.requests import ToolRequest
from brain.tools.registry import ToolRegistry
from brain.tools.runtime import UnifiedToolRuntime
from brain.tools.policies.policy import ToolSecurityPolicy, ToolPolicyDecision
from brain.security.action_validator import ActionValidator


class TestToolSecurityPolicy(unittest.TestCase):
    """Tests for ToolSecurityPolicy evaluation and confirmation suspension."""

    def setUp(self):
        self.registry = ToolRegistry(populate_defaults=False)
        self.policy = ToolSecurityPolicy()
        self.runtime = UnifiedToolRuntime(registry=self.registry, security_policy=self.policy)

    def test_confirmation_required_suspends_with_token(self):
        tool = ToolDefinition(
            tool_id="native.system.delete_folder",
            name="delete_folder",
            description="Delete directory",
            kind=ToolKind.NATIVE,
            security=ToolSecurityMetadata(
                risk_level=ToolRiskLevel.CONFIRMATION_REQUIRED,
                requires_confirmation=True,
                destructive=True,
            ),
        )
        self.registry.register(tool)

        req = ToolRequest(tool_id="native.system.delete_folder", parameters={"path": "temp_dir"})
        result = self.runtime.execute(req, confirmed=False)

        self.assertFalse(result.success)
        self.assertEqual(result.error_type.value, "confirmation_required")
        self.assertIn("confirmation_id", result.metadata)

    def test_blocked_action_is_strictly_denied(self):
        tool = ToolDefinition(
            tool_id="native.dangerous.nuke",
            name="nuke",
            description="Blocked tool",
            kind=ToolKind.NATIVE,
            security=ToolSecurityMetadata(risk_level=ToolRiskLevel.BLOCKED),
        )
        self.registry.register(tool)

        req = ToolRequest(tool_id="native.dangerous.nuke", parameters={})
        result = self.runtime.execute(req, confirmed=False)

        self.assertFalse(result.success)
        self.assertEqual(result.error_type.value, "security_denied")

    def test_confirmed_execution_bypasses_suspension(self):
        from brain.tools.adapters.native import NativeToolAdapter
        tool = ToolDefinition(
            tool_id="native.system.confirm_action",
            name="confirm_action",
            description="Confirmable",
            kind=ToolKind.NATIVE,
            security=ToolSecurityMetadata(
                risk_level=ToolRiskLevel.CONFIRMATION_REQUIRED,
                requires_confirmation=True,
            ),
        )
        adapter = NativeToolAdapter()
        adapter.register_handler("native.system.confirm_action", lambda p: {"executed": True})
        self.registry.register(tool, adapter=adapter)

        req = ToolRequest(tool_id="native.system.confirm_action", parameters={})
        result = self.runtime.execute(req, confirmed=True)

        self.assertTrue(result.success)
        self.assertEqual(result.output, {"executed": True})


if __name__ == "__main__":
    unittest.main()
