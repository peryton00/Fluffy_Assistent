"""
Runtime & Lifecycle Contract Tests
Tests model lifecycle transitions, generation contracts, streaming, and cancellation.
"""

import unittest

from brain.ai.config.ai_config import AIConfig
from brain.ai.models.definition import ModelDefinition
from brain.ai.models.metadata import ModelCapability, ModelFormat
from brain.ai.models.registry import ModelRegistry
from brain.ai.backends.reference import ReferenceBackend
from brain.ai.backends.registry import BackendRegistry
from brain.ai.runtime.lifecycle import ModelLifecycleState
from brain.ai.runtime.interface import (
    GenerationRequest,
    CancellationHandle,
)
from brain.ai.runtime.manager import RuntimeManager


class TestRuntimeLifecycle(unittest.TestCase):
    """Test AIModelRuntime lifecycle, generation, streaming, and cancellation contracts."""

    def setUp(self):
        self.config = AIConfig(preferred_backend="reference", default_model_id="ref-model")
        self.registry = ModelRegistry()
        self.backend_registry = BackendRegistry()
        self.ref_backend = ReferenceBackend()
        self.backend_registry.register(self.ref_backend)

        # Register test model
        self.test_model = ModelDefinition(
            model_id="ref-model",
            display_name="Reference Test Model",
            provider="reference",
            format=ModelFormat.CUSTOM,
            is_installed=True,
        )
        self.registry.register(self.test_model)

        self.runtime = RuntimeManager(
            config=self.config,
            registry=self.registry,
            backend_registry=self.backend_registry,
        )

    def test_lifecycle_transitions(self):
        """Verify lifecycle states transition from AVAILABLE to READY to UNLOADED."""
        # Initial state
        self.assertEqual(self.runtime.lifecycle.get_state("ref-model"), ModelLifecycleState.AVAILABLE)

        # Load
        loaded = self.runtime.load("ref-model")
        self.assertTrue(loaded)
        self.assertEqual(self.runtime.lifecycle.get_state("ref-model"), ModelLifecycleState.READY)
        self.assertTrue(self.ref_backend.is_loaded("ref-model"))

        # Unload
        unloaded = self.runtime.unload("ref-model")
        self.assertTrue(unloaded)
        self.assertEqual(self.runtime.lifecycle.get_state("ref-model"), ModelLifecycleState.UNLOADED)
        self.assertFalse(self.ref_backend.is_loaded("ref-model"))

    def test_generation_contract(self):
        """Verify synchronous generation contract returns valid GenerationResponse."""
        req = GenerationRequest(prompt="echo: Hello Fluffy AI Runtime", model_id="ref-model")
        resp = self.runtime.generate(req)

        self.assertEqual(resp.text, "Hello Fluffy AI Runtime")
        self.assertEqual(resp.model_id, "ref-model")
        self.assertEqual(resp.backend_id, "reference")
        self.assertEqual(resp.finish_reason, "stop")
        self.assertGreaterEqual(resp.latency_ms, 0.0)

    def test_streaming_contract(self):
        """Verify streaming contract yields chunks and terminates with is_final=True."""
        req = GenerationRequest(prompt="echo: Stream test tokens", model_id="ref-model")
        chunks = list(self.runtime.stream(req))

        self.assertGreater(len(chunks), 1)
        full_text = "".join(c.delta for c in chunks)
        self.assertEqual(full_text.strip(), "Stream test tokens")
        self.assertTrue(chunks[-1].is_final)
        self.assertEqual(chunks[-1].finish_reason, "stop")

    def test_cancellation_contract(self):
        """Verify cancellation handle halts streaming generation gracefully."""
        handle = CancellationHandle()
        handle.cancel()

        req = GenerationRequest(prompt="echo: This should be cancelled", model_id="ref-model")
        chunks = list(self.runtime.stream(req, cancellation=handle))

        self.assertTrue(any(c.finish_reason == "cancelled" for c in chunks))

    def test_health_diagnostics(self):
        """Verify runtime health returns structured diagnostics."""
        health = self.runtime.health()
        self.assertTrue(health.runtime_available)
        self.assertIsInstance(health.loaded_models, list)
        self.assertIn(health.memory_pressure, ["low", "medium", "high"])
        self.assertGreater(len(health.components), 0)


if __name__ == "__main__":
    unittest.main()
