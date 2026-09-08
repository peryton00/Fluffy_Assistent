"""
Embedding Provider Factory and Registry
Allows switching or extending embedding providers with strict offline and dimension validation.
"""

from typing import Dict, Optional
from brain.knowledge.embeddings.interface import EmbeddingProvider
from brain.knowledge.embeddings.local import DeterministicLocalEmbeddingProvider


class EmbeddingProviderFactory:
    """Factory and registry for embedding model providers."""

    def __init__(self, default_provider: Optional[EmbeddingProvider] = None):
        self._providers: Dict[str, EmbeddingProvider] = {}
        default = default_provider or DeterministicLocalEmbeddingProvider()
        self.register_provider(default)
        self._default_provider_name = default.model_name

    def register_provider(self, provider: EmbeddingProvider) -> None:
        """Register an embedding provider."""
        self._providers[provider.model_name] = provider

    def get_provider(self, model_name: Optional[str] = None) -> EmbeddingProvider:
        """Retrieve provider by model name or return the default provider."""
        if model_name and model_name in self._providers:
            return self._providers[model_name]
        return self._providers[self._default_provider_name]


# Global singleton
_global_embedding_factory: Optional[EmbeddingProviderFactory] = None


def get_embedding_factory() -> EmbeddingProviderFactory:
    """Retrieve global EmbeddingProviderFactory singleton."""
    global _global_embedding_factory
    if _global_embedding_factory is None:
        _global_embedding_factory = EmbeddingProviderFactory()
    return _global_embedding_factory
