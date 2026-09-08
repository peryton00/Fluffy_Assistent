"""
Model Router End-to-End Integration Tests
Verifies full pipeline execution: Request -> Router -> Decision -> Runtime Generation.
"""

import unittest

from brain.ai.backends.reference import ReferenceBackend
from brain.ai.backends.registry import BackendRegistry
from brain.ai.hardware.capabilities import (
    AcceleratorType,
    CPUInfo,
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
from brain.ai.router.decision import RoutingError
from brain.ai.router.policies import RoutingPolicyProfile
from brain.ai.router.request import RoutingRequest, TaskType
from brain.ai.router.router import (
    DeterministicModelRouter,
    get_router,
    set_router,
)
from brain.ai.runtime.manager import RuntimeManager
from brain.ai.runtime.interface import GenerationRequest


class MockDetector:
    def __init__(self, hw):
        self.hw = hw
    def detect(self):
        return self.hw


class TestRouterEndToEnd(unittest.TestCase):
    """End-to-end integration tests for Model Router & Runtime Handshake."""

    def setUp(self):
        self.model_registry = ModelRegistry()
        self.backend_registry = BackendRegistry()
        self.ref_backend = ReferenceBackend()
        self.backend_registry.register(self.ref_backend)

        self.hardware = HardwareCapabilities(
            os=OSInfo(system="windows", release="11", version="10.0", architecture="x86_64"),
            cpu=CPUInfo(architecture="x86_64", physical_cores=8, logical_cores=16),
            memory=MemoryInfo(total_bytes=16 * (1024 ** 3), available_bytes=12 * (1024 ** 3)),
            gpus=[],
            primary_accelerator=AcceleratorType.CPU,
        )

        # Register models
        self.chat_model = ModelDefinition(
            model_id="reference-chat",
            display_name="Reference Chat Model",
            provider="reference",
            parameter_count="3B",
            capabilities=[ModelCapability.TEXT_GENERATION, ModelCapability.CHAT],
            requirements=ModelRequirements(min_ram_gb=2.0),
            is_installed=True,
        )
        self.code_model = ModelDefinition(
            model_id="reference-coder",
            display_name="Reference Coder Model",
            provider="reference",
            parameter_count="7B",
            capabilities=[ModelCapability.TEXT_GENERATION, ModelCapability.CHAT, ModelCapability.CODE],
            requirements=ModelRequirements(min_ram_gb=4.0),
            is_installed=True,
        )

        self.model_registry.register(self.chat_model)
        self.model_registry.register(self.code_model)

        self.router = DeterministicModelRouter(
            model_registry=self.model_registry,
            backend_registry=self.backend_registry,
            hardware_detector=MockDetector(self.hardware),
        )

        self.runtime = RuntimeManager(
            backend_registry=self.backend_registry,
            registry=self.model_registry,
        )

    def test_routing_and_inference_handshake(self):
        """A routing decision seamlessly routes into AIModelRuntime for prompt generation."""
        # 1. Route coding task
        req = RoutingRequest(
            task_type=TaskType.CODE,
            required_capabilities=[ModelCapability.CODE],
            policy_profile=RoutingPolicyProfile.BALANCED,
        )
        decision = self.router.route(req)

        self.assertEqual(decision.selected_model_id, "reference-coder")
        self.assertEqual(decision.selected_backend_id, "reference")
        self.assertGreater(decision.score, 0.0)

        # 2. Hand decision directly to AI runtime for text generation
        gen_req = GenerationRequest(
            model_id=decision.selected_model_id,
            prompt="Write a binary search function in Python.",
        )
        response = self.runtime.generate(gen_req)

        self.assertIsNotNone(response)
        self.assertEqual(response.model_id, "reference-coder")
        self.assertTrue(len(response.text) > 0)

    def test_explainability_diagnostic_output(self):
        """Explainability output produces detailed JSON-serializable diagnostic metadata."""
        req = RoutingRequest(
            task_type=TaskType.GENERAL_CHAT,
            request_id="test-req-42",
        )
        decision = self.router.route(req)
        explanation = self.router.explain(decision)

        self.assertEqual(explanation["request_id"], "test-req-42")
        self.assertIn("selected_model", explanation)
        self.assertIn("score", explanation)
        self.assertIn("evaluated_candidates", explanation)
        self.assertIn("rejected_candidates", explanation)
        self.assertIn("effective_weights", explanation)
        self.assertIsInstance(explanation["evaluated_candidates"], list)
        self.assertGreater(len(explanation["evaluated_candidates"]), 0)

    def test_routing_error_when_no_candidate_satisfies_constraints(self):
        """Raises RoutingError with detailed rejection logs when constraints are unsatisfied."""
        # Request impossible capability
        req = RoutingRequest(
            task_type=TaskType.VISION,
            required_capabilities=[ModelCapability.VISION],
        )

        with self.assertRaises(RoutingError) as ctx:
            self.router.route(req)

        err = ctx.exception
        self.assertEqual(err.code, "NO_VIABLE_CANDIDATE")
        self.assertEqual(len(err.rejected_candidates), 2)
        for r in err.rejected_candidates:
            self.assertEqual(r.constraint_failed, "missing_required_capability")

    def test_global_singleton_getter_and_setter(self):
        """Test get_router and set_router lifecycle."""
        custom_router = DeterministicModelRouter()
        set_router(custom_router)
        self.assertIs(get_router(), custom_router)


if __name__ == "__main__":
    unittest.main()
