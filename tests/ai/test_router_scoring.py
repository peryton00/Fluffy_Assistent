"""
Model Router Scoring Tests
Verifies multi-factor scoring arithmetic, policy profiles, and soft preferences.
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
from brain.ai.router.policies import (
    RoutingPolicy,
    RoutingPolicyProfile,
)
from brain.ai.router.request import (
    RoutingRequest,
    TaskType,
    LatencyRequirement,
    QualityRequirement,
    ResourceBudget,
)
from brain.ai.router.scoring import CandidateScorer
from brain.ai.runtime.lifecycle import ModelLifecycleState, ModelLifecycleTracker


class TestRouterScoring(unittest.TestCase):
    """Test suite for candidate scoring and policy weight profiles."""

    def setUp(self):
        self.backend_registry = BackendRegistry()
        self.ref_backend = ReferenceBackend()
        self.backend_registry.register(self.ref_backend)

        self.hardware = HardwareCapabilities(
            os=OSInfo(system="windows", release="11", version="10.0", architecture="x86_64"),
            cpu=CPUInfo(architecture="x86_64", physical_cores=8, logical_cores=16),
            memory=MemoryInfo(total_bytes=32 * (1024 ** 3), available_bytes=24 * (1024 ** 3)),
            gpus=[
                GPUInfo(
                    index=0,
                    name="NVIDIA RTX 4090",
                    vendor="nvidia",
                    total_memory_bytes=24 * (1024 ** 3),
                    free_memory_bytes=20 * (1024 ** 3),
                    accelerator_type=AcceleratorType.CUDA,
                )
            ],
            primary_accelerator=AcceleratorType.CUDA,
        )

        self.lifecycle = ModelLifecycleTracker()

    def test_already_loaded_bonus(self):
        """A model that is already warm in memory receives the loaded bonus."""
        model_a = ModelDefinition(
            model_id="model-a",
            display_name="Model A",
            provider="reference",
            parameter_count="7B",
            is_installed=True,
            capabilities=[ModelCapability.TEXT_GENERATION, ModelCapability.CHAT],
        )
        model_b = ModelDefinition(
            model_id="model-b",
            display_name="Model B",
            provider="reference",
            parameter_count="7B",
            is_installed=True,
            capabilities=[ModelCapability.TEXT_GENERATION, ModelCapability.CHAT],
        )

        # Mark model A as LOADED
        self.lifecycle.transition("model-a", ModelLifecycleState.LOADED)

        req = RoutingRequest(task_type=TaskType.GENERAL_CHAT)
        weights = RoutingPolicy.get_weights(RoutingPolicyProfile.BALANCED)

        eval_a = CandidateScorer.score_candidate(
            model_a, req, self.hardware, self.backend_registry, weights, self.lifecycle
        )
        eval_b = CandidateScorer.score_candidate(
            model_b, req, self.hardware, self.backend_registry, weights, self.lifecycle
        )

        self.assertTrue(eval_a.is_already_loaded)
        self.assertFalse(eval_b.is_already_loaded)
        self.assertGreater(eval_a.score, eval_b.score)
        self.assertGreater(eval_a.score_breakdown["already_loaded_bonus"], 0.0)
        self.assertEqual(eval_b.score_breakdown["already_loaded_bonus"], 0.0)

    def test_preferred_model_soft_bonus(self):
        """Preferred model receives a soft score bonus."""
        model_a = ModelDefinition(
            model_id="model-a",
            display_name="Model A",
            provider="reference",
            parameter_count="7B",
            is_installed=True,
        )
        model_b = ModelDefinition(
            model_id="model-b",
            display_name="Model B",
            provider="reference",
            parameter_count="7B",
            is_installed=True,
        )

        req = RoutingRequest(task_type=TaskType.GENERAL_CHAT, preferred_model="model-b")
        weights = RoutingPolicy.get_weights(RoutingPolicyProfile.BALANCED)

        eval_a = CandidateScorer.score_candidate(
            model_a, req, self.hardware, self.backend_registry, weights, self.lifecycle
        )
        eval_b = CandidateScorer.score_candidate(
            model_b, req, self.hardware, self.backend_registry, weights, self.lifecycle
        )

        self.assertGreater(eval_b.score_breakdown["preferred_model_bonus"], 0.0)
        self.assertEqual(eval_a.score_breakdown["preferred_model_bonus"], 0.0)
        self.assertGreater(eval_b.score, eval_a.score)

    def test_quality_vs_performance_profile_difference(self):
        """Quality profile favors larger models; Performance profile favors smaller models."""
        small_model = ModelDefinition(
            model_id="small-1b",
            display_name="Small 1B",
            provider="reference",
            parameter_count="1B",
            quantization="Q4_K_M",
            is_installed=True,
        )
        large_model = ModelDefinition(
            model_id="large-30b",
            display_name="Large 30B",
            provider="reference",
            parameter_count="30B",
            quantization="FP16",
            is_installed=True,
        )

        req = RoutingRequest(task_type=TaskType.GENERAL_CHAT)

        perf_weights = RoutingPolicy.get_weights(RoutingPolicyProfile.PERFORMANCE)
        qual_weights = RoutingPolicy.get_weights(RoutingPolicyProfile.QUALITY)

        # Under Performance profile: small model should score higher on latency
        perf_small = CandidateScorer.score_candidate(small_model, req, self.hardware, self.backend_registry, perf_weights)
        perf_large = CandidateScorer.score_candidate(large_model, req, self.hardware, self.backend_registry, perf_weights)
        self.assertGreater(perf_small.score_breakdown["latency"], perf_large.score_breakdown["latency"])

        # Under Quality profile: large model should score higher on quality
        qual_small = CandidateScorer.score_candidate(small_model, req, self.hardware, self.backend_registry, qual_weights)
        qual_large = CandidateScorer.score_candidate(large_model, req, self.hardware, self.backend_registry, qual_weights)
        self.assertGreater(qual_large.score_breakdown["quality"], qual_small.score_breakdown["quality"])

    def test_task_specialization_scoring(self):
        """Coding tasks give higher specialization scores to coding-capable models."""
        general_model = ModelDefinition(
            model_id="general-model",
            display_name="General Chat",
            provider="reference",
            capabilities=[ModelCapability.TEXT_GENERATION, ModelCapability.CHAT],
            is_installed=True,
        )
        coding_model = ModelDefinition(
            model_id="coder-model",
            display_name="Expert Coder",
            provider="reference",
            capabilities=[ModelCapability.TEXT_GENERATION, ModelCapability.CODE],
            is_installed=True,
        )

        req = RoutingRequest(task_type=TaskType.CODE)
        weights = RoutingPolicy.get_weights(RoutingPolicyProfile.BALANCED)

        eval_gen = CandidateScorer.score_candidate(general_model, req, self.hardware, self.backend_registry, weights)
        eval_code = CandidateScorer.score_candidate(coding_model, req, self.hardware, self.backend_registry, weights)

        self.assertGreater(eval_code.score_breakdown["task_specialization"], eval_gen.score_breakdown["task_specialization"])


if __name__ == "__main__":
    unittest.main()
