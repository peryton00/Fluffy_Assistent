"""
Unit & Integration Tests for Canonical AIGateway in Fluffy Assistant
Validates Phase 8 model routing, runtime execution, streaming, cancellation, error normalization, and StepExecutor integration.
"""

import unittest
from unittest.mock import MagicMock
from typing import Iterator, List, Dict, Any, Optional

from brain.agent.contracts import ExecutionErrorCategory
from brain.agent.execution import StepExecutor
from brain.agent.observation import StepObservation
from brain.agent.state import AgentState
from brain.agent.step import PlanStep, StepStatus
from brain.agent.task import AgentTask
from brain.ai.gateway import (
    AIGateway,
    AIRequest,
    AIResult,
    get_ai_gateway,
    set_ai_gateway,
)
from brain.ai.router.decision import RoutingDecision, RoutingError
from brain.ai.router.interface import ModelRouter
from brain.ai.router.request import (
    RoutingRequest,
    TaskType,
    QualityRequirement,
    LatencyRequirement,
    ResourceBudget,
)
from brain.ai.runtime.health import RuntimeHealth, HealthStatus
from brain.ai.runtime.interface import (
    AIModelRuntime,
    GenerationRequest,
    GenerationResponse,
    GenerationChunk,
    CancellationHandle,
)


class MockModelRouter(ModelRouter):
    """Mock ModelRouter returning deterministic decisions without hardware inspection."""

    def __init__(self, default_model: str = "local-llama-3-8b", default_backend: str = "llamacpp"):
        self.default_model = default_model
        self.default_backend = default_backend
        self.routed_requests: List[RoutingRequest] = []
        self.fail_routing: bool = False

    def route(self, request: RoutingRequest) -> RoutingDecision:
        self.routed_requests.append(request)
        if self.fail_routing:
            raise RoutingError("NO_CANDIDATES", "No compatible local models found for required task")

        selected = request.preferred_model or self.default_model
        return RoutingDecision(
            selected_model_id=selected,
            selected_backend_id=self.default_backend,
            score=0.95,
            reason="Highest scored compatible candidate",
            policy_profile="balanced",
            effective_weights={"quality": 0.4, "latency": 0.3},
            fallback_candidates=["fallback-model-7b"],
            request_id=request.request_id,
        )

    def explain(self, decision: RoutingDecision) -> Dict[str, Any]:
        return decision.to_dict()


class MockAIModelRuntime(AIModelRuntime):
    """Mock AIModelRuntime returning deterministic responses without real model weights."""

    def __init__(self):
        self.generated_requests: List[GenerationRequest] = []
        self.streamed_requests: List[GenerationRequest] = []
        self.cancelled_tasks: List[str] = []
        self.next_text: str = "Mocked AI generation output"
        self.raise_on_generate: Optional[Exception] = None

    def load(self, model_id: str, options: Optional[Dict[str, Any]] = None) -> bool:
        return True

    def unload(self, model_id: str) -> bool:
        return True

    def generate(
        self,
        request: GenerationRequest,
        cancellation: Optional[CancellationHandle] = None,
    ) -> GenerationResponse:
        self.generated_requests.append(request)
        if cancellation and cancellation.is_cancelled:
            raise RuntimeError("Inference operation was cancelled")
        if self.raise_on_generate:
            raise self.raise_on_generate

        return GenerationResponse(
            text=self.next_text,
            model_id=request.model_id or "local-llama-3-8b",
            backend_id="llamacpp",
            finish_reason="stop",
            usage={"prompt_tokens": 15, "completion_tokens": 30, "total_tokens": 45},
            latency_ms=42.0,
        )

    def stream(
        self,
        request: GenerationRequest,
        cancellation: Optional[CancellationHandle] = None,
    ) -> Iterator[GenerationChunk]:
        self.streamed_requests.append(request)
        tokens = ["Hello", " world", " from", " local", " AI", "!"]
        for i, token in enumerate(tokens):
            if cancellation and cancellation.is_cancelled:
                break
            is_final = (i == len(tokens) - 1)
            yield GenerationChunk(
                delta=token,
                model_id=request.model_id or "local-llama-3-8b",
                is_final=is_final,
                finish_reason="stop" if is_final else None,
            )

    def health(self) -> RuntimeHealth:
        return RuntimeHealth(
            status=HealthStatus.HEALTHY,
            runtime_available=True,
            backend_available=True,
            backend_id="llamacpp",
            loaded_models=["local-llama-3-8b"],
            hardware_accelerator="cpu",
            memory_pressure="low",
        )

    def cancel(self, task_id: str) -> bool:
        self.cancelled_tasks.append(task_id)
        return True


