"""
Backend Registry Module
Explicit registry for managing and selecting inference backends.
"""

from typing import Dict, List, Optional

from brain.ai.backends.interface import InferenceBackend
from brain.ai.backends.reference import ReferenceBackend
from brain.ai.backends.llama_cpp import LlamaCppBackend
from brain.ai.models.metadata import ModelFormat


class BackendRegistry:
    """
    Explicit registry of available inference backends.
    Allows registering, querying, and resolving backends based on capability and availability.
    """

    def __init__(self):
        self._backends: Dict[str, InferenceBackend] = {}
        # Pre-register standard backends
        self.register(ReferenceBackend())
        self.register(LlamaCppBackend())

    def register(self, backend: InferenceBackend) -> None:
        """Register an inference backend instance."""
        self._backends[backend.backend_id] = backend

    def unregister(self, backend_id: str) -> bool:
        """Unregister a backend by ID."""
        if backend_id in self._backends:
            del self._backends[backend_id]
            return True
        return False

    def get(self, backend_id: str) -> Optional[InferenceBackend]:
        """Get backend by ID."""
        return self._backends.get(backend_id)

    def list_all(self) -> List[InferenceBackend]:
        """List all registered backends."""
        return list(self._backends.values())

    def list_available(self, include_test: bool = True) -> List[InferenceBackend]:
        """List backends whose dependencies/drivers are available."""
        return [
            b for b in self._backends.values()
            if b.is_available() and (include_test or not b.is_test_backend)
        ]

    def select_backend(
        self,
        preferred_backend_id: str = "auto",
        model_format: Optional[ModelFormat] = None,
        allow_test_backend: bool = False,
    ) -> Optional[InferenceBackend]:
        """
        Select the best matching backend.
        If preferred is 'auto', searches for the first available production backend supporting format.
        """
        # 1. If an explicit backend is requested and available
        if preferred_backend_id != "auto":
            backend = self.get(preferred_backend_id)
            if backend and backend.is_available():
                if model_format is None or model_format in backend.get_supported_formats():
                    return backend

        # 2. Search available production backends
        for backend in self.list_available(include_test=False):
            if model_format is None or model_format in backend.get_supported_formats():
                return backend

        # 3. If test backends are permitted (e.g. in unit tests or dev mode)
        if allow_test_backend:
            ref_backend = self.get("reference")
            if ref_backend and ref_backend.is_available():
                return ref_backend

        return None


# Global singleton instance
_backend_registry: Optional[BackendRegistry] = None


def get_backend_registry() -> BackendRegistry:
    """Get or create the global BackendRegistry instance."""
    global _backend_registry
    if _backend_registry is None:
        _backend_registry = BackendRegistry()
    return _backend_registry
