"""
AI & Multi-Provider LLM Package for Fluffy Assistant
"""
import sys
# Canonical Local AI Runtime Exports
from brain.ai.hardware import (
    AcceleratorType,
    HardwareCapabilities,
    HardwareDetector,
)
from brain.ai.config import (
    ApplicationDataPaths,
    AIConfig,
    get_ai_config,
)
from brain.ai.models import (
    ModelCapability,
    ModelFormat,
    ModelRequirements,
    ModelDefinition,
    ModelRegistry,
    get_model_registry,
)
from brain.ai.backends import (
    InferenceBackend,
    ReferenceBackend,
    LlamaCppBackend,
    BackendRegistry,
    get_backend_registry,
)
from brain.ai.providers import (
    ModelProvider,
    LocalModelProvider,
)
from brain.ai.runtime import (
    AIModelRuntime,
    GenerationRequest,
    GenerationResponse,
    GenerationChunk,
    CancellationHandle,
    ModelLifecycleState,
    RuntimeHealth,
    HealthStatus,
    RuntimeManager,
    get_runtime,
)
from brain.ai.router import (
    TaskType,
    LatencyRequirement,
    QualityRequirement,
    ResourceBudget,
    RoutingRequest,
    RoutingPolicyProfile,
    RoutingWeights,
    RoutingPolicy,
    CandidateRejection,
    CandidateEvaluation,
    RoutingDecision,
    RoutingError,
    ConstraintEvaluator,
    CandidateScorer,
    ModelRouter,
    DeterministicModelRouter,
    get_router,
    set_router,
)

# Legacy compatibility exports
from brain.ai.llm_config import LLMConfig, get_config
from brain.ai.llm_client import LLMClient, get_client
from brain.ai.llm_service import LLMService, get_service
from brain.ai import llm_config, llm_client, llm_service

# Compatibility namespace alias for legacy `ai.src.*` imports
class _SrcNamespace:
    llm_config = llm_config
    llm_client = llm_client
    llm_service = llm_service
    get_service = staticmethod(get_service)
    get_client = staticmethod(get_client)
    get_config = staticmethod(get_config)

src = _SrcNamespace()
sys.modules["ai.src"] = src
sys.modules["ai.src.llm_service"] = llm_service
sys.modules["ai.src.llm_client"] = llm_client
sys.modules["ai.src.llm_config"] = llm_config

__all__ = [
    # Canonical AI Runtime
    "AcceleratorType",
    "HardwareCapabilities",
    "HardwareDetector",
    "ApplicationDataPaths",
    "AIConfig",
    "get_ai_config",
    "ModelCapability",
    "ModelFormat",
    "ModelRequirements",
    "ModelDefinition",
    "ModelRegistry",
    "get_model_registry",
    "InferenceBackend",
    "ReferenceBackend",
    "LlamaCppBackend",
    "BackendRegistry",
    "get_backend_registry",
    "ModelProvider",
    "LocalModelProvider",
    "AIModelRuntime",
    "GenerationRequest",
    "GenerationResponse",
    "GenerationChunk",
    "CancellationHandle",
    "ModelLifecycleState",
    "RuntimeHealth",
    "HealthStatus",
    "RuntimeManager",
    "get_runtime",
    # Model Router
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
    # Legacy / Compatibility
    "LLMConfig",
    "get_config",
    "LLMClient",
    "get_client",
    "LLMService",
    "get_service",
    "src",
]

