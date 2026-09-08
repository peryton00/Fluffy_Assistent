"""
Vision Provider Registry
Manages discovery and access to local vision providers.
"""

from typing import List, Optional, Dict
from brain.multimodal.vision.interface import VisionProvider
from brain.multimodal.vision.local import LocalVisionProvider


class VisionProviderRegistry:
    """Registry of local vision analysis backends."""

    def __init__(self, populate_defaults: bool = True):
        self._providers: Dict[str, VisionProvider] = {}
        if populate_defaults:
            self.register_provider(LocalVisionProvider())

    def register_provider(self, provider: VisionProvider) -> None:
        """Register a vision provider."""
        self._providers[provider.name] = provider

    def unregister_provider(self, name: str) -> Optional[VisionProvider]:
        """Unregister a vision provider."""
        return self._providers.pop(name, None)

    def get_provider(self, name: str) -> Optional[VisionProvider]:
        """Get provider by name."""
        return self._providers.get(name)

    def get_active_provider(self) -> Optional[VisionProvider]:
        """Get the active available vision provider or first registered."""
        for provider in self._providers.values():
            if provider.is_available:
                return provider
        if self._providers:
            return next(iter(self._providers.values()))
        return None

    def list_providers(self) -> List[VisionProvider]:
        """List all registered vision providers."""
        return list(self._providers.values())


# Global singleton
_global_vision_registry: Optional[VisionProviderRegistry] = None


def get_vision_registry() -> VisionProviderRegistry:
    """Retrieve global Vision provider registry singleton."""
    global _global_vision_registry
    if _global_vision_registry is None:
        _global_vision_registry = VisionProviderRegistry()
    return _global_vision_registry
