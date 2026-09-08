"""
Retrieval Engine Interface
"""

from abc import ABC, abstractmethod
from typing import List

from brain.knowledge.provenance.citations import RetrievalResult


class RetrievalEngine(ABC):
    """Abstract interface for knowledge retrieval engines."""

    @abstractmethod
    def search(self, query: "KnowledgeQuery") -> List[RetrievalResult]:
        """Execute knowledge search query returning ranked, permission-filtered retrieval results."""
        pass
