"""
Routing Policies & Weight Profiles
Defines deterministic weighting strategies for ranking candidate models.
"""

from dataclasses import dataclass
from enum import Enum
from typing import Dict, Any


class RoutingPolicyProfile(str, Enum):
    """Preset routing strategy profiles."""
    BALANCED = "balanced"          # Equalized balance of quality, latency, and resource fit
    PERFORMANCE = "performance"    # Favors low latency, warm/loaded models, and speed
    QUALITY = "quality"            # Favors larger parameter counts, maximum context, and capabilities
    LOW_RESOURCE = "low_resource"  # Minimizes RAM/VRAM footprint, favors high quantization


@dataclass(frozen=True)
class RoutingWeights:
    """
    Weight coefficients applied during candidate scoring.
    All weights are normalized and deterministic.
    """
    capability_match: float = 25.0       # Bonus for matching preferred/extra capabilities
    quality: float = 20.0                # Model capability depth and parameter weight
    context_fit: float = 15.0            # Headroom between minimum required context and model max context
    hardware_fit: float = 15.0           # Comfortable memory/VRAM headroom
    latency: float = 10.0                # Predicted latency score based on size and quant
    already_loaded_bonus: float = 10.0   # Bonus for warm model resident in memory (avoids reload)
    preferred_model_bonus: float = 5.0   # Soft bonus for user/agent requested model preference
    task_specialization: float = 10.0    # Bonus when model metadata explicitly targets task type

    def to_dict(self) -> Dict[str, float]:
        return {
            "capability_match": self.capability_match,
            "quality": self.quality,
            "context_fit": self.context_fit,
            "hardware_fit": self.hardware_fit,
            "latency": self.latency,
            "already_loaded_bonus": self.already_loaded_bonus,
            "preferred_model_bonus": self.preferred_model_bonus,
            "task_specialization": self.task_specialization,
        }


class RoutingPolicy:
    """Provides standard weight profiles for routing decisions."""

    PROFILES: Dict[RoutingPolicyProfile, RoutingWeights] = {
        RoutingPolicyProfile.BALANCED: RoutingWeights(
            capability_match=25.0,
            quality=20.0,
            context_fit=15.0,
            hardware_fit=15.0,
            latency=10.0,
            already_loaded_bonus=10.0,
            preferred_model_bonus=5.0,
            task_specialization=10.0,
        ),
        RoutingPolicyProfile.PERFORMANCE: RoutingWeights(
            capability_match=20.0,
            quality=10.0,
            context_fit=10.0,
            hardware_fit=15.0,
            latency=25.0,
            already_loaded_bonus=20.0,
            preferred_model_bonus=5.0,
            task_specialization=10.0,
        ),
        RoutingPolicyProfile.QUALITY: RoutingWeights(
            capability_match=30.0,
            quality=30.0,
            context_fit=15.0,
            hardware_fit=10.0,
            latency=5.0,
            already_loaded_bonus=5.0,
            preferred_model_bonus=5.0,
            task_specialization=15.0,
        ),
        RoutingPolicyProfile.LOW_RESOURCE: RoutingWeights(
            capability_match=20.0,
            quality=10.0,
            context_fit=10.0,
            hardware_fit=30.0,
            latency=15.0,
            already_loaded_bonus=10.0,
            preferred_model_bonus=5.0,
            task_specialization=10.0,
        ),
    }

    @classmethod
    def get_weights(cls, profile: RoutingPolicyProfile) -> RoutingWeights:
        """Fetch preset weights for a policy profile."""
        return cls.PROFILES.get(profile, cls.PROFILES[RoutingPolicyProfile.BALANCED])
