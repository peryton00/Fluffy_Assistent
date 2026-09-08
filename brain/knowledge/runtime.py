"""
Knowledge Runtime Facade
The central capability facade providing local document indexing, retrieval, and health diagnostics.
"""

from typing import Optional, List, Dict, Any, Union
from pathlib import Path
import time

from brain.knowledge.definitions import DocumentClassification, KnowledgeHealthStatus
from brain.knowledge.config import KnowledgeConfig
from brain.knowledge.metadata import DocumentMetadata
from brain.knowledge.documents import KnowledgeDocument
from brain.knowledge.ingestion.discovery import DocumentDiscovery
from brain.knowledge.ingestion.parsers.factory import ParserFactory, get_parser_factory
from brain.knowledge.ingestion.manager import IngestionManager
from brain.knowledge.chunking.deterministic import DeterministicChunker
from brain.knowledge.embeddings.local import DeterministicLocalEmbeddingProvider
from brain.knowledge.embeddings.provider import EmbeddingProviderFactory, get_embedding_factory
from brain.knowledge.index.local import LocalKnowledgeIndex
from brain.knowledge.retrieval.engine import KnowledgeRetrievalEngine
from brain.knowledge.retrieval.query import KnowledgeQuery
from brain.knowledge.provenance.citations import RetrievalResult
from brain.knowledge.lifecycle import KnowledgeLifecycleManager
from brain.knowledge.health import KnowledgeHealth


class KnowledgeRuntime:
    """
    Central local-first Knowledge & RAG Runtime.
    Provides local document ingestion, vector/lexical indexing, and secure retrieval.
    """

    def __init__(
        self,
        config: Optional[KnowledgeConfig] = None,
        index: Optional[LocalKnowledgeIndex] = None,
        parser_factory: Optional[ParserFactory] = None,
    ):
        self.config = config or KnowledgeConfig()
        db_path = self.config.get_index_db_path()
        self.index = index or LocalKnowledgeIndex(db_path=db_path)
        self.parser_factory = parser_factory or get_parser_factory()
        self.ingestion = IngestionManager(parser_factory=self.parser_factory)
        self.chunker = DeterministicChunker(
            target_chunk_size=self.config.target_chunk_size,
            chunk_overlap=self.config.chunk_overlap,
        )
        self.embedding_provider = DeterministicLocalEmbeddingProvider(
            dimension=self.config.embedding_dimension,
        )
        self.retrieval_engine = KnowledgeRetrievalEngine(
            index=self.index,
            embedding_provider=self.embedding_provider,
        )
        self.lifecycle = KnowledgeLifecycleManager(
            index=self.index,
            ingestion_manager=self.ingestion,
            chunker=self.chunker,
            embedding_provider=self.embedding_provider,
        )

    def index_file(
        self,
        file_path: Union[str, Path],
        classification: DocumentClassification = DocumentClassification.INTERNAL,
        owner: Optional[str] = None,
        allowed_identities: Optional[List[str]] = None,
        force_reindex: bool = False,
    ) -> KnowledgeDocument:
        """Index a single local document."""
        return self.lifecycle.index_document(
            file_path=Path(file_path),
            classification=classification,
            owner=owner,
            allowed_identities=allowed_identities,
            force_reindex=force_reindex,
        )

    def index_directory(
        self,
        dir_path: Union[str, Path],
        recursive: bool = True,
        classification: DocumentClassification = DocumentClassification.INTERNAL,
        owner: Optional[str] = None,
        max_files: int = 500,
    ) -> List[KnowledgeDocument]:
        """Discover and index all supported files within a local directory."""
        root = Path(dir_path).resolve()
        files = DocumentDiscovery.discover_files(root, recursive=recursive, max_files=max_files)
        indexed: List[KnowledgeDocument] = []
        for f in files:
            doc = self.index_file(f, classification=classification, owner=owner)
            indexed.append(doc)
        return indexed

    def search(
        self,
        query: Union[str, KnowledgeQuery],
        top_k: Optional[int] = None,
        minimum_score: Optional[float] = None,
        document_ids: Optional[List[str]] = None,
        paths: Optional[List[str]] = None,
        identity: Optional[Any] = None,
    ) -> List[RetrievalResult]:
        """
        Execute knowledge retrieval search.
        Accepts either a string or a structured KnowledgeQuery.
        """
        if isinstance(query, str):
            k_query = KnowledgeQuery(
                query_text=query,
                top_k=top_k or self.config.default_top_k,
                minimum_score=minimum_score if minimum_score is not None else 0.0,
                document_ids=document_ids,
                paths=paths,
                alpha=self.config.default_alpha,
                identity=identity,
                rerank=self.config.enable_reranking,
            )
        else:
            k_query = query
            if top_k is not None:
                k_query.top_k = top_k
            if minimum_score is not None:
                k_query.minimum_score = minimum_score
            if identity is not None and k_query.identity is None:
                k_query.identity = identity

        return self.retrieval_engine.search(k_query)

    def get_document(self, document_id: str) -> Optional[DocumentMetadata]:
        """Retrieve document metadata by document ID."""
        return self.index.get_document(document_id)

    def get_document_by_path(self, source_path: str) -> Optional[DocumentMetadata]:
        """Retrieve document metadata by filesystem path."""
        return self.index.get_document_by_path(source_path)

    def list_documents(self) -> List[DocumentMetadata]:
        """List all indexed documents."""
        return self.index.list_documents()

    def delete_document(self, document_id: str) -> bool:
        """Delete document from knowledge index."""
        return self.lifecycle.delete_document(document_id)

    def delete_document_by_path(self, source_path: str) -> bool:
        """Delete document by source path."""
        return self.lifecycle.delete_document_by_path(source_path)

    def sync_file(self, file_path: Union[str, Path]) -> Optional[Any]:
        """Synchronize file status with index (detect modifications/deletions)."""
        return self.lifecycle.sync_file(Path(file_path))

    def check_health(self) -> KnowledgeHealth:
        """Perform non-destructive health check."""
        try:
            doc_count = self.index.count_documents()
            chunk_count = self.index.count_chunks()
            extensions = self.parser_factory.list_supported_extensions()

            return KnowledgeHealth(
                status=KnowledgeHealthStatus.HEALTHY,
                total_documents=doc_count,
                total_chunks=chunk_count,
                embedding_model=self.embedding_provider.model_name,
                embedding_dimension=self.embedding_provider.dimension,
                supported_extensions=extensions,
                last_error=None,
                last_checked=time.time(),
            )
        except Exception as e:
            return KnowledgeHealth(
                status=KnowledgeHealthStatus.FAILED,
                last_error=str(e),
                last_checked=time.time(),
            )


# Global singleton instance
_global_knowledge_runtime: Optional[KnowledgeRuntime] = None


def get_knowledge_runtime() -> KnowledgeRuntime:
    """Retrieve global KnowledgeRuntime singleton."""
    global _global_knowledge_runtime
    if _global_knowledge_runtime is None:
        _global_knowledge_runtime = KnowledgeRuntime()
    return _global_knowledge_runtime
