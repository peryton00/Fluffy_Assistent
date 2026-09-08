"""
Knowledge Index Interface
Defines the storage, search, and update contract for local knowledge indices.
"""

from abc import ABC, abstractmethod
from typing import List, Optional, Dict, Any

from brain.knowledge.metadata import DocumentMetadata, ChunkMetadata
from brain.knowledge.documents import KnowledgeDocument, DocumentChunk


class KnowledgeIndex(ABC):
    """Abstract interface for local knowledge indexing and storage."""

    @abstractmethod
    def upsert_document(self, document: KnowledgeDocument) -> bool:
        """Store or update a document metadata and its associated chunks."""
        pass

    @abstractmethod
    def get_document(self, document_id: str) -> Optional[DocumentMetadata]:
        """Retrieve document metadata by document ID."""
        pass

    @abstractmethod
    def get_document_by_path(self, source_path: str) -> Optional[DocumentMetadata]:
        """Retrieve document metadata by source filesystem path."""
        pass

    @abstractmethod
    def list_documents(self) -> List[DocumentMetadata]:
        """List all indexed document metadata."""
        pass

    @abstractmethod
    def delete_document(self, document_id: str) -> bool:
        """Purge document metadata and all its chunks from the index."""
        pass

    @abstractmethod
    def get_chunks_for_document(self, document_id: str) -> List[DocumentChunk]:
        """Retrieve all chunks belonging to a document."""
        pass

    @abstractmethod
    def search_vector(
        self,
        query_vector: List[float],
        top_k: int = 10,
        document_ids: Optional[List[str]] = None,
    ) -> List[tuple[DocumentChunk, float]]:
        """Perform vector cosine similarity search returning (chunk, similarity_score)."""
        pass

    @abstractmethod
    def search_lexical(
        self,
        query_text: str,
        top_k: int = 10,
        document_ids: Optional[List[str]] = None,
    ) -> List[tuple[DocumentChunk, float]]:
        """Perform lexical / BM25 token matching search returning (chunk, lexical_score)."""
        pass

    @abstractmethod
    def count_documents(self) -> int:
        """Return total count of indexed documents."""
        pass

    @abstractmethod
    def count_chunks(self) -> int:
        """Return total count of indexed chunks."""
        pass

    @abstractmethod
    def close(self) -> None:
        """Close index connection and flush data."""
        pass
