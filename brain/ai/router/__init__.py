"""
Fluffy AI Model Router Module
Provides production-grade, platform-independent local model routing and selection.
"""

from brain.ai.router.request import (
    TaskType,
    LatencyRequirement,
    QualityRequirement,
    ResourceBudget,
    RoutingRequest,
)
from brain.ai.router.policies import (
    RoutingPolicyProfile,
    RoutingWeights,
    RoutingPolicy,
)
from brain.ai.router.decision import (
    CandidateRejection,
    CandidateEvaluation,
    RoutingDecision,
    RoutingError,
)
from brain.ai.router.constraints import ConstraintEvaluator
from brain.ai.router.scoring import CandidateScorer
from brain.ai.router.interface import ModelRouter
from brain.ai.router.router import DeterministicModelRouter, get_router, set_router

__all__ = [
    "TaskType",
    "LatencyRequirement",
    "QualityRequirement",
    "ResourceBudget",
    "RoutingRequest",
    "RoutingPolicyProfile",
    "RoutingWeights",
    "RoutingPolicy",
    "CandidateRejection",
    "CandidateEvaluation",
    "RoutingDecision",
    "RoutingError",
    "ConstraintEvaluator",
    "CandidateScorer",
    "ModelRouter",
    "DeterministicModelRouter",
    "get_router",
    "set_router",
]
