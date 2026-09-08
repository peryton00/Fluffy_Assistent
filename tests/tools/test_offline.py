"""
Unit tests for Offline Sovereignty Policy Enforcement.
"""

import unittest
from brain.tools.definitions import ToolDefinition, ToolKind, ToolSecurityMetadata
from brain.tools.requests import ToolRequest
from brain.tools.registry import ToolRegistry
from brain.tools.runtime import UnifiedToolRuntime
from brain.tools.policies.policy import ToolSecurityPolicy


class TestOfflinePolicy(unittest.TestCase):
    """Tests for strict offline sovereignty policy enforcement."""

    def test_strict_offline_mode_blocks_non_offline_tools(self):
        policy = ToolSecurityPolicy(strict_offline=True)
        registry = ToolRegistry(populate_defaults=False)
        runtime = UnifiedToolRuntime(registry=registry, security_policy=policy)

        # 1. Non-offline tool (e.g. requires external internet)
        external_tool = ToolDefinition(
            tool_id="native.web.external_api",
            name="external_api",
            description="Calls remote cloud endpoint",
            kind=ToolKind.NATIVE,
            security=ToolSecurityMetadata(offline_capable=False),
        )
        registry.register(external_tool)

        req_ext = ToolRequest(tool_id="native.web.external_api", parameters={})
        res_ext = runtime.execute(req_ext)

        self.assertFalse(res_ext.success)
        self.assertEqual(res_ext.error_type.value, "offline_violation")
        self.assertIn("strict offline mode", res_ext.error)

        # 2. Offline-capable tool is allowed
        local_tool = ToolDefinition(
            tool_id="native.math.local_calc",
            name="local_calc",
            description="Local calculation",
            kind=ToolKind.NATIVE,
            security=ToolSecurityMetadata(offline_capable=True),
        )
        registry.register(local_tool)

        # Register handler on default adapter
        adapter = registry.get_adapter("native.math.local_calc")
        if hasattr(adapter, "register_handler"):
            adapter.register_handler("native.math.local_calc", lambda p: "local_ok")

        req_loc = ToolRequest(tool_id="native.math.local_calc", parameters={})
        res_loc = runtime.execute(req_loc)

        self.assertTrue(res_loc.success)
        self.assertEqual(res_loc.output, "local_ok")


if __name__ == "__main__":
    unittest.main()
