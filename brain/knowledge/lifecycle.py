"""
Knowledge Lifecycle and Document Synchronization Manager
Handles document state transitions, content change detection, synchronization, and safe deletion.
"""

from pathlib import Path
from typing import Dict, Any, List, Optional
import time

from brain.knowledge.definitions import DocumentStatus
from brain.knowledge.metadata import DocumentMetadata
from brain.knowledge.documents import KnowledgeDocument
from brain.knowledge.index.interface import KnowledgeIndex
from brain.knowledge.ingestion.hashing import compute_content_hash
from brain.knowledge.ingestion.manager import IngestionManager
from brain.knowledge.chunking.interface import Chunker
from brain.knowledge.embeddings.interface import EmbeddingProvider


class KnowledgeLifecycleManager:
    """
    Manages document synchronization, change detection, and deletion.
    """

    def __init__(
        self,
        index: KnowledgeIndex,
        ingestion_manager: IngestionManager,
        chunker: Chunker,
        embedding_provider: EmbeddingProvider,
    ):
        self.index = index
        self.ingestion = ingestion_manager
        self.chunker = chunker
        self.embedding = embedding_provider

    def index_document(
        self,
        file_path: Path,
        classification: Any,
        owner: Optional[str] = None,
        allowed_identities: Optional[List[str]] = None,
        force_reindex: bool = False,
    ) -> KnowledgeDocument:
        """
        Ingest, chunk, embed, and index a local document.
        Detects if content hash already exists to avoid redundant processing.
        """
        path = Path(file_path).resolve()
        path_str = str(path)

        # Check existing metadata in index
        existing_meta = self.index.get_document_by_path(path_str)

        # 1. Ingest & Parse
        doc = self.ingestion.ingest_file(
            file_path=path,
            classification=classification,
            owner=owner,
            allowed_identities=allowed_identities,
        )

        if doc.metadata.status in (DocumentStatus.FAILED, DocumentStatus.OCR_REQUIRED):
            self.index.upsert_document(doc)
            return doc

        # 2. Check if unchanged content
        if not force_reindex and existing_meta:
            if existing_meta.content_hash == doc.metadata.content_hash and existing_meta.status == DocumentStatus.READY:
                # Content identical, return existing indexed state
                existing_doc = KnowledgeDocument(metadata=existing_meta)
                existing_doc.chunks = self.index.get_chunks_for_document(existing_meta.document_id)
                return existing_doc

        # 3. Chunking
        doc.metadata.status = DocumentStatus.INDEXING
        chunks = self.chunker.chunk(doc)

        # 4. Generate Embeddings
        chunk_texts = [c.text for c in chunks]
        if chunk_texts:
            embeddings = self.embedding.embed(chunk_texts)
            for chunk, emb in zip(chunks, embeddings):
                chunk.embedding = emb

        # 5. Commit to Local Index
        doc.metadata.status = DocumentStatus.READY
        doc.metadata.indexed_at = time.time()
        self.index.upsert_document(doc)
        return doc

    def sync_file(self, file_path: Path) -> Optional[DocumentStatus]:
        """
        Synchronize a single file:
        - If deleted on disk: removes from index.
        - If modified on disk: re-indexes.
        - If unchanged: returns READY.
        """
        path = Path(file_path).resolve()
        path_str = str(path)
        existing = self.index.get_document_by_path(path_str)

        if not path.exists():
            if existing:
                self.index.delete_document(existing.document_id)
                return DocumentStatus.DELETED
            return None

        if not existing:
            doc = self.index_document(path, classification=existing.classification if existing else None)
            return doc.metadata.status

        current_hash = compute_content_hash(path)
        if current_hash != existing.content_hash:
            # File modified -> reindex
            doc = self.index_document(path, classification=existing.classification, force_reindex=True)
            return doc.metadata.status

        return existing.status

    def delete_document(self, document_id: str) -> bool:
        """Safely delete document and chunks from index."""
        return self.index.delete_document(document_id)

    def delete_document_by_path(self, source_path: str) -> bool:
        """Find and delete document by source filesystem path."""
        meta = self.index.get_document_by_path(source_path)
        if meta:
            return self.index.delete_document(meta.document_id)
        return False
