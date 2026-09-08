"""
Embedding Provider Interface
Defines the local embedding abstraction for knowledge vectorization.
"""

from abc import ABC, abstractmethod
from typing import List


class EmbeddingProvider(ABC):
    """Abstract interface for local embedding generation."""

    @property
    @abstractmethod
    def model_name(self) -> str:
        """Name or identifier of the embedding model."""
        pass

    @property
    @abstractmethod
    def dimension(self) -> int:
        """Vector dimensionality of the generated embeddings."""
        pass

    @abstractmethod
    def embed(self, texts: List[str]) -> List[List[float]]:
        """Generate embedding vectors for a list of input text strings."""
        pass

    def embed_single(self, text: str) -> List[float]:
        """Convenience method to embed a single text string."""
        results = self.embed([text])
        return results[0] if results else [0.0] * self.dimension
