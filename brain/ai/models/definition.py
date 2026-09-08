"""
Model Definition Data Structures
Defines open-weight and local model representations independently of inference backends.
"""

from dataclasses import dataclass, field
from typing import List, Optional, Dict, Any

from brain.ai.models.metadata import ModelCapability, ModelFormat, ModelRequirements


@dataclass
class ModelDefinition:
    """
    Complete descriptor for an AI model.
    Describes parameters, capabilities, requirements, and on-disk location.
    """
    model_id: str
    display_name: str
    provider: str = "local"
    model_family: str = "unknown"
    version: str = "1.0.0"
    parameter_count: str = "unknown"
    quantization: str = "none"
    context_length: int = 4096
    capabilities: List[ModelCapability] = field(default_factory=lambda: [ModelCapability.TEXT_GENERATION, ModelCapability.CHAT])
    requirements: ModelRequirements = field(default_factory=ModelRequirements)
    format: ModelFormat = ModelFormat.GGUF
    file_path: Optional[str] = None
    is_installed: bool = False
    metadata: Dict[str, Any] = field(default_factory=dict)

    def has_capability(self, capability: ModelCapability) -> bool:
        """Check if the model supports a given capability."""
        return capability in self.capabilities

    def to_dict(self) -> Dict[str, Any]:
        """Convert definition to dictionary."""
        return {
            "model_id": self.model_id,
            "display_name": self.display_name,
            "provider": self.provider,
            "model_family": self.model_family,
            "version": self.version,
            "parameter_count": self.parameter_count,
            "quantization": self.quantization,
            "context_length": self.context_length,
            "capabilities": [c.value for c in self.capabilities],
            "requirements": {
                "min_ram_gb": self.requirements.min_ram_gb,
                "min_vram_gb": self.requirements.min_vram_gb,
                "preferred_accelerator": self.requirements.preferred_accelerator.value if self.requirements.preferred_accelerator else None,
                "quantization": self.requirements.quantization,
            },
            "format": self.format.value,
            "file_path": self.file_path,
            "is_installed": self.is_installed,
            "metadata": self.metadata,
        }
