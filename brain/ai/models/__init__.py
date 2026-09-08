"""
Models package for Fluffy AI Runtime.
"""

from brain.ai.models.metadata import (
    ModelCapability,
    ModelFormat,
    ModelRequirements,
)
from brain.ai.models.definition import ModelDefinition
from brain.ai.models.registry import ModelRegistry, get_model_registry

__all__ = [
    "ModelCapability",
    "ModelFormat",
    "ModelRequirements",
    "ModelDefinition",
    "ModelRegistry",
    "get_model_registry",
]
