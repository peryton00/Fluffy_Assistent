"""
Canonical AI Gateway for Fluffy Assistant

Provides the single canonical programmatic AI execution boundary coordinating
ModelRouter, AIModelRuntime, fallback policies, cancellation, and response normalization.
"""

from dataclasses import dataclass, field
import threading
import time
import uuid
from typing import Dict, Any, Optional, List, Iterator, Union, TYPE_CHECKING

if TYPE_CHECKING:
    from brain.agent.contracts import ExecutionErrorCategory

from brain.ai.models.metadata import ModelCapability
from brain.ai.router.decision import RoutingDecision, RoutingError
from brain.ai.router.interface import ModelRouter
from brain.ai.router.policies import RoutingPolicyProfile
from brain.ai.router.request import (
    RoutingRequest,
    TaskType,
    QualityRequirement,
    LatencyRequirement,
    ResourceBudget,
)
from brain.ai.router.router import get_router
from brain.ai.runtime.health import RuntimeHealth
from brain.ai.runtime.interface import (
    AIModelRuntime,
    GenerationRequest,
    GenerationResponse,
    GenerationChunk,
    CancellationHandle,
)
from brain.ai.runtime.manager import get_runtime


@dataclass
class AIRequest:
    """
    Standardized request payload for the Canonical AI Gateway.
    """
    prompt: str
    task_type: TaskType = TaskType.GENERAL_CHAT
    quality: QualityRequirement = QualityRequirement.MEDIUM
    latency: LatencyRequirement = LatencyRequirement.BALANCED
    resource_budget: ResourceBudget = ResourceBudget.MEDIUM
    min_context: int = 2048
    preferred_model: Optional[str] = None
    max_tokens: int = 2048
    temperature: float = 0.7
    top_p: float = 0.95
    stop_sequences: List[str] = field(default_factory=list)
    task_id: Optional[str] = None
    step_id: Optional[str] = None
    correlation_id: Optional[str] = None
    request_id: Optional[str] = None
    context: Optional[str] = None
    policy_profile: Optional[RoutingPolicyProfile] = None
    required_capabilities: Optional[List[ModelCapability]] = None
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_routing_request(self) -> RoutingRequest:
        """Convert to internal router request."""
        req_id = self.request_id or self.correlation_id or str(uuid.uuid4())
        return RoutingRequest(
            task_type=self.task_type,
            minimum_quality=self.quality,
            latency_requirement=self.latency,
            resource_budget=self.resource_budget,
            minimum_context_length=self.min_context,
            preferred_model=self.preferred_model,
            policy_profile=self.policy_profile,
            required_capabilities=set(self.required_capabilities) if self.required_capabilities else set(),
            request_id=req_id,
            metadata=self.metadata,
        )

    def get_full_prompt(self) -> str:
        """Construct full prompt including contextual prelude if present."""
        if self.context:
            return f"Context:\n{self.context}\n\nTask:\n{self.prompt}"
        return self.prompt


def _resolve_error_category(cat_name: str) -> Any:
    try:
        from brain.agent.contracts import ExecutionErrorCategory
        return getattr(ExecutionErrorCategory, cat_name, cat_name)
    except Exception:
        return cat_name


@dataclass
class AIResult:
    """
    Standardized typed result emitted by the Canonical AI Gateway.
    """
    success: bool
    text: str = ""
    model_id: str = ""
    backend_id: str = ""
    finish_reason: str = "stop"
    usage: Dict[str, int] = field(default_factory=dict)
    latency_ms: float = 0.0
    routing_decision: Optional[Dict[str, Any]] = None
    request_id: Optional[str] = None
    correlation_id: Optional[str] = None
    task_id: Optional[str] = None
    step_id: Optional[str] = None
    error: Optional[str] = None
    error_category: Optional[Any] = None
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        """Serialize result to dictionary."""
        return {
            "success": self.success,
            "text": self.text,
            "model_id": self.model_id,
            "backend_id": self.backend_id,
            "finish_reason": self.finish_reason,
            "usage": self.usage,
            "latency_ms": round(self.latency_ms, 2),
            "routing_decision": self.routing_decision,
            "request_id": self.request_id,
            "correlation_id": self.correlation_id,
            "task_id": self.task_id,
            "step_id": self.step_id,
            "error": self.error,
            "error_category": getattr(self.error_category, "value", self.error_category) if self.error_category else None,
            "metadata": self.metadata,
        }


