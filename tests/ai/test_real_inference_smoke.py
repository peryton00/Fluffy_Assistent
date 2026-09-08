"""
Real Local Inference Smoke Test
Attempts live local model inference if native backend and on-disk weights are present.
If unavailable, records an explicit skip status without fabricating results.
"""

import unittest
from pathlib import Path

from brain.ai.backends.llama_cpp import LlamaCppBackend
from brain.ai.config.paths import ApplicationDataPaths
from brain.ai.models.definition import ModelDefinition
from brain.ai.models.metadata import ModelFormat


class TestRealLocalInferenceSmoke(unittest.TestCase):
    """Smoke test for real local open-weight model inference."""

    def test_real_local_model_inference_smoke(self):
        """
        Check for real local backend and models.
        Runs deterministic smoke prompt if present; otherwise skips honestly.
        """
        backend = LlamaCppBackend()
        if not backend.is_available():
            self.skipTest("REAL BACKEND TEST: llama-cpp-python NOT AVAILABLE IN CURRENT ENVIRONMENT")

        models_dir = ApplicationDataPaths.get_models_dir()
        gguf_files = list(models_dir.glob("*.gguf")) if models_dir.exists() else []

        if not gguf_files:
            self.skipTest("REAL BACKEND TEST: NO GGUF MODEL WEIGHTS FOUND IN LOCAL MODELS DIRECTORY")

        # If available, run real inference smoke test
        model_file = gguf_files[0]
        model_def = ModelDefinition(
            model_id="smoke-test-model",
            display_name="Smoke Test Model",
            format=ModelFormat.GGUF,
            file_path=str(model_file),
            is_installed=True,
        )

        backend.load_model(model_def)
        self.assertTrue(backend.is_loaded("smoke-test-model"))

        output = backend.generate("smoke-test-model", "Say 'Hello Fluffy'", max_tokens=10)
        self.assertIsInstance(output, str)
        self.assertGreater(len(output), 0)

        backend.unload_model("smoke-test-model")
        self.assertFalse(backend.is_loaded("smoke-test-model"))


if __name__ == "__main__":
    unittest.main()
