"""
Model Router Fallback & Degradation Tests
Verifies fallback chain generation and dynamic adaptation to runtime health/resource changes.
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
from brain.ai.runtime.lifecycle import ModelLifecycleState, ModelLifecycleTracker


class TestRouterFallback(unittest.TestCase):
    """Test suite for fallback chain resolution and runtime degradation handling."""

    def setUp(self):
        self.model_registry = ModelRegistry()
        self.backend_registry = BackendRegistry()
        self.ref_backend = ReferenceBackend()
        self.backend_registry.register(self.ref_backend)
        self.lifecycle = ModelLifecycleTracker()

        self.hardware = HardwareCapabilities(
            os=OSInfo(system="windows", release="11", version="10.0", architecture="x86_64"),
            cpu=CPUInfo(architecture="x86_64", physical_cores=8, logical_cores=16),
            memory=MemoryInfo(total_bytes=32 * (1024 ** 3), available_bytes=24 * (1024 ** 3)),
            gpus=[
                GPUInfo(
                    index=0,
                    name="NVIDIA RTX 4080",
                    vendor="nvidia",
                    total_memory_bytes=16 * (1024 ** 3),
                    free_memory_bytes=14 * (1024 ** 3),
                    accelerator_type=AcceleratorType.CUDA,
                )
            ],
            primary_accelerator=AcceleratorType.CUDA,
        )

        # Register 3 candidate models
        self.model_primary = ModelDefinition(
            model_id="primary-coder-14b",
            display_name="Primary Coder 14B",
            provider="reference",
            parameter_count="14B",
            capabilities=[ModelCapability.TEXT_GENERATION, ModelCapability.CHAT, ModelCapability.CODE],
            requirements=ModelRequirements(min_ram_gb=12.0),
            is_installed=True,
        )
        self.model_secondary = ModelDefinition(
            model_id="secondary-coder-7b",
            display_name="Secondary Coder 7B",
            provider="reference",
            parameter_count="7B",
            capabilities=[ModelCapability.TEXT_GENERATION, ModelCapability.CHAT, ModelCapability.CODE],
            requirements=ModelRequirements(min_ram_gb=6.0),
            is_installed=True,
        )
        self.model_fallback = ModelDefinition(
            model_id="tiny-coder-1b",
            display_name="Tiny Coder 1B",
            provider="reference",
            parameter_count="1B",
            capabilities=[ModelCapability.TEXT_GENERATION, ModelCapability.CHAT, ModelCapability.CODE],
            requirements=ModelRequirements(min_ram_gb=2.0),
            is_installed=True,
        )

        self.model_registry.register(self.model_primary)
        self.model_registry.register(self.model_secondary)
        self.model_registry.register(self.model_fallback)

    def test_fallback_chain_construction(self):
        """A routing decision must include the ordered chain of surviving fallback candidates."""
        # Create a mock detector returning self.hardware
        class MockDetector:
            def __init__(self, hw):
                self.hw = hw
            def detect(self):
                return self.hw

        router = DeterministicModelRouter(
            model_registry=self.model_registry,
            backend_registry=self.backend_registry,
            hardware_detector=MockDetector(self.hardware),
            lifecycle_tracker=self.lifecycle,
        )

        req = RoutingRequest(task_type=TaskType.CODE)
        decision = router.route(req)

        self.assertEqual(decision.selected_model_id, "primary-coder-14b")
        self.assertIn("secondary-coder-7b", decision.fallback_candidates)
        self.assertIn("tiny-coder-1b", decision.fallback_candidates)
        self.assertEqual(len(decision.fallback_candidates), 2)

    def test_automatic_reroute_on_runtime_failure(self):
        """When the primary model experiences runtime failure, router selects the next best fallback."""
        class MockDetector:
            def __init__(self, hw):
                self.hw = hw
            def detect(self):
                return self.hw

        router = DeterministicModelRouter(
            model_registry=self.model_registry,
            backend_registry=self.backend_registry,
            hardware_detector=MockDetector(self.hardware),
            lifecycle_tracker=self.lifecycle,
        )

        # Mark primary model as FAILED
        self.lifecycle.transition("primary-coder-14b", ModelLifecycleState.FAILED, details={"error": "Runtime crashed"})

        req = RoutingRequest(task_type=TaskType.CODE)
        decision = router.route(req)

        # Router must bypass primary-coder-14b and select secondary-coder-7b
        self.assertEqual(decision.selected_model_id, "secondary-coder-7b")
        self.assertIn("tiny-coder-1b", decision.fallback_candidates)
        self.assertEqual(len(decision.rejected_candidates), 1)
        self.assertEqual(decision.rejected_candidates[0].model_id, "primary-coder-14b")
        self.assertEqual(decision.rejected_candidates[0].constraint_failed, "runtime_failed_state")

    def test_memory_degradation_adaptation(self):
        """When available RAM drops, router eliminates high-memory models and selects lightweight fallback."""
        low_memory_hw = HardwareCapabilities(
            os=OSInfo(system="windows", release="11", version="10.0", architecture="x86_64"),
            cpu=CPUInfo(architecture="x86_64", physical_cores=4, logical_cores=8),
            memory=MemoryInfo(total_bytes=8 * (1024 ** 3), available_bytes=3 * (1024 ** 3)), # Only 3GB available
            gpus=[],
            primary_accelerator=AcceleratorType.CPU,
        )

        class MockDetector:
            def __init__(self, hw):
                self.hw = hw
            def detect(self):
                return self.hw

        router = DeterministicModelRouter(
            model_registry=self.model_registry,
            backend_registry=self.backend_registry,
            hardware_detector=MockDetector(low_memory_hw),
            lifecycle_tracker=self.lifecycle,
        )

        req = RoutingRequest(task_type=TaskType.CODE)
        decision = router.route(req)

        # Only tiny-coder-1b (min_ram: 2.0GB) can fit in 3GB
        self.assertEqual(decision.selected_model_id, "tiny-coder-1b")
        self.assertEqual(len(decision.rejected_candidates), 2)
        rejected_ids = [r.model_id for r in decision.rejected_candidates]
        self.assertIn("primary-coder-14b", rejected_ids)
        self.assertIn("secondary-coder-7b", rejected_ids)


if __name__ == "__main__":
    unittest.main()
