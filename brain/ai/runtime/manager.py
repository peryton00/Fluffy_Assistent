"""
Runtime Manager Module
Concrete implementation of AIModelRuntime orchestrating providers, backends, and lifecycles.
"""

import time
import threading
from typing import Iterator, Optional, Dict, Any, List

from brain.ai.config.ai_config import AIConfig, get_ai_config
from brain.ai.hardware.capabilities import HardwareCapabilities, AcceleratorType
from brain.ai.hardware.detector import HardwareDetector
from brain.ai.models.registry import ModelRegistry, get_model_registry
from brain.ai.backends.interface import InferenceBackend
from brain.ai.backends.registry import BackendRegistry, get_backend_registry
from brain.ai.runtime.interface import (
    AIModelRuntime,
    GenerationRequest,
    GenerationResponse,
    GenerationChunk,
    CancellationHandle,
)
from brain.ai.runtime.lifecycle import (
    ModelLifecycleState,
    ModelLifecycleTracker,
)
from brain.ai.runtime.health import (
    RuntimeHealth,
    HealthStatus,
    ComponentHealth,
)


class RuntimeManager(AIModelRuntime):
    """
    Primary local AI runtime manager.
    Coordinates model loading, backend execution, lifecycle transitions, and health reporting.
    """

    def __init__(
        self,
        config: Optional[AIConfig] = None,
        registry: Optional[ModelRegistry] = None,
        backend_registry: Optional[BackendRegistry] = None,
    ):
        self.config = config or get_ai_config()
        self.registry = registry or get_model_registry()
        self.backend_registry = backend_registry or get_backend_registry()
        self.lifecycle = ModelLifecycleTracker()

        self._loaded_model_backends: Dict[str, InferenceBackend] = {}
        self._active_tasks: Dict[str, CancellationHandle] = {}
        self._last_inference_timestamp: Optional[float] = None
        self._lock = threading.Lock()

    def load(self, model_id: str, options: Optional[Dict[str, Any]] = None) -> bool:
        """
        Load a model into memory using a compatible inference backend.
        """
        with self._lock:
            # Check if already loaded
            if model_id in self._loaded_model_backends:
                return True

            model = self.registry.get(model_id)
            if not model:
                self.lifecycle.transition(model_id, ModelLifecycleState.FAILED, {"error": "Model not found"})
                raise ValueError(f"Cannot load model '{model_id}': not found in registry.")

            # Record loading state
            self.lifecycle.transition(model_id, ModelLifecycleState.LOADING)

            # Hardware capability check
            hardware = HardwareDetector.detect()
            is_compat, reason = self.registry.is_compatible(model_id, hardware)
            if not is_compat:
                self.lifecycle.transition(model_id, ModelLifecycleState.FAILED, {"error": reason})
                raise RuntimeError(f"Cannot load model '{model_id}': {reason}")

            # Select compatible backend
            allow_test = (self.config.preferred_backend == "reference" or model.provider == "reference")
            backend = self.backend_registry.select_backend(
                preferred_backend_id=self.config.preferred_backend,
                model_format=model.format,
                allow_test_backend=allow_test,
            )

            if not backend:
                err_msg = f"No compatible and available inference backend found for format '{model.format.value}'."
                self.lifecycle.transition(model_id, ModelLifecycleState.FAILED, {"error": err_msg})
                raise RuntimeError(err_msg)

            # Load into backend
            try:
                backend.load_model(model, options)
                self._loaded_model_backends[model_id] = backend
                self.lifecycle.transition(model_id, ModelLifecycleState.READY, {"backend": backend.backend_id})
                return True
            except Exception as e:
                self.lifecycle.transition(model_id, ModelLifecycleState.FAILED, {"error": str(e)})
                raise

    def unload(self, model_id: str) -> bool:
        """
        Unload a model from memory and release resources.
        """
        with self._lock:
            if model_id not in self._loaded_model_backends:
                return False

            self.lifecycle.transition(model_id, ModelLifecycleState.UNLOADING)
            backend = self._loaded_model_backends[model_id]

            try:
                backend.unload_model(model_id)
                del self._loaded_model_backends[model_id]
                self.lifecycle.transition(model_id, ModelLifecycleState.UNLOADED)
                return True
            except Exception as e:
                self.lifecycle.transition(model_id, ModelLifecycleState.ERROR, {"error": str(e)})
                raise

    def generate(
        self,
        request: GenerationRequest,
        cancellation: Optional[CancellationHandle] = None,
    ) -> GenerationResponse:
        """
        Execute synchronous inference request.
        """
        model_id = self._resolve_model_id(request.model_id)
        self._ensure_loaded(model_id)

        handle = cancellation or CancellationHandle()
        if request.task_id:
            self._active_tasks[request.task_id] = handle

        try:
            if handle.is_cancelled:
                raise RuntimeError("Inference cancelled prior to execution.")

            backend = self._loaded_model_backends[model_id]
            start_time = time.time()

            text_output = backend.generate(
                model_id=model_id,
                prompt=request.prompt,
                max_tokens=request.max_tokens,
                temperature=request.temperature,
                top_p=request.top_p,
            )

            latency = (time.time() - start_time) * 1000.0
            self._last_inference_timestamp = time.time()

            return GenerationResponse(
                text=text_output,
                model_id=model_id,
                backend_id=backend.backend_id,
                finish_reason="stop",
                usage={"prompt_tokens": len(request.prompt.split()), "completion_tokens": len(text_output.split())},
                latency_ms=round(latency, 2),
            )
        finally:
            if request.task_id and request.task_id in self._active_tasks:
                del self._active_tasks[request.task_id]

    def stream(
        self,
        request: GenerationRequest,
        cancellation: Optional[CancellationHandle] = None,
    ) -> Iterator[GenerationChunk]:
        """
        Stream generated tokens incrementally.
        """
        model_id = self._resolve_model_id(request.model_id)
        self._ensure_loaded(model_id)

        handle = cancellation or CancellationHandle()
        if request.task_id:
            self._active_tasks[request.task_id] = handle

        try:
            backend = self._loaded_model_backends[model_id]
            self._last_inference_timestamp = time.time()

            stream_iter = backend.stream(
                model_id=model_id,
                prompt=request.prompt,
                max_tokens=request.max_tokens,
                temperature=request.temperature,
                top_p=request.top_p,
            )

            for chunk_str in stream_iter:
                if handle.is_cancelled:
                    yield GenerationChunk(delta="", model_id=model_id, is_final=True, finish_reason="cancelled")
                    break

                yield GenerationChunk(delta=chunk_str, model_id=model_id, is_final=False)

            if not handle.is_cancelled:
                yield GenerationChunk(delta="", model_id=model_id, is_final=True, finish_reason="stop")
        finally:
            if request.task_id and request.task_id in self._active_tasks:
                del self._active_tasks[request.task_id]

    def health(self) -> RuntimeHealth:
        """
        Evaluate and return runtime diagnostics.
        """
        hardware = HardwareDetector.detect()
        avail_backends = self.backend_registry.list_available(include_test=False)
        has_prod_backend = len(avail_backends) > 0

        components: List[ComponentHealth] = []

        # Backend component health
        if has_prod_backend:
            b_status = HealthStatus.HEALTHY
            b_msg = f"Available local backends: {', '.join(b.backend_id for b in avail_backends)}"
        else:
            b_status = HealthStatus.DEGRADED
            b_msg = "No native production local backends available (reference test backend only)."

        components.append(ComponentHealth(
            name="inference_backends",
            status=b_status,
            message=b_msg,
            details={"backends": [b.backend_id for b in self.backend_registry.list_all()]},
        ))

        # Memory pressure check
        mem = hardware.memory
        if mem.available_gb < 2.0:
            pressure = "high"
        elif mem.available_gb < 4.0:
            pressure = "medium"
        else:
            pressure = "low"

        overall_status = HealthStatus.HEALTHY if has_prod_backend else HealthStatus.DEGRADED

        return RuntimeHealth(
            status=overall_status,
            runtime_available=True,
            backend_available=has_prod_backend,
            backend_id=avail_backends[0].backend_id if avail_backends else "reference",
            loaded_models=list(self._loaded_model_backends.keys()),
            hardware_accelerator=hardware.primary_accelerator.value,
            memory_pressure=pressure,
            last_inference_timestamp=self._last_inference_timestamp,
            error_state=None,
            components=components,
        )

    def cancel(self, task_id: str) -> bool:
        """
        Signal cancellation for an active inference task.
        """
        handle = self._active_tasks.get(task_id)
        if handle:
            handle.cancel()
            return True
        return False

    def _resolve_model_id(self, requested_id: Optional[str]) -> str:
        """Resolve model ID from request, configuration, or first registered model."""
        if requested_id:
            return requested_id
        
        if self.config.default_model_id and self.registry.get(self.config.default_model_id):
            return self.config.default_model_id

        all_models = self.registry.list_all()
        if all_models:
            return all_models[0].model_id

        raise RuntimeError("No models registered in ModelRegistry. Cannot execute inference.")

    def _ensure_loaded(self, model_id: str) -> None:
        """Ensure the specified model is loaded in memory."""
        if model_id not in self._loaded_model_backends:
            self.load(model_id)


# Global singleton instance
_runtime_manager: Optional[RuntimeManager] = None


def get_runtime() -> RuntimeManager:
    """Get or create the global AIModelRuntime / RuntimeManager instance."""
    global _runtime_manager
    if _runtime_manager is None:
        _runtime_manager = RuntimeManager()
    return _runtime_manager


def set_runtime(runtime: Optional[RuntimeManager]) -> None:
    """Override runtime instance (for tests)."""
    global _runtime_manager
    _runtime_manager = runtime
