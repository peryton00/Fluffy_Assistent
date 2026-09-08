"""
Provider & Backend Separation Tests
Tests separation of Model Providers from Inference Backends and BackendRegistry resolution.
"""

import tempfile
import unittest
from pathlib import Path

from brain.ai.models.definition import ModelDefinition
from brain.ai.models.metadata import ModelFormat
from brain.ai.models.registry import ModelRegistry
from brain.ai.providers.local.provider import LocalModelProvider
from brain.ai.backends.reference import ReferenceBackend
from brain.ai.backends.llama_cpp import LlamaCppBackend
from brain.ai.backends.registry import BackendRegistry


class TestProvidersAndBackends(unittest.TestCase):
    """Test provider discovery and backend execution isolation."""

    def test_provider_backend_separation(self):
        """Verify provider handles discovery while backend handles execution."""
        registry = ModelRegistry()
        with tempfile.TemporaryDirectory() as tmpdir:
            tmppath = Path(tmpdir)
            mock_model_file = tmppath / "tiny-model.gguf"
            mock_model_file.write_bytes(b"GGUF_DATA")

            # Provider scans directory
            provider = LocalModelProvider(models_dir=tmppath, registry=registry)
            count = provider.refresh_models()
            self.assertEqual(count, 1)

            discovered = provider.get_model("tiny-model")
            self.assertIsNotNone(discovered)
            self.assertEqual(discovered.provider, "local")

            # Execution is delegated to a separate backend
            backend = ReferenceBackend()
            backend.load_model(discovered)
            self.assertTrue(backend.is_loaded("tiny-model"))
            output = backend.generate("tiny-model", "echo: Output from separate backend")
            self.assertEqual(output, "Output from separate backend")

    def test_backend_registry_selection(self):
        """Verify BackendRegistry resolution logic."""
        backend_reg = BackendRegistry()

        # Production lookup without test backends
        prod_backend = backend_reg.select_backend(preferred_backend_id="auto", allow_test_backend=False)
        # If llama-cpp-python is not installed, prod_backend should be None
        if not backend_reg.get("llama_cpp").is_available():
            self.assertIsNone(prod_backend)

        # Test lookup with allow_test_backend=True
        test_backend = backend_reg.select_backend(preferred_backend_id="auto", allow_test_backend=True)
        self.assertIsNotNone(test_backend)
        self.assertEqual(test_backend.backend_id, "reference")

    def test_llamacpp_backend_unavailability_handling(self):
        """Verify LlamaCppBackend reports availability accurately and raises on uninstalled load."""
        backend = LlamaCppBackend()
        if not backend.is_available():
            model = ModelDefinition(
                model_id="test-gguf",
                display_name="Test GGUF",
                format=ModelFormat.GGUF,
                file_path="/nonexistent/model.gguf",
            )
            with self.assertRaises(RuntimeError) as ctx:
                backend.load_model(model)
            self.assertIn("llama-cpp-python", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()