class AIGateway:
    """
    Canonical programmatic boundary for all AI model operations.

    Architecture:
    Caller -> AIGateway -> ModelRouter -> AIModelRuntime -> InferenceBackend
    """

    def __init__(
        self,
        model_router: Optional[ModelRouter] = None,
        runtime: Optional[AIModelRuntime] = None,
    ):
        self._model_router = model_router
        self._runtime = runtime

    @property
    def model_router(self) -> ModelRouter:
        """Retrieve authoritative model router."""
        if self._model_router is None:
            self._model_router = get_router()
        return self._model_router

    @property
    def runtime(self) -> AIModelRuntime:
        """Retrieve authoritative model runtime."""
        if self._runtime is None:
            self._runtime = get_runtime()
        return self._runtime

    def route(self, request: Union[AIRequest, RoutingRequest]) -> RoutingDecision:
        """
        Delegate model routing to authoritative ModelRouter.
        """
        routing_req = request.to_routing_request() if isinstance(request, AIRequest) else request
        return self.model_router.route(routing_req)

    def generate(
        self,
        request: AIRequest,
        cancellation: Optional[CancellationHandle] = None,
    ) -> AIResult:
        """
        Execute synchronous/non-streaming inference through the canonical AI pipeline.
        """
        start_time = time.perf_counter()
        req_id = request.request_id or request.correlation_id or str(uuid.uuid4())

        # Check early cancellation
        if cancellation and cancellation.is_cancelled:
            duration_ms = (time.perf_counter() - start_time) * 1000.0
            return AIResult(
                success=False,
                request_id=req_id,
                correlation_id=request.correlation_id,
                task_id=request.task_id,
                step_id=request.step_id,
                error="Inference was cancelled before execution.",
                error_category=_resolve_error_category("CANCELLATION"),
                latency_ms=duration_ms,
            )

        # 1. Route to select model & backend
        try:
            decision = self.route(request)
        except RoutingError as e:
            duration_ms = (time.perf_counter() - start_time) * 1000.0
            return AIResult(
                success=False,
                request_id=req_id,
                correlation_id=request.correlation_id,
                task_id=request.task_id,
                step_id=request.step_id,
                error=f"Model routing failed: {e.message}",
                error_category=_resolve_error_category("MODEL"),
                latency_ms=duration_ms,
                metadata={"routing_code": e.code},
            )
        except Exception as e:
            duration_ms = (time.perf_counter() - start_time) * 1000.0
            return AIResult(
                success=False,
                request_id=req_id,
                correlation_id=request.correlation_id,
                task_id=request.task_id,
                step_id=request.step_id,
                error=f"Unexpected error during model routing: {str(e)}",
                error_category=_resolve_error_category("INTERNAL"),
                latency_ms=duration_ms,
            )

        # 2. Build runtime generation request
        full_prompt = request.get_full_prompt()
        gen_req = GenerationRequest(
            prompt=full_prompt,
            model_id=decision.selected_model_id,
            max_tokens=request.max_tokens,
            temperature=request.temperature,
            top_p=request.top_p,
            stop_sequences=request.stop_sequences,
            task_id=request.task_id or req_id,
            metadata={
                "correlation_id": request.correlation_id,
                "step_id": request.step_id,
                **request.metadata,
            },
        )

        # 3. Execute inference via AIModelRuntime
        try:
            gen_resp: GenerationResponse = self.runtime.generate(
                request=gen_req,
                cancellation=cancellation,
            )
            duration_ms = (time.perf_counter() - start_time) * 1000.0

            return AIResult(
                success=True,
                text=gen_resp.text,
                model_id=gen_resp.model_id,
                backend_id=gen_resp.backend_id,
                finish_reason=gen_resp.finish_reason,
                usage=gen_resp.usage,
                latency_ms=duration_ms,
                routing_decision=decision.to_dict(),
                request_id=req_id,
                correlation_id=request.correlation_id,
                task_id=request.task_id,
                step_id=request.step_id,
            )

        except Exception as e:
            duration_ms = (time.perf_counter() - start_time) * 1000.0
            err_msg = str(e)
            err_lower = err_msg.lower()

            if cancellation and cancellation.is_cancelled or "cancel" in err_lower:
                category = _resolve_error_category("CANCELLATION")
            elif "timeout" in err_lower or "timed out" in err_lower:
                category = _resolve_error_category("TIMEOUT")
            elif "model" in err_lower or "unavailable" in err_lower:
                category = _resolve_error_category("MODEL")
            else:
                category = _resolve_error_category("INTERNAL")

            return AIResult(
                success=False,
                model_id=decision.selected_model_id,
                backend_id=decision.selected_backend_id,
                error=f"Model execution error: {err_msg}",
                error_category=category,
                latency_ms=duration_ms,
                routing_decision=decision.to_dict(),
                request_id=req_id,
                correlation_id=request.correlation_id,
                task_id=request.task_id,
                step_id=request.step_id,
            )

    def stream(
        self,
        request: AIRequest,
        cancellation: Optional[CancellationHandle] = None,
    ) -> Iterator[GenerationChunk]:
        """
        Execute streaming inference through the canonical AI pipeline.
        """
        # 1. Route to select model & backend
        decision = self.route(request)

        # 2. Build runtime generation request
        full_prompt = request.get_full_prompt()
        gen_req = GenerationRequest(
            prompt=full_prompt,
            model_id=decision.selected_model_id,
            max_tokens=request.max_tokens,
            temperature=request.temperature,
            top_p=request.top_p,
            stop_sequences=request.stop_sequences,
            task_id=request.task_id or request.request_id or request.correlation_id,
            metadata={
                "correlation_id": request.correlation_id,
                "step_id": request.step_id,
                **request.metadata,
            },
        )

        # 3. Stream from runtime
        return self.runtime.stream(gen_req, cancellation=cancellation)

    def health(self) -> RuntimeHealth:
        """Query diagnostic health of AI subsystem."""
        return self.runtime.health()

    def cancel(self, task_id: str) -> bool:
        """Cancel an active in-flight task by task_id."""
        return self.runtime.cancel(task_id)


_GLOBAL_AI_GATEWAY: Optional[AIGateway] = None
_GLOBAL_AI_GW_LOCK = threading.RLock()


def get_ai_gateway() -> AIGateway:
    """Retrieve or initialize the global AIGateway singleton."""
    global _GLOBAL_AI_GATEWAY
    if _GLOBAL_AI_GATEWAY is None:
        with _GLOBAL_AI_GW_LOCK:
            if _GLOBAL_AI_GATEWAY is None:
                _GLOBAL_AI_GATEWAY = AIGateway()
    return _GLOBAL_AI_GATEWAY


def set_ai_gateway(gateway: Optional[AIGateway]) -> None:
    """Override or reset the global AIGateway singleton."""
    global _GLOBAL_AI_GATEWAY
    with _GLOBAL_AI_GW_LOCK:
        _GLOBAL_AI_GATEWAY = gateway
