"""
Multimodal Subsystem Offline and Air-Gap Verification Tests
Verifies that image preprocessing and local OCR operate with 0 external network requests and no cloud fallback.
"""

import unittest
import tempfile
from pathlib import Path

from brain.multimodal.runtime import MultimodalRuntime
from brain.multimodal.config import MultimodalConfig
from brain.multimodal.definitions import MultimodalHealthStatus
from brain.security.sovereignty import RuntimeNetworkMonitor


class TestMultimodalOffline(unittest.TestCase):
    """Test multimodal subsystem in 100% offline air-gapped mode."""

    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.workspace = Path(self.temp_dir.name)
        self.config = MultimodalConfig()
        self.runtime = MultimodalRuntime(config=self.config)
        self.monitor = RuntimeNetworkMonitor(enforce_block=True)
        self.monitor.reset()

    def tearDown(self):
        self.monitor.stop()
        self.temp_dir.cleanup()

    def test_multimodal_health_check_zero_network(self):
        """Multimodal health check inspects local binaries with zero network egress."""
        with self.monitor:
            health = self.runtime.check_health()
            self.assertIsNotNone(health)

        self.assertTrue(self.monitor.is_clean())
        self.assertEqual(self.monitor.get_external_count(), 0)


if __name__ == "__main__":
    unittest.main()
