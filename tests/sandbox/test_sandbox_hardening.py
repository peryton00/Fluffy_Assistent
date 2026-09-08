"""
Phase 2E Targeted Hardening & Execution Mode Tests
Tests execution modes (SECURE, RESTRICTED, HOST), administrative gates,
no-fallback invariants, backend capability reporting, and air-gapped policies.
"""

import unittest
from pathlib import Path

from brain.sandbox.definitions import (
    SandboxExecutionMode,
    SandboxSecurityLevel,
    SandboxProvenance,
    SandboxHealthStatus,
)
from brain.sandbox.requests import SandboxExecutionRequest
from brain.sandbox.results import SandboxExecutionResult
from brain.sandbox.policy import SandboxPolicy
from brain.sandbox.manager import SandboxManager
from brain.sandbox.backend import SubprocessIsolationBackend, HostExecutionBackend, SandboxBackend
from brain.sandbox.health import SandboxHealth

from brain.tools.runtime import UnifiedToolRuntime
from brain.tools.requests import ToolRequest
from brain.tools.results import ToolResult, ToolErrorType
from brain.tools.adapters.sandbox import SandboxToolAdapter


class FailingMockBackend(SandboxBackend):
    """Mock backend that simulates unavailable / failing isolation backend."""
    @property
    def capabilities(self):
        return None

    @property
    def security_level(self):
        return SandboxSecurityLevel.RUNTIME_CONTAINED

    def execute(self, request, workspace_dirs):
        return SandboxExecutionResult.fail(
            execution_id=request.execution_id,
            error="Backend crashed unexpectedly",
            error_type="backend_error",
        )

    def cancel(self, execution_id: str) -> bool:
        return False

    def check_health(self) -> SandboxHealth:
        h = SandboxHealth()
        h.status = SandboxHealthStatus.UNAVAILABLE
        h.last_error = "Isolation backend binary missing"
        return h

    def cleanup(self, execution_id: str) -> None:
        pass


