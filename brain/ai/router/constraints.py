"""
Hard Constraints Evaluator
Enforces strict filtering rules that eliminate non-viable model candidates before scoring.
"""

from pathlib import Path
from typing import Optional, Tuple

from brain.ai.backends.registry import BackendRegistry
from brain.ai.hardware.capabilities import HardwareCapabilities, AcceleratorType
from brain.ai.models.definition import ModelDefinition
from brain.ai.router.decision import CandidateRejection
from brain.ai.router.request import RoutingRequest
from brain.ai.runtime.lifecycle import ModelLifecycleState, ModelLifecycleTracker


class ConstraintEvaluator:
    """
    Evaluates hard constraints against a candidate model definition.
    A candidate must satisfy all constraints to proceed to the scoring phase.
    """

    @classmethod
    def evaluate(
        cls,
        model: ModelDefinition,
        request: RoutingRequest,
        hardware: HardwareCapabilities,
        backend_registry: BackendRegistry,
        lifecycle: Optional[ModelLifecycleTracker] = None,
    ) -> Tuple[bool, Optional[CandidateRejection]]:
        """
        Evaluate candidate model against all hard constraints.
        Returns (is_viable: bool, rejection: Optional[CandidateRejection]).
        """
        # 1. Explicit exclusion check
        if model.model_id in request.excluded_models:
            return False, CandidateRejection(
                model_id=model.model_id,
                reason=f"Model '{model.model_id}' was explicitly excluded in the routing request.",
                constraint_failed="explicitly_excluded",
            )

        # 2. Installation & file presence check
        if not model.is_installed and model.provider != "reference":
            return False, CandidateRejection(
                model_id=model.model_id,
                reason=f"Model '{model.model_id}' is not installed locally.",
                constraint_failed="model_not_installed",
            )

        if model.file_path and model.provider != "reference":
            if not Path(model.file_path).exists():
                return False, CandidateRejection(
                    model_id=model.model_id,
                    reason=f"Model weight file not found on disk at '{model.file_path}'.",
                    constraint_failed="missing_model_file",
                )

        # 3. Required capabilities check (required ⊆ model.capabilities)
        missing_caps = [cap for cap in request.required_capabilities if not model.has_capability(cap)]
        if missing_caps:
            missing_names = [c.value for c in missing_caps]
            return False, CandidateRejection(
                model_id=model.model_id,
                reason=f"Missing required capabilities: {', '.join(missing_names)}.",
                constraint_failed="missing_required_capability",
            )

        # 4. Context length check
        if model.context_length < request.minimum_context_length:
            return False, CandidateRejection(
                model_id=model.model_id,
                reason=(
                    f"Model max context ({model.context_length}) is less than required "
                    f"minimum ({request.minimum_context_length})."
                ),
                constraint_failed="insufficient_context_length",
            )

        # 5. Offline requirement check
        if request.offline_required:
            if model.provider not in ("local", "reference"):
                return False, CandidateRejection(
                    model_id=model.model_id,
                    reason=f"Model provider '{model.provider}' violates the offline execution requirement.",
                    constraint_failed="offline_violation",
                )

        # 6. Backend compatibility & availability check
        allow_test_backend = (model.provider == "reference")
        backend = backend_registry.select_backend(
            preferred_backend_id="auto",
            model_format=model.format,
            allow_test_backend=allow_test_backend,
        )
        if not backend or not backend.is_available():
            return False, CandidateRejection(
                model_id=model.model_id,
                reason=f"No active and available inference backend found for format '{model.format.value}'.",
                constraint_failed="no_available_backend",
            )

        # 7. Hardware compatibility (RAM & VRAM)
        req = model.requirements

        # System RAM (skip for reference test models)
        if model.provider != "reference" and hardware.memory.available_gb < req.min_ram_gb:
            return False, CandidateRejection(
                model_id=model.model_id,
                reason=(
                    f"Insufficient available RAM: {hardware.memory.available_gb:.1f} GB available, "
                    f"{req.min_ram_gb:.1f} GB required."
                ),
                constraint_failed="insufficient_ram",
            )

        # GPU VRAM (when GPU is required and not reference model)
        if model.provider != "reference" and req.min_vram_gb > 0:
            if not hardware.has_gpu:
                return False, CandidateRejection(
                    model_id=model.model_id,
                    reason=f"Model requires a dedicated GPU with >= {req.min_vram_gb:.1f} GB VRAM, but no GPU was detected.",
                    constraint_failed="gpu_required",
                )

            # Inspect available VRAM if measured
            if hardware.gpus:
                primary_gpu = hardware.gpus[0]
                if primary_gpu.free_vram_gb > 0 and primary_gpu.free_vram_gb < req.min_vram_gb:
                    return False, CandidateRejection(
                        model_id=model.model_id,
                        reason=(
                            f"Insufficient GPU free VRAM: {primary_gpu.free_vram_gb:.1f} GB free, "
                            f"{req.min_vram_gb:.1f} GB required."
                        ),
                        constraint_failed="insufficient_vram",
                    )

        # 8. Runtime state check
        if lifecycle:
            state = lifecycle.get_state(model.model_id)
            if state in (ModelLifecycleState.FAILED, ModelLifecycleState.ERROR):
                return False, CandidateRejection(
                    model_id=model.model_id,
                    reason=f"Model runtime is currently in a failed/error state ({state.value}).",
                    constraint_failed="runtime_failed_state",
                )

        return True, None
