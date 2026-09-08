"""
Document Chunker Interface
"""

from abc import ABC, abstractmethod
from typing import List

from brain.knowledge.documents import KnowledgeDocument, DocumentChunk


class Chunker(ABC):
    """Abstract interface for document chunking algorithms."""

    @abstractmethod
    def chunk(self, document: KnowledgeDocument) -> List[DocumentChunk]:
        """Split a document into structured, deterministic text chunks."""
        pass