class TestSandboxHardeningAndModes(unittest.TestCase):
    """Test suite for execution modes, policy gates, and fallback prevention."""

    def test_default_mode_is_secure(self):
        """Default execution mode on request must be SECURE."""
        req = SandboxExecutionRequest(source_code="print('hi')")
        self.assertEqual(req.mode, SandboxExecutionMode.SECURE)
        policy = req.get_effective_policy()
        self.assertEqual(policy.mode, SandboxExecutionMode.SECURE)
        self.assertFalse(policy.allow_host_execution)
        self.assertFalse(policy.network.allow_network)
        self.assertFalse(policy.process.allow_subprocesses)

    def test_backend_capabilities_truthful_reporting(self):
        """Backend capabilities must report security level and native_os_isolation truthfully."""
        subprocess_backend = SubprocessIsolationBackend()
        caps = subprocess_backend.capabilities
        self.assertTrue(caps.filesystem_isolation)
        self.assertTrue(caps.network_isolation)
        self.assertTrue(caps.process_isolation)
        self.assertTrue(caps.environment_isolation)
        self.assertFalse(caps.native_os_isolation)  # Truthfully reports false
        self.assertEqual(caps.security_level, SandboxSecurityLevel.RUNTIME_CONTAINED)
        self.assertEqual(subprocess_backend.security_level, SandboxSecurityLevel.RUNTIME_CONTAINED)

        host_backend = HostExecutionBackend()
        h_caps = host_backend.capabilities
        self.assertFalse(h_caps.filesystem_isolation)
        self.assertFalse(h_caps.network_isolation)
        self.assertFalse(h_caps.process_isolation)
        self.assertFalse(h_caps.environment_isolation)
        self.assertEqual(h_caps.security_level, SandboxSecurityLevel.UNCONFINED)
        self.assertEqual(host_backend.security_level, SandboxSecurityLevel.UNCONFINED)

    def test_host_mode_administratively_disabled_by_default(self):
        """When allow_host_execution=False, requesting HOST mode must be denied with no execution."""
        manager = SandboxManager(allow_host_execution=False)
        req = SandboxExecutionRequest(
            source_code="import sys; print('host run')",
            mode=SandboxExecutionMode.HOST,
            provenance=SandboxProvenance.USER,
        )
        res = manager.execute(req)
        self.assertFalse(res.success)
        self.assertEqual(res.error_type, "security_denied")
        self.assertIn("administratively disabled", res.error)

    def test_host_mode_allowed_when_administratively_enabled(self):
        """When allow_host_execution=True and confirmed, host execution succeeds."""
        manager = SandboxManager(allow_host_execution=True)
        req = SandboxExecutionRequest(
            source_code="import sys; print('host execution success')",
            mode=SandboxExecutionMode.HOST,
            provenance=SandboxProvenance.USER,
        )
        res = manager.execute(req)
        self.assertTrue(res.success)
        self.assertIn("host execution success", res.stdout)

    def test_secure_backend_unavailable_never_falls_back_to_host(self):
        """If secure backend is unavailable, manager returns UNAVAILABLE and never runs on host."""
        mock_failing_backend = FailingMockBackend()
        manager = SandboxManager(backend=mock_failing_backend, allow_host_execution=True)

        req = SandboxExecutionRequest(
            source_code="import os; print('should not run')",
            mode=SandboxExecutionMode.SECURE,
        )
        res = manager.execute(req)
        self.assertFalse(res.success)
        self.assertEqual(res.error_type, "backend_unavailable")
        self.assertIn("unavailable", res.error.lower())

    def test_restricted_backend_unavailable_never_falls_back_to_host(self):
        """If restricted backend is unavailable, manager returns UNAVAILABLE and never runs on host."""
        mock_failing_backend = FailingMockBackend()
        manager = SandboxManager(backend=mock_failing_backend, allow_host_execution=True)

        req = SandboxExecutionRequest(
            source_code="import os; print('should not run')",
            mode=SandboxExecutionMode.RESTRICTED,
        )
        res = manager.execute(req)
        self.assertFalse(res.success)
        self.assertEqual(res.error_type, "backend_unavailable")
        self.assertIn("unavailable", res.error.lower())

    def test_tool_runtime_host_mode_confirmation_gate(self):
        """Model-generated code requesting HOST mode requires user confirmation at ToolRuntime layer."""
        runtime = UnifiedToolRuntime()

        # 1. Unconfirmed model request for HOST execution -> Rejected with CONFIRMATION_REQUIRED
        unconfirmed_req = ToolRequest(
            tool_id="sandbox.execute",
            parameters={
                "code": "print('model host code')",
                "mode": "host",
                "provenance": "model",
            },
        )
        res = runtime.execute(unconfirmed_req, confirmed=False)
        self.assertFalse(res.success)
        self.assertEqual(res.error_type, ToolErrorType.CONFIRMATION_REQUIRED)

    def test_tool_runtime_host_mode_administratively_disabled_fails_even_if_confirmed(self):
        """If host execution is administratively disabled, even confirmed requests fail."""
        strict_manager = SandboxManager(allow_host_execution=False)
        adapter = SandboxToolAdapter(sandbox_manager=strict_manager)

        runtime = UnifiedToolRuntime()
        tool_def = runtime.registry.get("sandbox.execute")

        confirmed_req = ToolRequest(
            tool_id="sandbox.execute",
            parameters={
                "code": "print('model host code')",
                "mode": "host",
                "provenance": "model",
            },
            metadata={"confirmed": True},
        )
        res = adapter.execute(tool_def, confirmed_req)
        self.assertFalse(res.success)
        self.assertEqual(res.error_type, ToolErrorType.SECURITY_DENIED)
        self.assertIn("administratively disabled", res.error)

    def test_air_gapped_policy_sovereignty_profile(self):
        """Air-gapped profile ensures host execution denied, network blocked, but secure computation succeeds."""
        air_gapped_manager = SandboxManager(allow_host_execution=False)

        # 1. Secure calculation works perfectly offline
        calc_req = SandboxExecutionRequest(
            source_code="""
def fib(n):
    a, b = 0, 1
    for _ in range(n):
        a, b = b, a + b
    return a
print(fib(10))
""",
            mode=SandboxExecutionMode.SECURE,
        )
        calc_res = air_gapped_manager.execute(calc_req)
        self.assertTrue(calc_res.success)
        self.assertEqual(calc_res.output.strip(), "55")

        # 2. Host mode attempt is strictly denied
        host_req = SandboxExecutionRequest(
            source_code="print('host attack')",
            mode=SandboxExecutionMode.HOST,
        )
        host_res = air_gapped_manager.execute(host_req)
        self.assertFalse(host_res.success)
        self.assertEqual(host_res.error_type, "security_denied")

        # 3. Network attempt inside sandbox is technically blocked
        net_req = SandboxExecutionRequest(
            source_code="import socket; socket.socket()",
            mode=SandboxExecutionMode.SECURE,
        )
        net_res = air_gapped_manager.execute(net_req)
        self.assertFalse(net_res.success)
        self.assertTrue("disabled" in (net_res.error or net_res.stderr).lower())


if __name__ == "__main__":
    unittest.main()
