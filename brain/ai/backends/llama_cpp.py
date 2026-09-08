"""
Llama.cpp Inference Backend
Local inference engine for GGUF open-weight models.
Gracefully handles missing native bindings if llama-cpp-python is not installed.
"""

from typing import Iterator, List, Optional, Dict, Any

from brain.ai.backends.interface import InferenceBackend
from brain.ai.models.definition import ModelDefinition
from brain.ai.models.metadata import ModelFormat

try:
    import llama_cpp
    LLAMA_CPP_AVAILABLE = True
except ImportError:
    llama_cpp = None
    LLAMA_CPP_AVAILABLE = False


class LlamaCppBackend(InferenceBackend):
    """
    Real local inference backend wrapping llama.cpp (GGUF model format).
    Platform-independent with CPU fallback and optional GPU acceleration offload.
    """

    def __init__(self):
        self._loaded_models: Dict[str, Any] = {}

    @property
    def backend_id(self) -> str:
        return "llama_cpp"

    @property
    def display_name(self) -> str:
        return "Llama.cpp (Local GGUF Engine)"

    @property
    def is_test_backend(self) -> bool:
        return False

    def is_available(self) -> bool:
        return LLAMA_CPP_AVAILABLE

    def get_supported_formats(self) -> List[ModelFormat]:
        return [ModelFormat.GGUF]

    def load_model(self, model: ModelDefinition, options: Optional[Dict[str, Any]] = None) -> Any:
        if not self.is_available():
            raise RuntimeError(
                "LlamaCppBackend is not available in the current Python environment. "
                "Install 'llama-cpp-python' to enable local GGUF execution."
            )

        if not model.file_path:
            raise ValueError(f"Model '{model.model_id}' does not specify a local file_path.")

        opts = options or {}
        n_ctx = opts.get("n_ctx", model.context_length)
        n_gpu_layers = opts.get("n_gpu_layers", -1)  # Offload all supported layers by default
        n_threads = opts.get("n_threads", None)

        try:
            llm = llama_cpp.Llama(
                model_path=model.file_path,
                n_ctx=n_ctx,
                n_gpu_layers=n_gpu_layers,
                n_threads=n_threads,
                verbose=False,
            )
            self._loaded_models[model.model_id] = llm
            return llm
        except Exception as e:
            raise RuntimeError(f"Failed to load GGUF model '{model.model_id}' from {model.file_path}: {e}")

    def unload_model(self, model_id: str) -> bool:
        if model_id in self._loaded_models:
            # Drop reference so Python GC can reclaim memory
            del self._loaded_models[model_id]
            return True
        return False

    def is_loaded(self, model_id: str) -> bool:
        return model_id in self._loaded_models

    def generate(self, model_id: str, prompt: str, **kwargs) -> str:
        if not self.is_loaded(model_id):
            raise RuntimeError(f"Model '{model_id}' is not loaded in LlamaCppBackend.")

        llm = self._loaded_models[model_id]
        max_tokens = kwargs.get("max_tokens", 512)
        temperature = kwargs.get("temperature", 0.7)
        top_p = kwargs.get("top_p", 0.95)

        output = llm(
            prompt,
            max_tokens=max_tokens,
            temperature=temperature,
            top_p=top_p,
            stream=False,
        )
        return output["choices"][0]["text"]

    def stream(self, model_id: str, prompt: str, **kwargs) -> Iterator[str]:
        if not self.is_loaded(model_id):
            raise RuntimeError(f"Model '{model_id}' is not loaded in LlamaCppBackend.")

        llm = self._loaded_models[model_id]
        max_tokens = kwargs.get("max_tokens", 512)
        temperature = kwargs.get("temperature", 0.7)
        top_p = kwargs.get("top_p", 0.95)

        stream_gen = llm(
            prompt,
            max_tokens=max_tokens,
            temperature=temperature,
            top_p=top_p,
            stream=True,
        )

        for chunk in stream_gen:
            delta = chunk["choices"][0]["text"]
            if delta:
                yield delta
