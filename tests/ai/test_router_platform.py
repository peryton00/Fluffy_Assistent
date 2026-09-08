"""
Model Router Platform Independence Tests
Verifies deterministic routing across diverse operating systems and accelerator topologies.
"""

import unittest

from brain.ai.backends.reference import ReferenceBackend
from brain.ai.backends.registry import BackendRegistry
from brain.ai.hardware.capabilities import (
    AcceleratorType,
    CPUInfo,
    GPUInfo,
    HardwareCapabilities,
    MemoryInfo,
    OSInfo,
)
from brain.ai.models.definition import ModelDefinition
from brain.ai.models.metadata import (
    ModelCapability,
    ModelRequirements,
)
from brain.ai.models.registry import ModelRegistry
from brain.ai.router.request import RoutingRequest, TaskType
from brain.ai.router.router import DeterministicModelRouter


class MockHardwareDetector:
    """Mock detector that returns a prescribed hardware capability profile."""
    def __init__(self, hardware: HardwareCapabilities):
        self._hardware = hardware

    def detect(self) -> HardwareCapabilities:
        return self._hardware


class TestRouterPlatformIndependence(unittest.TestCase):
    """Test suite ensuring zero platform coupling in model routing decisions."""

    def setUp(self):
        self.model_registry = ModelRegistry()
        self.backend_registry = BackendRegistry()
        self.backend_registry.register(ReferenceBackend())

        # Models
        self.general_model = ModelDefinition(
            model_id="generic-chat-7b",
            display_name="Generic Chat 7B",
            provider="reference",
            parameter_count="7B",
            capabilities=[ModelCapability.TEXT_GENERATION, ModelCapability.CHAT],
            requirements=ModelRequirements(min_ram_gb=4.0),
            is_installed=True,
        )
        self.gpu_heavy_model = ModelDefinition(
            model_id="heavy-cuda-model",
            display_name="Heavy CUDA Model",
            provider="reference",
            parameter_count="30B",
            capabilities=[ModelCapability.TEXT_GENERATION, ModelCapability.CHAT],
            requirements=ModelRequirements(min_ram_gb=16.0, min_vram_gb=8.0, preferred_accelerator=AcceleratorType.CUDA),
            is_installed=True,
        )
        self.model_registry.register(self.general_model)
        self.model_registry.register(self.gpu_heavy_model)

    def test_linux_cpu_only_environment(self):
        """Routing on Linux without discrete GPU selects compatible CPU model."""
        linux_hw = HardwareCapabilities(
            os=OSInfo(system="linux", release="6.5.0-generic", version="", architecture="x86_64"),
            cpu=CPUInfo(architecture="x86_64", physical_cores=16, logical_cores=32),
            memory=MemoryInfo(total_bytes=32 * (1024 ** 3), available_bytes=24 * (1024 ** 3)),
            gpus=[],
            primary_accelerator=AcceleratorType.CPU,
        )

        router = DeterministicModelRouter(
            model_registry=self.model_registry,
            backend_registry=self.backend_registry,
            hardware_detector=MockHardwareDetector(linux_hw),
        )

        req = RoutingRequest(task_type=TaskType.GENERAL_CHAT)
        decision = router.route(req)

        # GPU heavy model requires min_vram_gb=8.0 and GPU -> rejected on CPU system
        self.assertEqual(decision.selected_model_id, "generic-chat-7b")
        rejected_ids = [r.model_id for r in decision.rejected_candidates]
        self.assertIn("heavy-cuda-model", rejected_ids)

    def test_macos_metal_environment(self):
        """Routing on macOS Apple Silicon operates deterministically."""
        macos_hw = HardwareCapabilities(
            os=OSInfo(system="darwin", release="23.4.0", version="", architecture="arm64"),
            cpu=CPUInfo(architecture="arm64", physical_cores=12, logical_cores=12),
            memory=MemoryInfo(total_bytes=36 * (1024 ** 3), available_bytes=28 * (1024 ** 3)),
            gpus=[
                GPUInfo(
                    index=0,
                    name="Apple M3 Max GPU",
                    vendor="apple",
                    total_memory_bytes=36 * (1024 ** 3),
                    free_memory_bytes=28 * (1024 ** 3),
                    accelerator_type=AcceleratorType.METAL,
                )
            ],
            primary_accelerator=AcceleratorType.METAL,
        )

        router = DeterministicModelRouter(
            model_registry=self.model_registry,
            backend_registry=self.backend_registry,
            hardware_detector=MockHardwareDetector(macos_hw),
        )

        req = RoutingRequest(task_type=TaskType.GENERAL_CHAT)
        decision = router.route(req)

        self.assertIsNotNone(decision.selected_model_id)
        self.assertGreater(decision.score, 0.0)

    def test_deterministic_output_reproducibility(self):
        """Routing identical requests on identical hardware produces 100% identical decisions."""
        win_hw = HardwareCapabilities(
            os=OSInfo(system="windows", release="11", version="10.0", architecture="x86_64"),
            cpu=CPUInfo(architecture="x86_64", physical_cores=8, logical_cores=16),
            memory=MemoryInfo(total_bytes=16 * (1024 ** 3), available_bytes=12 * (1024 ** 3)),
            gpus=[],
            primary_accelerator=AcceleratorType.CPU,
        )

        router = DeterministicModelRouter(
            model_registry=self.model_registry,
            backend_registry=self.backend_registry,
            hardware_detector=MockHardwareDetector(win_hw),
        )

        req1 = RoutingRequest(task_type=TaskType.GENERAL_CHAT, request_id="req-100")
        req2 = RoutingRequest(task_type=TaskType.GENERAL_CHAT, request_id="req-100")

        d1 = router.route(req1)
        d2 = router.route(req2)

        self.assertEqual(d1.selected_model_id, d2.selected_model_id)
        self.assertEqual(d1.selected_backend_id, d2.selected_backend_id)
        self.assertEqual(d1.score, d2.score)
        self.assertEqual(len(d1.evaluated_candidates), len(d2.evaluated_candidates))


if __name__ == "__main__":
    unittest.main()
