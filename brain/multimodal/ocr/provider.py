"""
OCR Provider Registry
Manages discovery and lifecycle of local OCR providers.
"""

from typing import List, Optional, Dict
from brain.multimodal.ocr.interface import OCRProvider
from brain.multimodal.ocr.local import LocalOCRProvider


class OCRProviderRegistry:
    """Registry of local OCR provider backends."""

    def __init__(self, populate_defaults: bool = True):
        self._providers: Dict[str, OCRProvider] = {}
        if populate_defaults:
            # Register production local OCR provider
            self.register_provider(LocalOCRProvider())

    def register_provider(self, provider: OCRProvider) -> None:
        """Register an OCR provider."""
        self._providers[provider.name] = provider

    def unregister_provider(self, name: str) -> Optional[OCRProvider]:
        """Unregister an OCR provider by name."""
        return self._providers.pop(name, None)

    def get_provider(self, name: str) -> Optional[OCRProvider]:
        """Get provider by specific name."""
        return self._providers.get(name)

    def get_active_provider(self) -> Optional[OCRProvider]:
        """Return first available OCR provider or first registered provider."""
        for provider in self._providers.values():
            if provider.is_available:
                return provider
        # If none currently available, return the default registered provider
        if self._providers:
            return next(iter(self._providers.values()))
        return None

    def list_providers(self) -> List[OCRProvider]:
        """List all registered providers."""
        return list(self._providers.values())


# Global singleton
_global_ocr_registry: Optional[OCRProviderRegistry] = None


def get_ocr_registry() -> OCRProviderRegistry:
    """Retrieve global OCR provider registry singleton."""
    global _global_ocr_registry
    if _global_ocr_registry is None:
        _global_ocr_registry = OCRProviderRegistry()
    return _global_ocr_registry
