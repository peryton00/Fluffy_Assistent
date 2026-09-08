"""
Model Router Constraint Evaluation Tests
Verifies strict hard-constraint filtering rules.
"""

import tempfile
import unittest
from pathlib import Path

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
    ModelFormat,
    ModelRequirements,
)
from brain.ai.router.constraints import ConstraintEvaluator
from brain.ai.router.request import RoutingRequest, TaskType
from brain.ai.runtime.lifecycle import ModelLifecycleState, ModelLifecycleTracker


class TestRouterConstraints(unittest.TestCase):
    """Test suite for ConstraintEvaluator hard-constraint checks."""

    def setUp(self):
        self.backend_registry = BackendRegistry()
        self.ref_backend = ReferenceBackend()
        self.backend_registry.register(self.ref_backend)

        self.hardware = HardwareCapabilities(
            os=OSInfo(system="windows", release="11", version="10.0", architecture="x86_64"),
            cpu=CPUInfo(architecture="x86_64", physical_cores=8, logical_cores=16),
            memory=MemoryInfo(total_bytes=16 * (1024 ** 3), available_bytes=12 * (1024 ** 3)),
            gpus=[
                GPUInfo(
                    index=0,
                    name="NVIDIA RTX 4080",
                    vendor="nvidia",
                    total_memory_bytes=16 * (1024 ** 3),
                    free_memory_bytes=12 * (1024 ** 3),
                    accelerator_type=AcceleratorType.CUDA,
                )
            ],
            primary_accelerator=AcceleratorType.CUDA,
        )

        self.lifecycle = ModelLifecycleTracker()

    def test_explicit_exclusion_constraint(self):
        """Excluded models must be rejected immediately."""
        model = ModelDefinition(
            model_id="llama-3.2-3b",
            display_name="Llama 3.2 3B",
            provider="reference",
            is_installed=True,
            capabilities=[ModelCapability.TEXT_GENERATION, ModelCapability.CHAT],
        )
        req = RoutingRequest(
            task_type=TaskType.GENERAL_CHAT,
            excluded_models=["llama-3.2-3b"],
        )

        is_viable, rejection = ConstraintEvaluator.evaluate(
            model, req, self.hardware, self.backend_registry, self.lifecycle
        )
        self.assertFalse(is_viable)
        self.assertIsNotNone(rejection)
        self.assertEqual(rejection.constraint_failed, "explicitly_excluded")

    def test_not_installed_or_missing_file(self):
        """Uninstalled local models or missing weight files must be rejected."""
        uninstalled_model = ModelDefinition(
            model_id="remote-cloud-model",
            display_name="Remote Model",
            provider="local",
            is_installed=False,
        )
        req = RoutingRequest(task_type=TaskType.GENERAL_CHAT)

        is_viable, rejection = ConstraintEvaluator.evaluate(
            uninstalled_model, req, self.hardware, self.backend_registry, self.lifecycle
        )
        self.assertFalse(is_viable)
        self.assertEqual(rejection.constraint_failed, "model_not_installed")

        missing_file_model = ModelDefinition(
            model_id="missing-file-model",
            display_name="Missing File Model",
            provider="local",
            file_path="C:/non_existent_weights_path/model.gguf",
            is_installed=True,
        )
        is_viable, rejection = ConstraintEvaluator.evaluate(
            missing_file_model, req, self.hardware, self.backend_registry, self.lifecycle
        )
        self.assertFalse(is_viable)
        self.assertEqual(rejection.constraint_failed, "missing_model_file")

    def test_missing_required_capability(self):
        """Models missing mandatory required capabilities must be rejected."""
        model = ModelDefinition(
            model_id="chat-only-model",
            display_name="Chat Only Model",
            provider="reference",
            is_installed=True,
            capabilities=[ModelCapability.CHAT, ModelCapability.TEXT_GENERATION],
        )
        req = RoutingRequest(
            task_type=TaskType.CODE,
            required_capabilities=[ModelCapability.CODE],
        )

        is_viable, rejection = ConstraintEvaluator.evaluate(
            model, req, self.hardware, self.backend_registry, self.lifecycle
        )
        self.assertFalse(is_viable)
        self.assertEqual(rejection.constraint_failed, "missing_required_capability")

    def test_insufficient_context_length(self):
        """Models with maximum context less than requested minimum must be rejected."""
        model = ModelDefinition(
            model_id="small-context-model",
            display_name="Small Context Model",
            provider="reference",
            is_installed=True,
            context_length=2048,
        )
        req = RoutingRequest(
            task_type=TaskType.GENERAL_CHAT,
            minimum_context_length=8192,
        )

        is_viable, rejection = ConstraintEvaluator.evaluate(
            model, req, self.hardware, self.backend_registry, self.lifecycle
        )
        self.assertFalse(is_viable)
        self.assertEqual(rejection.constraint_failed, "insufficient_context_length")

    def test_insufficient_ram_and_vram(self):
        """Models with requirements exceeding available RAM/VRAM must be rejected."""
        heavy_model = ModelDefinition(
            model_id="heavy-model",
            display_name="Heavy Model",
            provider="reference",
            is_installed=True,
            requirements=ModelRequirements(min_ram_gb=32.0, min_vram_gb=24.0),
        )
        req = RoutingRequest(task_type=TaskType.GENERAL_CHAT)

        is_viable, rejection = ConstraintEvaluator.evaluate(
            heavy_model, req, self.hardware, self.backend_registry, self.lifecycle
        )
        self.assertFalse(is_viable)
        self.assertEqual(rejection.constraint_failed, "insufficient_ram")

    def test_offline_requirement_enforcement(self):
        """Models violating offline requirements must be rejected."""
        cloud_model = ModelDefinition(
            model_id="cloud-api-model",
            display_name="Cloud API Model",
            provider="openai",
            is_installed=True,
        )
        req = RoutingRequest(task_type=TaskType.GENERAL_CHAT, offline_required=True)

        is_viable, rejection = ConstraintEvaluator.evaluate(
            cloud_model, req, self.hardware, self.backend_registry, self.lifecycle
        )
        self.assertFalse(is_viable)
        self.assertEqual(rejection.constraint_failed, "offline_violation")

    def test_runtime_failed_state(self):
        """Models in a failed runtime state must be rejected."""
        model = ModelDefinition(
            model_id="crashed-model",
            display_name="Crashed Model",
            provider="reference",
            is_installed=True,
        )
        self.lifecycle.transition("crashed-model", ModelLifecycleState.FAILED, details={"error": "OOM crash"})

        req = RoutingRequest(task_type=TaskType.GENERAL_CHAT)

        is_viable, rejection = ConstraintEvaluator.evaluate(
            model, req, self.hardware, self.backend_registry, self.lifecycle
        )
        self.assertFalse(is_viable)
        self.assertEqual(rejection.constraint_failed, "runtime_failed_state")


if __name__ == "__main__":
    unittest.main()
