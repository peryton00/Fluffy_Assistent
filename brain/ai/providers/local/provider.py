"""
Local Model Provider
Discovers and manages locally installed AI models from filesystem storage without network access.
"""

from pathlib import Path
from typing import List, Optional

from brain.ai.config.paths import ApplicationDataPaths
from brain.ai.models.definition import ModelDefinition
from brain.ai.models.registry import ModelRegistry, get_model_registry
from brain.ai.providers.interface import ModelProvider


class LocalModelProvider(ModelProvider):
    """
    Local filesystem model provider.
    Scans the local models directory and registers definitions into the ModelRegistry.
    Offline-first: does not make any external network requests.
    """

    def __init__(
        self,
        models_dir: Optional[Path] = None,
        registry: Optional[ModelRegistry] = None,
    ):
        self._models_dir = models_dir or ApplicationDataPaths.get_models_dir()
        self._registry = registry or get_model_registry()

    @property
    def provider_id(self) -> str:
        return "local"

    @property
    def display_name(self) -> str:
        return "Local Model Provider (Filesystem)"

    @property
    def models_dir(self) -> Path:
        return self._models_dir

    def get_model(self, model_id: str) -> Optional[ModelDefinition]:
        """Fetch model definition from registry."""
        model = self._registry.get(model_id)
        if model and model.provider == self.provider_id:
            return model
        return None

    def list_models(self) -> List[ModelDefinition]:
        """List all models belonging to the local provider."""
        return [
            m for m in self._registry.list_all()
            if m.provider == self.provider_id
        ]

    def refresh_models(self) -> int:
        """Scan local models storage and register discovered models."""
        return self._registry.scan_directory(self._models_dir)
