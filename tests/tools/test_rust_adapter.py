"""
Unit tests for RustToolAdapter.
"""

import unittest
from brain.tools.definitions import ToolDefinition, ToolKind
from brain.tools.requests import ToolRequest
from brain.tools.adapters.rust import RustToolAdapter
from brain.runtime.rust_capability_client import RustCapabilityClient


class MockRustCapabilityClient(RustCapabilityClient):
    """Deterministic mock client for testing RustToolAdapter without running daemon."""

    def __init__(self, should_succeed: bool = True, data: any = None, error_code: str = ""):
        super().__init__()
        self.should_succeed = should_succeed
        self.data = data or {"cpu": "AMD Ryzen", "ram_gb": 32}
        self.error_code = error_code

    def is_core_reachable(self, timeout: float = 1.0) -> bool:
        return self.should_succeed

    def execute_capability(self, capability_id: str, parameters=None, request_id=None, timeout=5.0):
        if self.should_succeed:
            return {"success": True, "data": self.data, "request_id": request_id}
        return {
            "success": False,
            "error": {"code": self.error_code or "core_unreachable", "message": "Failed to execute capability"},
            "request_id": request_id,
        }


class TestRustToolAdapter(unittest.TestCase):
    """Tests for RustToolAdapter translation and error handling."""

    def test_successful_rust_capability_execution(self):
        mock_client = MockRustCapabilityClient(should_succeed=True, data={"cores": 8})
        adapter = RustToolAdapter(rust_client=mock_client)

        tool = ToolDefinition(
            tool_id="rust.system.get_hardware",
            name="System.GetHardware",
            description="Hardware info",
            kind=ToolKind.RUST,
        )
        req = ToolRequest(tool_id="rust.system.get_hardware", parameters={})
        result = adapter.execute(tool, req)

        self.assertTrue(result.success)
        self.assertEqual(result.output, {"cores": 8})

    def test_unreachable_rust_daemon_returns_unavailable_error(self):
        mock_client = MockRustCapabilityClient(should_succeed=False, error_code="core_unreachable")
        adapter = RustToolAdapter(rust_client=mock_client)

        tool = ToolDefinition(
            tool_id="rust.system.get_hardware",
            name="System.GetHardware",
            description="Hardware info",
            kind=ToolKind.RUST,
        )
        req = ToolRequest(tool_id="rust.system.get_hardware", parameters={})
        result = adapter.execute(tool, req)

        self.assertFalse(result.success)
        self.assertEqual(result.error_type.value, "unavailable")

    def test_rust_health_check(self):
        healthy_client = MockRustCapabilityClient(should_succeed=True)
        adapter = RustToolAdapter(rust_client=healthy_client)
        tool = ToolDefinition(tool_id="rust.system.get_hardware", name="GetHardware", description="")
        health = adapter.check_health(tool)
        self.assertTrue(health.is_available)


if __name__ == "__main__":
    unittest.main()
