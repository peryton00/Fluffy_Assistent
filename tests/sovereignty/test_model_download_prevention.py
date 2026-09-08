"""
Model Download Prevention and Local Resolution Tests
Verifies that missing models return deterministic UNAVAILABLE without network or download attempts.
"""

import unittest
from brain.ai.models.registry import ModelRegistry
from brain.ai.runtime.manager import RuntimeManager
from brain.ai.runtime.lifecycle import ModelLifecycleState
from brain.security.sovereignty import RuntimeNetworkMonitor


class TestModelDownloadPrevention(unittest.TestCase):
    """Test model registry and runtime resolution without network egress or download side-effects."""

    def setUp(self):
        self.registry = ModelRegistry()
        self.runtime = RuntimeManager(registry=self.registry)
        self.monitor = RuntimeNetworkMonitor(enforce_block=True)
        self.monitor.reset()

    def tearDown(self):
        self.monitor.stop()

    def test_missing_model_resolution_returns_unavailable_without_network(self):
        """Requesting an unregistered model must return UNAVAILABLE / False with zero network egress."""
        with self.monitor:
            # 1. Query registry for uninstalled model
            model = self.registry.get("non-existent-remote-model-70b")
            self.assertIsNone(model)

            # 2. Attempt load in runtime (must fail / raise ValueError without making network calls)
            with self.assertRaises(ValueError):
                self.runtime.load("non-existent-remote-model-70b")

        # Assert zero external network attempts were made
        self.assertTrue(self.monitor.is_clean())
        self.assertEqual(self.monitor.get_external_count(), 0)


if __name__ == "__main__":
    unittest.main()
