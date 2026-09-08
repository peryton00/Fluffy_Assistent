"""
Knowledge Reranker Interface and Local Deterministic Reranker
Re-scores and re-orders candidate retrieval results without invoking expensive generative LLMs.
"""

from abc import ABC, abstractmethod
from typing import List, Tuple
import re

from brain.knowledge.documents import DocumentChunk


class Reranker(ABC):
    """Abstract interface for retrieval rerankers."""

    @abstractmethod
    def rerank(
        self,
        query_text: str,
        candidates: List[Tuple[DocumentChunk, float]],
    ) -> List[Tuple[DocumentChunk, float]]:
        """Re-score and re-order candidate chunks."""
        pass


class NoOpReranker(Reranker):
    """Pass-through reranker that preserves existing order."""

    def rerank(
        self,
        query_text: str,
        candidates: List[Tuple[DocumentChunk, float]],
    ) -> List[Tuple[DocumentChunk, float]]:
        return candidates


class DeterministicLocalReranker(Reranker):
    """
    Fast local reranker that applies deterministic lexical bonuses:
    - Exact query phrase match bonus (+0.15)
    - Heading/Section title match bonus (+0.10)
    - Query token density bonus (+0.05)
    """

    def rerank(
        self,
        query_text: str,
        candidates: List[Tuple[DocumentChunk, float]],
    ) -> List[Tuple[DocumentChunk, float]]:
        q_clean = query_text.lower().strip()
        tokens = set(t for t in q_clean.split() if len(t) >= 2)

        reranked: List[Tuple[DocumentChunk, float]] = []

        for chunk, base_score in candidates:
            text_lower = chunk.text.lower()
            bonus = 0.0

            # 1. Exact phrase match
            if q_clean in text_lower:
                bonus += 0.15

            # 2. Heading / Section title match
            section_title = (chunk.metadata.section or "").lower()
            if any(t in section_title for t in tokens):
                bonus += 0.10

            # 3. Token density
            matched_count = sum(1 for t in tokens if t in text_lower)
            if tokens:
                density = float(matched_count) / float(len(tokens))
                bonus += 0.05 * density

            new_score = min(1.0, base_score + bonus)
            reranked.append((chunk, new_score))

        reranked.sort(key=lambda x: x[1], reverse=True)
        return reranked
