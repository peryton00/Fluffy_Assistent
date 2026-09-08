"""
Unit Tests for Secure Code Sandbox (Phase 2E)
Validates limits, filesystem policies, environment sanitization, requests, results, lifecycle, and cancellation.
"""

import os
import sys
import tempfile
import unittest
from pathlib import Path

from brain.sandbox.definitions import (
    SandboxLanguage,
    SandboxProvenance,
    SandboxLifecycleState,
    SandboxHealthStatus,
)
from brain.sandbox.limits import SandboxLimits
from brain.sandbox.filesystem import SandboxFilesystemPolicy
from brain.sandbox.environment import SandboxEnvironmentPolicy
from brain.sandbox.network import SandboxNetworkPolicy
from brain.sandbox.process import SandboxProcessPolicy
from brain.sandbox.policy import SandboxPolicy
from brain.sandbox.requests import SandboxExecutionRequest
from brain.sandbox.results import SandboxExecutionResult
from brain.sandbox.lifecycle import SandboxLifecycleManager
from brain.sandbox.cancellation import SandboxCancellationManager
from brain.sandbox.health import SandboxHealth
from brain.sandbox.errors import SandboxPathTraversalError, SandboxError


class TestSandboxUnit(unittest.TestCase):
    """Unit test suite for sandbox components."""

    def test_limits_defaults_and_effective_timeout(self):
        limits = SandboxLimits(timeout_seconds=3.0, max_timeout_seconds=10.0)
        self.assertEqual(limits.get_effective_timeout(None), 3.0)
        self.assertEqual(limits.get_effective_timeout(5.0), 5.0)
        self.assertEqual(limits.get_effective_timeout(25.0), 10.0)
        self.assertEqual(limits.get_effective_timeout(-1.0), 3.0)

    def test_filesystem_workspace_provisioning_and_cleanup(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            fs = SandboxFilesystemPolicy(base_dir=Path(tmpdir))
            dirs = fs.provision_workspace("test_exec_001")
            
            self.assertTrue(dirs["root"].exists())
            self.assertTrue(dirs["input"].exists())
            self.assertTrue(dirs["work"].exists())
            self.assertTrue(dirs["output"].exists())

            fs.cleanup_workspace("test_exec_001")
            self.assertFalse(dirs["root"].exists())

    def test_filesystem_path_traversal_detection(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            fs = SandboxFilesystemPolicy(base_dir=Path(tmpdir))
            dirs = fs.provision_workspace("test_exec_002")
            root = dirs["root"]

            # Safe paths inside root
            safe_file = Path("work/output.txt")
            self.assertTrue(fs.is_safe_workspace_path(safe_file, root))

            # Traversal escapes
            self.assertFalse(fs.is_safe_workspace_path(Path("../escape.txt"), root))
            self.assertFalse(fs.is_safe_workspace_path(Path("../../Windows/System32"), root))
            self.assertFalse(fs.is_safe_workspace_path(Path("C:\\Windows\\System32"), root))
            self.assertFalse(fs.is_safe_workspace_path(Path("/etc/passwd"), root))
            self.assertFalse(fs.is_safe_workspace_path(Path("\\\\server\\share\\evil"), root))

            with self.assertRaises(SandboxPathTraversalError):
                fs.validate_path_access(Path("../escape.txt"), root)

    def test_environment_sanitization_strips_secrets(self):
        # Inject fake secrets into test env
        os.environ["FLUFFY_API_KEY"] = "super-secret-key-123"
        os.environ["OPENAI_API_TOKEN"] = "token-abc"
        os.environ["DATABASE_PASSWORD"] = "db-pass-456"

        try:
            env_policy = SandboxEnvironmentPolicy(custom_env={"SAFE_VAR": "hello"})
            sanitized = env_policy.build_sanitized_environment()

            self.assertNotIn("FLUFFY_API_KEY", sanitized)
            self.assertNotIn("OPENAI_API_TOKEN", sanitized)
            self.assertNotIn("DATABASE_PASSWORD", sanitized)
            self.assertNotIn("USERPROFILE", sanitized)
            self.assertEqual(sanitized.get("SAFE_VAR"), "hello")
            self.assertEqual(sanitized.get("PYTHONUNBUFFERED"), "1")
            self.assertEqual(sanitized.get("PYTHONNOUSERSITE"), "1")
        finally:
            os.environ.pop("FLUFFY_API_KEY", None)
            os.environ.pop("OPENAI_API_TOKEN", None)
            os.environ.pop("DATABASE_PASSWORD", None)

    def test_requests_and_results_serialization(self):
        req = SandboxExecutionRequest(
            source_code="print('Hello')",
            execution_id="sbx_test_123",
            language=SandboxLanguage.PYTHON,
            provenance=SandboxProvenance.MODEL,
            timeout=4.0,
        )
        data = req.to_dict()
        self.assertEqual(data["execution_id"], "sbx_test_123")
        self.assertEqual(data["language"], "python")

        reconstructed = SandboxExecutionRequest.from_dict(data)
        self.assertEqual(reconstructed.source_code, "print('Hello')")
        self.assertEqual(reconstructed.execution_id, "sbx_test_123")

        res = SandboxExecutionResult.ok("sbx_test_123", stdout="Hello\n", duration_ms=12.5)
        self.assertTrue(res.success)
        self.assertEqual(res.stdout, "Hello\n")

    def test_lifecycle_state_transitions(self):
        mgr = SandboxLifecycleManager()
        exec_id = "sbx_lifecycle_1"

        mgr.set_state(exec_id, SandboxLifecycleState.STARTING)
        self.assertEqual(mgr.get_state(exec_id), SandboxLifecycleState.STARTING)

        mgr.set_state(exec_id, SandboxLifecycleState.RUNNING)
        self.assertEqual(mgr.get_state(exec_id), SandboxLifecycleState.RUNNING)

        mgr.set_state(exec_id, SandboxLifecycleState.COMPLETED)
        self.assertEqual(mgr.get_state(exec_id), SandboxLifecycleState.COMPLETED)

        mgr.set_state(exec_id, SandboxLifecycleState.CLEANED)
        self.assertEqual(mgr.get_state(exec_id), SandboxLifecycleState.CLEANED)

        # Illegal transition from CLEANED -> RUNNING
        with self.assertRaises(SandboxError):
            mgr.set_state(exec_id, SandboxLifecycleState.RUNNING)

    def test_health_metrics_tracking(self):
        health = SandboxHealth()
        self.assertTrue(health.is_available)
        self.assertEqual(health.total_executions, 0)

        health.record_execution(success=True, latency_ms=15.0)
        self.assertEqual(health.total_executions, 1)
        self.assertEqual(health.failed_executions, 0)

        health.record_execution(success=False, latency_ms=5.0, error="Syntax error", is_security_violation=True)
        self.assertEqual(health.total_executions, 2)
        self.assertEqual(health.failed_executions, 1)
        self.assertEqual(health.security_violations, 1)
        self.assertEqual(health.last_error, "Syntax error")


if __name__ == "__main__":
    unittest.main()
