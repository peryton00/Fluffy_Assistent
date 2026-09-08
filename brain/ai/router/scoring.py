"""
Candidate Scoring Engine
Computes deterministic multi-factor composite scores for viable model candidates.
"""

import re
from typing import Optional, Dict, Any, List

from brain.ai.backends.registry import BackendRegistry
from brain.ai.hardware.capabilities import HardwareCapabilities
from brain.ai.models.definition import ModelDefinition
from brain.ai.models.metadata import ModelCapability
from brain.ai.router.decision import CandidateEvaluation
from brain.ai.router.policies import RoutingWeights
from brain.ai.router.request import (
    RoutingRequest,
    TaskType,
    LatencyRequirement,
    QualityRequirement,
    ResourceBudget,
)
from brain.ai.runtime.lifecycle import ModelLifecycleState, ModelLifecycleTracker


class CandidateScorer:
    """
    Computes deterministic multi-factor composite scores for candidate models.
    All component scores are normalized to [0.0, 1.0] before applying policy weights.
    """

    @classmethod
    def score_candidate(
        cls,
        model: ModelDefinition,
        request: RoutingRequest,
        hardware: HardwareCapabilities,
        backend_registry: BackendRegistry,
        weights: RoutingWeights,
        lifecycle: Optional[ModelLifecycleTracker] = None,
        loaded_model_id: Optional[str] = None,
    ) -> CandidateEvaluation:
        """
        Evaluate and score a single candidate model against the routing request.
        """
        allow_test_backend = (model.provider == "reference")
        backend = backend_registry.select_backend(
            preferred_backend_id="auto",
            model_format=model.format,
            allow_test_backend=allow_test_backend,
        )
        backend_id = backend.backend_id if backend else "unknown"

        # Check if already loaded
        is_already_loaded = False
        if loaded_model_id and model.model_id == loaded_model_id:
            is_already_loaded = True
        elif lifecycle:
            state = lifecycle.get_state(model.model_id)
            if state in (ModelLifecycleState.LOADED, ModelLifecycleState.READY):
                is_already_loaded = True

        # Calculate individual normalized scores [0.0, 1.0]
        s_cap = cls._score_capabilities(model, request)
        s_qual = cls._score_quality(model, request)
        s_ctx = cls._score_context(model, request)
        s_hw = cls._score_hardware(model, hardware, request)
        s_lat = cls._score_latency(model, request)
        s_loaded = 1.0 if is_already_loaded else 0.0
        s_pref = 1.0 if (request.preferred_model and request.preferred_model == model.model_id) else 0.0
        s_task = cls._score_task_specialization(model, request)

        # Apply weights
        breakdown = {
            "capability_match": round(s_cap * weights.capability_match, 3),
            "quality": round(s_qual * weights.quality, 3),
            "context_fit": round(s_ctx * weights.context_fit, 3),
            "hardware_fit": round(s_hw * weights.hardware_fit, 3),
            "latency": round(s_lat * weights.latency, 3),
            "already_loaded_bonus": round(s_loaded * weights.already_loaded_bonus, 3),
            "preferred_model_bonus": round(s_pref * weights.preferred_model_bonus, 3),
            "task_specialization": round(s_task * weights.task_specialization, 3),
        }

        total_score = sum(breakdown.values())

        return CandidateEvaluation(
            model_id=model.model_id,
            score=round(total_score, 2),
            score_breakdown=breakdown,
            backend_id=backend_id,
            is_already_loaded=is_already_loaded,
        )

    @staticmethod
    def _score_capabilities(model: ModelDefinition, request: RoutingRequest) -> float:
        """Score based on matching preferred/optional capabilities and overall capability breadth."""
        if not request.preferred_capabilities:
            # Base capability breadth score
            total_possible = max(1, len(ModelCapability))
            return min(1.0, len(model.capabilities) / total_possible)

        matched = sum(1 for cap in request.preferred_capabilities if model.has_capability(cap))
        match_ratio = matched / len(request.preferred_capabilities)
        return match_ratio

    @classmethod
    def _score_quality(cls, model: ModelDefinition, request: RoutingRequest) -> float:
        """Score based on parameter count, quantization quality, and requested quality level."""
        params_billions = cls._parse_param_count_billions(model.parameter_count)
        
        # Base param score: 0 to 14B+ mapped smoothly to [0.15, 1.0]
        if params_billions <= 0:
            param_score = 0.5
        elif params_billions >= 14.0:
            param_score = 1.0
        else:
            param_score = 0.15 + (params_billions / 14.0) * 0.85

        # Quantization quality factor
        quant_lower = model.quantization.lower()
        if "fp16" in quant_lower or "f16" in quant_lower or "bf16" in quant_lower:
            quant_factor = 1.0
        elif "q8" in quant_lower:
            quant_factor = 0.95
        elif "q6" in quant_lower or "q5" in quant_lower:
            quant_factor = 0.85
        elif "q4" in quant_lower:
            quant_factor = 0.75
        elif "q3" in quant_lower or "q2" in quant_lower:
            quant_factor = 0.55
        else:
            quant_factor = 0.75

        base_quality = param_score * quant_factor

        # Adjust for quality requirement
        qual_req = getattr(request, "minimum_quality", getattr(request, "quality_requirement", QualityRequirement.MEDIUM))
        if qual_req in (QualityRequirement.HIGH, QualityRequirement.MAXIMUM):
            return base_quality
        elif qual_req == QualityRequirement.LOW:
            # For low quality requirement, smaller models are completely fine
            return 1.0 - (base_quality * 0.3)
        return base_quality

    @staticmethod
    def _score_context(model: ModelDefinition, request: RoutingRequest) -> float:
        """Score based on context window headroom and fit."""
        req_ctx = max(512, request.minimum_context_length)
        model_ctx = max(512, model.context_length)

        if model_ctx < req_ctx:
            return 0.0

        # Optimal headroom is 1.5x to 4x of required context
        ratio = model_ctx / req_ctx
        if ratio >= 1.0 and ratio <= 4.0:
            return 1.0
        elif ratio > 4.0:
            # Diminishing returns for massively oversized context
            return max(0.6, 1.0 - ((ratio - 4.0) * 0.05))
        return 0.8

    @classmethod
    def _score_hardware(
        cls,
        model: ModelDefinition,
        hardware: HardwareCapabilities,
        request: RoutingRequest,
    ) -> float:
        """Score based on memory and accelerator headroom."""
        ram_headroom = hardware.memory.available_gb - model.requirements.min_ram_gb
        if ram_headroom >= 4.0:
            ram_score = min(1.0, 0.85 + ((ram_headroom - 4.0) / 16.0) * 0.15)
        else:
            ram_score = max(0.1, (ram_headroom / 4.0) * 0.85)

        vram_score = 0.5
        if hardware.has_gpu and hardware.gpus:
            primary_gpu = hardware.gpus[0]
            if primary_gpu.free_vram_gb > 0:
                vram_headroom = primary_gpu.free_vram_gb - model.requirements.min_vram_gb
                if vram_headroom >= 2.0:
                    vram_score = min(1.0, 0.85 + ((vram_headroom - 2.0) / 8.0) * 0.15)
                else:
                    vram_score = max(0.1, (vram_headroom / 2.0) * 0.85)

        hw_score = (ram_score * 0.5) + (vram_score * 0.5)

        # Apply resource budget modifiers
        budget = getattr(request, "resource_budget", ResourceBudget.MEDIUM)
        if budget == ResourceBudget.LOW:
            # Penalize models requiring high RAM
            if model.requirements.min_ram_gb > 8.0:
                hw_score *= 0.6
        elif budget == ResourceBudget.UNCONSTRAINED:
            hw_score = min(1.0, hw_score * 1.2)

        return min(1.0, max(0.0, hw_score))

    @classmethod
    def _score_latency(cls, model: ModelDefinition, request: RoutingRequest) -> float:
        """Score expected inference speed based on parameter size and quantization."""
        params_billions = cls._parse_param_count_billions(model.parameter_count)
        
        # Smaller parameter size -> higher speed score
        if params_billions <= 0:
            speed_score = 0.6
        elif params_billions <= 3.0:
            speed_score = 1.0
        elif params_billions <= 8.0:
            speed_score = 0.8
        elif params_billions <= 14.0:
            speed_score = 0.6
        elif params_billions <= 34.0:
            speed_score = 0.4
        else:
            speed_score = 0.2

        lat_req = getattr(request, "latency_requirement", LatencyRequirement.BALANCED)
        if lat_req == LatencyRequirement.LOW:
            return speed_score
        elif lat_req == LatencyRequirement.BATCH:
            return 0.9  # Latency does not matter much
        return speed_score

    @staticmethod
    def _score_task_specialization(model: ModelDefinition, request: RoutingRequest) -> float:
        """Score how specifically the model is tuned or capable for the requested task type."""
        task = request.task_type
        caps = model.capabilities

        if task == TaskType.CODE:
            if ModelCapability.CODE in caps:
                return 1.0
            return 0.3
        elif task == TaskType.REASONING:
            if ModelCapability.REASONING in caps:
                return 1.0
            return 0.4
        elif task in (TaskType.VISION, TaskType.DOCUMENT_ANALYSIS):
            if ModelCapability.VISION in caps:
                return 1.0
            return 0.0
        elif task == TaskType.EMBEDDING:
            if ModelCapability.EMBEDDING in caps:
                return 1.0
            return 0.0
        elif task in (TaskType.GENERAL_CHAT, TaskType.TEXT_GENERATION):
            if ModelCapability.CHAT in caps or ModelCapability.TEXT_GENERATION in caps:
                return 1.0
            return 0.5

        return 0.5

    @staticmethod
    def _parse_param_count_billions(param_str: str) -> float:
        """Parse parameter strings like '7B', '13.5B', '1.5B', '70B', '350M' into billions."""
        if not param_str or param_str == "unknown":
            return 0.0
        match = re.search(r"(\d+(\.\d+)?)\s*([bmkBMK])?", param_str)
        if not match:
            return 0.0
        val = float(match.group(1))
        unit = (match.group(3) or "b").lower()
        if unit == "b":
            return val
        elif unit == "m":
            return val / 1000.0
        elif unit == "k":
            return val / 1000000.0
        return val
