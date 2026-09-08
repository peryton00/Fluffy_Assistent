"""
Model Provider Interface
Abstract base interface for model discovery and metadata resolution.
"""

from abc import ABC, abstractmethod
from typing import List, Optional

from brain.ai.models.definition import ModelDefinition


class ModelProvider(ABC):
    """
    Abstract Model Provider.
    Responsible for sourcing, discovering, and providing ModelDefinitions.
    Does NOT execute inference (that is the responsibility of InferenceBackend).
    """

    @property
    @abstractmethod
    def provider_id(self) -> str:
        """Unique identifier for this provider (e.g. 'local', 'reference')."""
        pass

    @property
    @abstractmethod
    def display_name(self) -> str:
        """Human-readable name for this provider."""
        pass

    @abstractmethod
    def get_model(self, model_id: str) -> Optional[ModelDefinition]:
        """Fetch a model definition by ID."""
        pass

    @abstractmethod
    def list_models(self) -> List[ModelDefinition]:
        """List all models provided by this source."""
        pass

    @abstractmethod
    def refresh_models(self) -> int:
        """Discover and refresh models from storage. Returns count of newly discovered models."""
        pass