class TestAIGateway(unittest.TestCase):
    """Test suite for Phase 8: Canonical AI Gateway."""

    def setUp(self):
        self.mock_router = MockModelRouter()
        self.mock_runtime = MockAIModelRuntime()
        self.gateway = AIGateway(
            model_router=self.mock_router,
            runtime=self.mock_runtime,
        )

    def tearDown(self):
        set_ai_gateway(None)

    # -------------------------------------------------------------------------
    # A. Gateway Construction & No Eager Model Load
    # -------------------------------------------------------------------------

    def test_gateway_construction_without_eager_model_loading(self):
        """Constructing AIGateway with injected dependencies does not load weights or fail on headless environments."""
        gw = AIGateway(model_router=self.mock_router, runtime=self.mock_runtime)
        self.assertIs(gw.model_router, self.mock_router)
        self.assertIs(gw.runtime, self.mock_runtime)
        self.assertEqual(len(self.mock_runtime.generated_requests), 0)

    def test_singleton_getter_and_setter(self):
        """get_ai_gateway and set_ai_gateway manage the process singleton."""
        set_ai_gateway(self.gateway)
        self.assertIs(get_ai_gateway(), self.gateway)
        set_ai_gateway(None)

    # -------------------------------------------------------------------------
    # B. Model Routing Delegation
    # -------------------------------------------------------------------------

    def test_gateway_delegates_routing_to_model_router(self):
        """Gateway routes requests via ModelRouter without duplicate routing logic."""
        req = AIRequest(
            prompt="Write a Python quicksort algorithm",
            task_type=TaskType.CODE,
            quality=QualityRequirement.HIGH,
            preferred_model="qwen-2.5-coder-7b",
        )
        decision = self.gateway.route(req)

        self.assertEqual(len(self.mock_router.routed_requests), 1)
        routed_req = self.mock_router.routed_requests[0]
        self.assertEqual(routed_req.task_type, TaskType.CODE)
        self.assertEqual(routed_req.minimum_quality, QualityRequirement.HIGH)
        self.assertEqual(decision.selected_model_id, "qwen-2.5-coder-7b")

    # -------------------------------------------------------------------------
    # C. Synchronous Inference Execution & Result Normalization
    # -------------------------------------------------------------------------

    def test_generate_success_and_result_normalization(self):
        """generate() executes inference and emits normalized AIResult with telemetry."""
        req = AIRequest(
            prompt="Explain gravity in one sentence",
            context="Physics 101",
            task_id="task_ai_1",
            step_id="step_ai_1",
            correlation_id="corr_ai_1",
            max_tokens=100,
            temperature=0.3,
        )
        res = self.gateway.generate(req)

        self.assertTrue(res.success)
        self.assertEqual(res.text, "Mocked AI generation output")
        self.assertEqual(res.model_id, "local-llama-3-8b")
        self.assertEqual(res.backend_id, "llamacpp")
        self.assertEqual(res.task_id, "task_ai_1")
        self.assertEqual(res.step_id, "step_ai_1")
        self.assertEqual(res.correlation_id, "corr_ai_1")
        self.assertEqual(res.finish_reason, "stop")
        self.assertGreater(res.latency_ms, 0.0)
        self.assertIsNotNone(res.routing_decision)
        self.assertEqual(res.routing_decision["selected_model"], "local-llama-3-8b")

        # Verify GenerationRequest payload passed to runtime
        self.assertEqual(len(self.mock_runtime.generated_requests), 1)
        gen_req = self.mock_runtime.generated_requests[0]
        self.assertIn("Context:\nPhysics 101", gen_req.prompt)
        self.assertIn("Task:\nExplain gravity in one sentence", gen_req.prompt)
        self.assertEqual(gen_req.max_tokens, 100)
        self.assertEqual(gen_req.temperature, 0.3)

    # -------------------------------------------------------------------------
    # D. Streaming Inference
    # -------------------------------------------------------------------------

    def test_stream_yields_ordered_token_chunks(self):
        """stream() yields token chunks with model_id and completion markers."""
        req = AIRequest(prompt="Count from 1 to 5")
        chunks = list(self.gateway.stream(req))

        self.assertEqual(len(chunks), 6)
        joined_text = "".join(c.delta for c in chunks)
        self.assertEqual(joined_text, "Hello world from local AI!")
        self.assertTrue(chunks[-1].is_final)
        self.assertEqual(chunks[-1].finish_reason, "stop")

    # -------------------------------------------------------------------------
    # E. Error Normalization: Routing Failure
    # -------------------------------------------------------------------------

    def test_routing_failure_maps_to_structured_error(self):
        """Model routing failure returns AIResult with error_category MODEL."""
        self.mock_router.fail_routing = True
        req = AIRequest(prompt="Should fail routing")
        res = self.gateway.generate(req)

        self.assertFalse(res.success)
        self.assertEqual(res.error_category, ExecutionErrorCategory.MODEL)
        self.assertIn("Model routing failed", res.error)
        self.assertEqual(len(self.mock_runtime.generated_requests), 0)

    # -------------------------------------------------------------------------
    # F. Error Normalization: Timeout & Runtime Exceptions
    # -------------------------------------------------------------------------

    def test_timeout_maps_to_timeout_category(self):
        """Runtime timeout error maps to ExecutionErrorCategory.TIMEOUT."""
        self.mock_runtime.raise_on_generate = TimeoutError("Inference timed out after 30.0s")
        req = AIRequest(prompt="Timeout prompt")
        res = self.gateway.generate(req)

        self.assertFalse(res.success)
        self.assertEqual(res.error_category, ExecutionErrorCategory.TIMEOUT)
        self.assertIn("timed out", res.error.lower())

    # -------------------------------------------------------------------------
    # G. Cancellation Handling
    # -------------------------------------------------------------------------

    def test_cancellation_handle_prevents_runtime_execution(self):
        """Pre-cancelled handle returns CANCELLATION error without executing runtime."""
        handle = CancellationHandle()
        handle.cancel()

        req = AIRequest(prompt="Should not execute")
        res = self.gateway.generate(req, cancellation=handle)

        self.assertFalse(res.success)
        self.assertEqual(res.error_category, ExecutionErrorCategory.CANCELLATION)
        self.assertEqual(len(self.mock_runtime.generated_requests), 0)

    def test_gateway_cancel_delegates_to_runtime(self):
        """cancel(task_id) delegates to AIModelRuntime.cancel(task_id)."""
        cancelled = self.gateway.cancel("task_123")
        self.assertTrue(cancelled)
        self.assertIn("task_123", self.mock_runtime.cancelled_tasks)

    # -------------------------------------------------------------------------
    # H. Health Check Delegation
    # -------------------------------------------------------------------------

    def test_health_delegates_to_runtime(self):
        """health() queries runtime diagnostic health."""
        h = self.gateway.health()
        self.assertEqual(h.status, HealthStatus.HEALTHY)
        self.assertEqual(h.backend_id, "llamacpp")

    # -------------------------------------------------------------------------
    # I. StepExecutor Integration
    # -------------------------------------------------------------------------

    def test_step_executor_integrates_ai_gateway(self):
        """StepExecutor routes model steps through AIGateway."""
        executor = StepExecutor(ai_gateway=self.gateway)

        step = PlanStep(
            objective="Analyze code complexity",
            step_id="step_ai_exec",
            model_requirement={"task_type": "reasoning", "quality": "high"},
            input_parameters={"prompt": "Analyze function foo()"},
        )
        task = AgentTask(user_request="Code Analysis", task_id="task_ai_exec")
        state = AgentState(task=task)

        obs: StepObservation = executor.execute_step(step, state)

        self.assertTrue(obs.success)
        self.assertEqual(obs.output, "Mocked AI generation output")
        self.assertEqual(obs.model_used, "local-llama-3-8b")
        self.assertIn("routing_decision", obs.metadata)
        self.assertEqual(len(self.mock_runtime.generated_requests), 1)


if __name__ == "__main__":
    unittest.main()
