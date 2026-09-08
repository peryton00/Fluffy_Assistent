"""
Reference Inference Backend
Strictly deterministic, zero-dependency backend for testing, contract verification, and CI.
"""

from typing import Iterator, List, Optional, Dict, Any, Set

from brain.ai.backends.interface import InferenceBackend
from brain.ai.models.definition import ModelDefinition
from brain.ai.models.metadata import ModelFormat


class ReferenceBackend(InferenceBackend):
    """
    Deterministic reference inference backend for contract verification and unit tests.
    NOT intended for production open-weight execution.
    """

    def __init__(self):
        self._loaded_models: Set[str] = set()

    @property
    def backend_id(self) -> str:
        return "reference"

    @property
    def display_name(self) -> str:
        return "Reference Test Backend (Mock / Deterministic)"

    @property
    def is_test_backend(self) -> bool:
        return True

    def is_available(self) -> bool:
        return True

    def get_supported_formats(self) -> List[ModelFormat]:
        return [ModelFormat.GGUF, ModelFormat.ONNX, ModelFormat.CUSTOM]

    def load_model(self, model: ModelDefinition, options: Optional[Dict[str, Any]] = None) -> Any:
        self._loaded_models.add(model.model_id)
        return {"model_id": model.model_id, "status": "mock_loaded"}

    def unload_model(self, model_id: str) -> bool:
        if model_id in self._loaded_models:
            self._loaded_models.remove(model_id)
            return True
        return False

    def is_loaded(self, model_id: str) -> bool:
        return model_id in self._loaded_models

    def generate(self, model_id: str, prompt: str, **kwargs) -> str:
        if not self.is_loaded(model_id):
            raise RuntimeError(f"[ReferenceBackend] Model '{model_id}' is not loaded.")
        
        # Deterministic responses for testing
        if "echo:" in prompt.lower():
            return prompt.split("echo:", 1)[1].strip()
        elif "json:" in prompt.lower():
            return '{"status": "ok", "intent": "test", "parameters": {}}'
        
        return f"[ReferenceBackend] Processed prompt of length {len(prompt)} for model {model_id}."

    def stream(self, model_id: str, prompt: str, **kwargs) -> Iterator[str]:
        if not self.is_loaded(model_id):
            raise RuntimeError(f"[ReferenceBackend] Model '{model_id}' is not loaded.")
        
        response = self.generate(model_id, prompt, **kwargs)
        # Yield words as incremental chunks
        tokens = response.split(" ")
        for i, token in enumerate(tokens):
            if i < len(tokens) - 1:
                yield token + " "
            else:
                yield token
