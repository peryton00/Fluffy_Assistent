"""
Model capability and metadata definitions for Fluffy AI Models.
"""

from dataclasses import dataclass
from enum import Enum
from typing import Optional

from brain.ai.hardware.capabilities import AcceleratorType


class ModelCapability(str, Enum):
    """Extensible model capabilities."""
    TEXT_GENERATION = "text_generation"
    CHAT = "chat"
    CODE = "code"
    REASONING = "reasoning"
    VISION = "vision"
    EMBEDDING = "embedding"
    AUDIO = "audio"


class ModelFormat(str, Enum):
    """Supported model serialization / storage formats."""
    GGUF = "gguf"
    ONNX = "onnx"
    SAFETENSORS = "safetensors"
    PYTORCH = "pytorch"
    CUSTOM = "custom"


@dataclass(frozen=True)
class ModelRequirements:
    """Hardware and execution requirements for a model."""
    min_ram_gb: float = 2.0
    min_vram_gb: float = 0.0
    preferred_accelerator: Optional[AcceleratorType] = None
    quantization: Optional[str] = None
