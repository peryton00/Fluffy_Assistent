"""
Routing Decision Data Structures & Errors
Provides structured, explainable output from the Model Router.
"""

from dataclasses import dataclass, field
from typing import List, Dict, Optional, Any


@dataclass(frozen=True)
class CandidateRejection:
    """Explains why a specific model candidate failed hard constraint checks."""
    model_id: str
    reason: str
    constraint_failed: str


@dataclass(frozen=True)
class CandidateEvaluation:
    """Detailed score breakdown for a candidate that satisfied all hard constraints."""
    model_id: str
    score: float
    score_breakdown: Dict[str, float]
    backend_id: str
    is_already_loaded: bool


@dataclass
class RoutingDecision:
    """
    Final decision emitted by the Model Router.
    Contains the selected model, selected backend, explainability diagnostics, and fallback chain.
    """
    selected_model_id: str
    selected_backend_id: str
    score: float
    reason: str
    policy_profile: str
    effective_weights: Dict[str, float]
    evaluated_candidates: List[CandidateEvaluation] = field(default_factory=list)
    rejected_candidates: List[CandidateRejection] = field(default_factory=list)
    fallback_candidates: List[str] = field(default_factory=list)
    routing_latency_ms: float = 0.0
    request_id: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        """Serialize decision for telemetry and diagnostics."""
        return {
            "request_id": self.request_id,
            "selected_model": self.selected_model_id,
            "selected_backend": self.selected_backend_id,
            "score": round(self.score, 2),
            "reason": self.reason,
            "policy_profile": self.policy_profile,
            "effective_weights": self.effective_weights,
            "routing_latency_ms": round(self.routing_latency_ms, 2),
            "evaluated_candidates": [
                {
                    "model_id": c.model_id,
                    "score": round(c.score, 2),
                    "score_breakdown": {k: round(v, 2) for k, v in c.score_breakdown.items()},
                    "backend_id": c.backend_id,
                    "is_already_loaded": c.is_already_loaded,
                }
                for c in self.evaluated_candidates
            ],
            "rejected_candidates": [
                {
                    "model_id": r.model_id,
                    "constraint_failed": r.constraint_failed,
                    "reason": r.reason,
                }
                for r in self.rejected_candidates
            ],
            "fallback_candidates": self.fallback_candidates,
        }


class RoutingError(Exception):
    """Exception raised when model routing cannot identify a compatible candidate."""

    def __init__(self, code: str, message: str, rejected_candidates: Optional[List[CandidateRejection]] = None):
        super().__init__(f"[{code}] {message}")
        self.code = code
        self.message = message
        self.rejected_candidates = rejected_candidates or []
