"""
Inference Backend Interface
Abstract base protocol for local and reference model inference engines.
"""

from abc import ABC, abstractmethod
from typing import Iterator, List, Optional, Dict, Any

from brain.ai.models.definition import ModelDefinition
from brain.ai.models.metadata import ModelFormat


class InferenceBackend(ABC):
    """
    Abstract interface for inference engines.
    Isolates engine-specific execution (llama.cpp, ONNX, reference, etc.) from model providers and agent logic.
    """

    @property
    @abstractmethod
    def backend_id(self) -> str:
        """Unique identifier for this backend (e.g. 'llama_cpp', 'reference')."""
        pass

    @property
    @abstractmethod
    def display_name(self) -> str:
        """Human-readable name for this backend."""
        pass

    @property
    def is_test_backend(self) -> bool:
        """Indicates if this backend is strictly for testing/mocking."""
        return False

    @abstractmethod
    def is_available(self) -> bool:
        """Check if required native libraries and drivers are installed and functional."""
        pass

    @abstractmethod
    def get_supported_formats(self) -> List[ModelFormat]:
        """List model formats this backend can load."""
        pass

    @abstractmethod
    def load_model(self, model: ModelDefinition, options: Optional[Dict[str, Any]] = None) -> Any:
        """
        Load model weights into memory/accelerator.
        Returns the underlying engine model handle or raises an exception.
        """
        pass

    @abstractmethod
    def unload_model(self, model_id: str) -> bool:
        """Unload model from memory/accelerator."""
        pass

    @abstractmethod
    def is_loaded(self, model_id: str) -> bool:
        """Check if a model is currently loaded in memory."""
        pass

    @abstractmethod
    def generate(self, model_id: str, prompt: str, **kwargs) -> str:
        """Generate complete text response."""
        pass

    @abstractmethod
    def stream(self, model_id: str, prompt: str, **kwargs) -> Iterator[str]:
        """Stream text chunks incrementally."""
        pass
