"""
Deterministic Model Router
Implements the core production Model Router for Fluffy.
Selects optimal local models without LLM invocations using strict capability filtering
and multi-factor deterministic scoring.
"""

import time
from typing import Optional, Dict, Any, List

from brain.ai.backends.registry import BackendRegistry, get_backend_registry
from brain.ai.hardware.capabilities import HardwareCapabilities
from brain.ai.hardware.detector import HardwareDetector, get_hardware_detector
from brain.ai.models.registry import ModelRegistry, get_model_registry
from brain.ai.router.constraints import ConstraintEvaluator
from brain.ai.router.decision import (
    CandidateEvaluation,
    CandidateRejection,
    RoutingDecision,
    RoutingError,
)
from brain.ai.router.interface import ModelRouter
from brain.ai.router.policies import (
    RoutingPolicy,
    RoutingPolicyProfile,
    RoutingWeights,
)
from brain.ai.router.request import RoutingRequest
from brain.ai.router.scoring import CandidateScorer
from brain.ai.runtime.lifecycle import ModelLifecycleTracker, get_lifecycle_tracker


class DeterministicModelRouter(ModelRouter):
    """
    Production-grade, platform-independent Model Router.
    Routes tasks to local AI models deterministically using multi-tier constraint evaluation
    and weighted scoring policies.
    """

    def __init__(
        self,
        model_registry: Optional[ModelRegistry] = None,
        backend_registry: Optional[BackendRegistry] = None,
        hardware_detector: Optional[HardwareDetector] = None,
        lifecycle_tracker: Optional[ModelLifecycleTracker] = None,
        default_profile: RoutingPolicyProfile = RoutingPolicyProfile.BALANCED,
    ):
        self._model_registry = model_registry
        self._backend_registry = backend_registry
        self._hardware_detector = hardware_detector
        self._lifecycle_tracker = lifecycle_tracker
        self._default_profile = default_profile

    @property
    def model_registry(self) -> ModelRegistry:
        if self._model_registry is None:
            self._model_registry = get_model_registry()
        return self._model_registry

    @property
    def backend_registry(self) -> BackendRegistry:
        if self._backend_registry is None:
            self._backend_registry = get_backend_registry()
        return self._backend_registry

    @property
    def hardware_detector(self) -> HardwareDetector:
        if self._hardware_detector is None:
            self._hardware_detector = get_hardware_detector()
        return self._hardware_detector

    @property
    def lifecycle_tracker(self) -> ModelLifecycleTracker:
        if self._lifecycle_tracker is None:
            self._lifecycle_tracker = get_lifecycle_tracker()
        return self._lifecycle_tracker

    def route(self, request: RoutingRequest) -> RoutingDecision:
        """
        Evaluate candidate models and select the optimal candidate for the request.
        """
        start_time = time.perf_counter()

        # 1. Resolve active hardware profile and policy weights
        hardware = self.hardware_detector.detect()
        profile = request.policy_profile or self._default_profile
        weights = RoutingPolicy.get_weights(profile)

        # 2. Query available candidate models from ModelRegistry
        candidates = self.model_registry.list_all()

        if not candidates:
            raise RoutingError(
                code="NO_MODELS_REGISTERED",
                message="No models are registered in the ModelRegistry.",
                rejected_candidates=[],
            )

        evaluated: List[CandidateEvaluation] = []
        rejected: List[CandidateRejection] = []

        # 3. Multi-tier evaluation: Hard constraints first, then scoring
        for model in candidates:
            is_viable, rejection = ConstraintEvaluator.evaluate(
                model=model,
                request=request,
                hardware=hardware,
                backend_registry=self.backend_registry,
                lifecycle=self.lifecycle_tracker,
            )

            if not is_viable and rejection is not None:
                rejected.append(rejection)
                continue

            # Candidate satisfied all hard constraints -> evaluate soft score
            eval_result = CandidateScorer.score_candidate(
                model=model,
                request=request,
                hardware=hardware,
                backend_registry=self.backend_registry,
                weights=weights,
                lifecycle=self.lifecycle_tracker,
            )
            evaluated.append(eval_result)

        # 4. Check if any candidate survived
        if not evaluated:
            reasons = "; ".join(f"{r.model_id}: {r.reason}" for r in rejected)
            raise RoutingError(
                code="NO_VIABLE_CANDIDATE",
                message=f"No models satisfied all hard constraints for request '{request.request_id}'. Rejections: {reasons}",
                rejected_candidates=rejected,
            )

        # 5. Deterministic ranking: Sort descending by score, tie-break by model_id
        evaluated.sort(key=lambda c: (-c.score, c.model_id))

        winner = evaluated[0]
        fallbacks = [c.model_id for c in evaluated[1:]]

        elapsed_ms = (time.perf_counter() - start_time) * 1000.0

        # Construct concise reason summary
        loaded_str = " (already loaded)" if winner.is_already_loaded else ""
        reason = (
            f"Selected '{winner.model_id}'{loaded_str} with score {winner.score:.2f} "
            f"under policy '{profile.value}' across {len(evaluated)} viable candidates."
        )

        return RoutingDecision(
            selected_model_id=winner.model_id,
            selected_backend_id=winner.backend_id,
            score=winner.score,
            reason=reason,
            policy_profile=profile.value,
            effective_weights=weights.to_dict(),
            evaluated_candidates=evaluated,
            rejected_candidates=rejected,
            fallback_candidates=fallbacks,
            routing_latency_ms=elapsed_ms,
            request_id=request.request_id,
        )

    def explain(self, decision: RoutingDecision) -> Dict[str, Any]:
        """Provide detailed explainability diagnostic metadata for a decision."""
        return decision.to_dict()


# Global singleton router instance
_model_router: Optional[ModelRouter] = None


def get_router() -> ModelRouter:
    """Get or create the global ModelRouter instance."""
    global _model_router
    if _model_router is None:
        _model_router = DeterministicModelRouter()
    return _model_router


def set_router(router: ModelRouter) -> None:
    """Set or override the global ModelRouter instance (useful for testing or custom routers)."""
    global _model_router
    _model_router = router
