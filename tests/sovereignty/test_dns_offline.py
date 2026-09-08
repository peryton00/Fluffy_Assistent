"""
DNS Sovereignty and Offline Execution Tests
Verifies that complete offline execution operates with zero external DNS resolution attempts.
"""

import unittest
import tempfile
from pathlib import Path

from brain.artifacts.definitions import ArtifactType
from brain.artifacts.config import ArtifactConfig
from brain.artifacts.runtime import ArtifactRuntime
from brain.artifacts.requests import ArtifactRequest
from brain.security.sovereignty import RuntimeNetworkMonitor


class TestDNSOffline(unittest.TestCase):
    """Test offline operation with zero external DNS resolution."""

    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.workspace = Path(self.temp_dir.name)
        self.config = ArtifactConfig(workspace_dir=self.workspace)
        self.runtime = ArtifactRuntime(config=self.config)
        self.monitor = RuntimeNetworkMonitor(enforce_block=True)
        self.monitor.reset()

    def tearDown(self):
        self.monitor.stop()
        self.temp_dir.cleanup()

    def test_local_operations_execute_without_dns(self):
        """Executing local operations does not trigger any DNS resolution."""
        with self.monitor:
            req = ArtifactRequest(
                artifact_type=ArtifactType.JSON,
                name="dns_audit.json",
                destination_dir=str(self.workspace),
                content={"dns_required": False, "air_gapped": True},
            )
            res = self.runtime.generate_artifact(req)
            self.assertTrue(res.success)

        # Check all recorded events for DNS queries
        dns_events = [e for e in self.monitor.get_events() if e.protocol == "dns"]
        external_dns = [e for e in dns_events if e.category.value == "external"]
        self.assertEqual(len(external_dns), 0)


if __name__ == "__main__":
    unittest.main()
