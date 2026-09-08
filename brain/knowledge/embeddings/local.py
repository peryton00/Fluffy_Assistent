"""
Local Deterministic Embedding Provider
Generates normalized dense semantic vector representations completely offline without cloud APIs or network calls.
"""

from typing import List
import hashlib
import math
import numpy as np

from brain.knowledge.embeddings.interface import EmbeddingProvider


class DeterministicLocalEmbeddingProvider(EmbeddingProvider):
    """
    Lightweight, deterministic local semantic embedding generator.
    Maps words and character n-grams through signed feature hashing and L2 normalization.
    Guarantees 100% offline execution and stable vector spaces.
    """

    def __init__(self, dimension: int = 256, model_name: str = "fluffy-local-deterministic-256"):
        self._dimension = dimension
        self._model_name = model_name

    @property
    def model_name(self) -> str:
        return self._model_name

    @property
    def dimension(self) -> int:
        return self._dimension

    def _hash_feature(self, feature: str) -> tuple[int, float]:
        """Hash a token/n-gram to an index in [0, dimension) and a sign in {-1.0, 1.0}."""
        h = int(hashlib.md5(feature.encode("utf-8")).hexdigest(), 16)
        idx = h % self._dimension
        sign = 1.0 if ((h >> 32) & 1) == 0 else -1.0
        return idx, sign

    def embed_text(self, text: str) -> List[float]:
        """Convert a single text into a normalized dense vector."""
        if not text or not text.strip():
            return [0.0] * self._dimension

        vec = np.zeros(self._dimension, dtype=np.float32)
        words = text.lower().split()

        for w in words:
            # 1. Whole word feature
            idx, sign = self._hash_feature(f"w_{w}")
            vec[idx] += sign * 1.5

            # 2. Subword 3-gram and 4-gram features
            if len(w) >= 3:
                for n in (3, 4):
                    for i in range(len(w) - n + 1):
                        ngram = w[i : i + n]
                        n_idx, n_sign = self._hash_feature(f"ng_{ngram}")
                        vec[n_idx] += n_sign * 0.8

        # L2 Normalization
        norm = float(np.linalg.norm(vec))
        if norm > 1e-9:
            vec = vec / norm
        else:
            vec = np.zeros(self._dimension, dtype=np.float32)

        return vec.tolist()

    def embed(self, texts: List[str]) -> List[List[float]]:
        """Batch vector embedding."""
        return [self.embed_text(t) for t in texts]
