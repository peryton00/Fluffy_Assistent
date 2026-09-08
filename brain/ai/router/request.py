"""
Routing Request Models & Task Taxonomy
Defines typed inputs for the Model Router without coupling to specific LLM providers.
"""

import uuid
from dataclasses import dataclass, field
from enum import Enum
from typing import List, Optional, Set, Dict, Any

from brain.ai.models.metadata import ModelCapability
from brain.ai.router.policies import RoutingPolicyProfile


class TaskType(str, Enum):
    """Extensible task taxonomy for local AI execution."""
    GENERAL_CHAT = "general_chat"
    TEXT_GENERATION = "text_generation"
    REASONING = "reasoning"
    CODE = "code"
    VISION = "vision"
    DOCUMENT_ANALYSIS = "document_analysis"
    EMBEDDING = "embedding"
    CLASSIFICATION = "classification"
    SUMMARIZATION = "summarization"
    STRUCTURED_OUTPUT = "structured_output"


class LatencyRequirement(str, Enum):
    """Latency sensitivity of the task."""
    LOW = "low"            # Interactive real-time UI/voice
    BALANCED = "balanced"  # Standard agent tasks
    BATCH = "batch"        # Background analytics / indexing


class QualityRequirement(str, Enum):
    """Minimum quality expectation."""
    LOW = "low"            # Simple extraction / classification
    MEDIUM = "medium"      # Standard chat / formatting
    HIGH = "high"          # Complex reasoning / coding
    MAXIMUM = "maximum"    # Critical multi-step workflows


class ResourceBudget(str, Enum):
    """Resource conservation preference."""
    LOW = "low"                    # Conserve RAM/VRAM aggressively (favor small/quantized models)
    MEDIUM = "medium"              # Standard resource balance
    UNCONSTRAINED = "unconstrained"  # Use maximum available hardware for quality


@dataclass
class RoutingRequest:
    """
    Complete descriptor of task requirements provided to the Model Router.
    """
    task_type: TaskType = TaskType.GENERAL_CHAT
    required_capabilities: Set[ModelCapability] = field(default_factory=set)
    preferred_capabilities: Set[ModelCapability] = field(default_factory=set)
    minimum_context_length: int = 2048
    minimum_quality: QualityRequirement = QualityRequirement.MEDIUM
    latency_requirement: LatencyRequirement = LatencyRequirement.BALANCED
    resource_budget: ResourceBudget = ResourceBudget.MEDIUM
    policy_profile: Optional[RoutingPolicyProfile] = None
    multimodal_required: bool = False
    reasoning_required: bool = False
    code_required: bool = False
    streaming_required: bool = True
    offline_required: bool = True
    preferred_model: Optional[str] = None  # Soft preference only
    excluded_models: Set[str] = field(default_factory=set)
    request_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    metadata: Dict[str, Any] = field(default_factory=dict)

    def __post_init__(self):
        # Normalize collections to sets
        if isinstance(self.required_capabilities, (list, tuple)):
            self.required_capabilities = set(self.required_capabilities)
        elif self.required_capabilities is None:
            self.required_capabilities = set()

        if isinstance(self.preferred_capabilities, (list, tuple)):
            self.preferred_capabilities = set(self.preferred_capabilities)
        elif self.preferred_capabilities is None:
            self.preferred_capabilities = set()

        if isinstance(self.excluded_models, (list, tuple)):
            self.excluded_models = set(self.excluded_models)
        elif self.excluded_models is None:
            self.excluded_models = set()

        # Auto-populate required capabilities based on explicit flags
        if self.code_required or self.task_type == TaskType.CODE:
            self.required_capabilities.add(ModelCapability.CODE)
        if self.reasoning_required or self.task_type == TaskType.REASONING:
            self.required_capabilities.add(ModelCapability.REASONING)
        if self.multimodal_required or self.task_type in (TaskType.VISION, TaskType.DOCUMENT_ANALYSIS):
            self.required_capabilities.add(ModelCapability.VISION)
        if self.task_type == TaskType.EMBEDDING:
            self.required_capabilities.add(ModelCapability.EMBEDDING)
        if not self.required_capabilities:
            self.required_capabilities.add(ModelCapability.TEXT_GENERATION)
