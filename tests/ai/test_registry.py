"""
Model Registry & Definition Tests
Tests registration, capability queries, hardware compatibility validation, and directory scanning.
"""

import json
import tempfile
import unittest
from pathlib import Path

from brain.ai.hardware.capabilities import (
    AcceleratorType,
    OSInfo,
    CPUInfo,
    MemoryInfo,
    GPUInfo,
    HardwareCapabilities,
)
from brain.ai.models.metadata import (
    ModelCapability,
    ModelFormat,
    ModelRequirements,
)
from brain.ai.models.definition import ModelDefinition
from brain.ai.models.registry import ModelRegistry


class TestModelRegistry(unittest.TestCase):
    """Test model registry functionality."""

    def setUp(self):
        self.registry = ModelRegistry()

    def test_register_and_query_model(self):
        """Test explicit registration and lookup."""
        model = ModelDefinition(
            model_id="llama-3.2-3b-instruct",
            display_name="Llama 3.2 3B Instruct",
            provider="local",
            model_family="llama",
            version="3.2.0",
            parameter_count="3B",
            quantization="Q4_K_M",
            context_length=8192,
            capabilities=[ModelCapability.TEXT_GENERATION, ModelCapability.CHAT, ModelCapability.CODE],
            requirements=ModelRequirements(min_ram_gb=4.0),
            format=ModelFormat.GGUF,
            is_installed=True,
        )
        self.registry.register(model)

        retrieved = self.registry.get("llama-3.2-3b-instruct")
        self.assertIsNotNone(retrieved)
        self.assertEqual(retrieved.display_name, "Llama 3.2 3B Instruct")
        self.assertTrue(retrieved.has_capability(ModelCapability.CODE))
        self.assertFalse(retrieved.has_capability(ModelCapability.VISION))

    def test_filter_models_by_capability(self):
        """Test querying registry by capability."""
        m_code = ModelDefinition(
            model_id="code-model",
            display_name="Code Model",
            capabilities=[ModelCapability.CODE],
        )
        m_chat = ModelDefinition(
            model_id="chat-model",
            display_name="Chat Model",
            capabilities=[ModelCapability.CHAT],
        )
        self.registry.register(m_code)
        self.registry.register(m_chat)

        code_models = self.registry.list_all(capability=ModelCapability.CODE)
        self.assertEqual(len(code_models), 1)
        self.assertEqual(code_models[0].model_id, "code-model")

    def test_hardware_compatibility_verification(self):
        """Test compatibility verification against hardware profiles."""
        model = ModelDefinition(
            model_id="heavy-model-70b",
            display_name="Heavy 70B Model",
            requirements=ModelRequirements(min_ram_gb=32.0, min_vram_gb=16.0),
        )
        self.registry.register(model)

        # Low spec hardware
        low_hw = HardwareCapabilities(
            os=OSInfo(system="windows", release="11", version="", architecture="x86_64"),
            cpu=CPUInfo(architecture="x86_64", physical_cores=4, logical_cores=8),
            memory=MemoryInfo(total_bytes=16 * (1024 ** 3), available_bytes=8 * (1024 ** 3)),
            gpus=[],
            primary_accelerator=AcceleratorType.CPU,
        )
        is_compat, reason = self.registry.is_compatible("heavy-model-70b", low_hw)
        self.assertFalse(is_compat)
        self.assertIn("RAM", reason)

        # High spec hardware with GPU
        high_hw = HardwareCapabilities(
            os=OSInfo(system="linux", release="6.0", version="", architecture="x86_64"),
            cpu=CPUInfo(architecture="x86_64", physical_cores=16, logical_cores=32),
            memory=MemoryInfo(total_bytes=64 * (1024 ** 3), available_bytes=48 * (1024 ** 3)),
            gpus=[
                GPUInfo(
                    index=0,
                    name="NVIDIA A100",
                    vendor="nvidia",
                    total_memory_bytes=80 * (1024 ** 3),
                    free_memory_bytes=70 * (1024 ** 3),
                    accelerator_type=AcceleratorType.CUDA,
                )
            ],
            primary_accelerator=AcceleratorType.CUDA,
        )
        is_compat, reason = self.registry.is_compatible("heavy-model-70b", high_hw)
        self.assertTrue(is_compat)

    def test_scan_directory_with_manifest_and_weights(self):
        """Test offline directory scanning for model files and JSON sidecars."""
        with tempfile.TemporaryDirectory() as tmpdir:
            tmppath = Path(tmpdir)
            
            # Create a mock GGUF file
            gguf_file = tmppath / "qwen2.5-coder-7b.gguf"
            gguf_file.write_bytes(b"GGUF_MOCK_DATA")

            # Create a model manifest JSON
            manifest_file = tmppath / "phi-3-mini.manifest.json"
            manifest_file.write_text(json.dumps({
                "model_id": "phi-3-mini",
                "display_name": "Phi 3 Mini 4K",
                "model_family": "phi",
                "capabilities": ["text_generation", "chat", "reasoning"],
                "format": "gguf",
                "requirements": {"min_ram_gb": 4.0},
            }))

            count = self.registry.scan_directory(tmppath)
            self.assertEqual(count, 2)
            self.assertIsNotNone(self.registry.get("qwen2.5-coder-7b"))
            self.assertIsNotNone(self.registry.get("phi-3-mini"))


if __name__ == "__main__":
    unittest.main()
