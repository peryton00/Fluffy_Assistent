"""
Sandbox Network Policy and Isolation Tests
Verifies that SECURE mode sandbox strictly enforces network denial policy.
"""

import unittest
from brain.sandbox.definitions import SandboxExecutionMode, SandboxSecurityLevel
from brain.sandbox.policy import SandboxPolicy, SandboxNetworkPolicy
from brain.sandbox.backend import SubprocessIsolationBackend


class TestSandboxNetworkPolicy(unittest.TestCase):
    """Test sandbox execution modes network policies and capability truthfulness."""

    def test_secure_mode_denies_network(self):
        """SECURE mode execution policy explicitly denies network access."""
        policy = SandboxPolicy.default_strict()
        self.assertFalse(policy.network.allow_network)

    def test_restricted_mode_denies_network_by_default(self):
        """RESTRICTED mode execution policy denies network by default."""
        policy = SandboxPolicy.restricted()
        self.assertFalse(policy.network.allow_network)

    def test_host_mode_uses_host_policy(self):
        """HOST mode allows host-level network with explicit administrative confirmation."""
        policy = SandboxPolicy.host(allow_host_execution=True)
        self.assertTrue(policy.network.allow_network)

    def test_backend_capabilities_truthfulness(self):
        """Subprocess backend accurately reports RUNTIME_CONTAINED level without claiming kernel container isolation."""
        backend = SubprocessIsolationBackend()
        caps = backend.capabilities
        self.assertEqual(caps.security_level, SandboxSecurityLevel.RUNTIME_CONTAINED)
        self.assertFalse(caps.native_os_isolation)
        self.assertTrue(caps.filesystem_isolation)
        self.assertTrue(caps.network_isolation)


if __name__ == "__main__":
    unittest.main()
