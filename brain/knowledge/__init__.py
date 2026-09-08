"""
Fluffy Brain - Local Knowledge & RAG Subsystem (Phase 2F)
Provides local-first, permission-aware, offline-capable document ingestion, indexing, and retrieval.
"""

from brain.knowledge.definitions import (
    DocumentStatus,
    DocumentMimeType,
    DocumentClassification,
    KnowledgeHealthStatus,
)
from brain.knowledge.permissions import (
    KnowledgeAccessIdentity,
    KnowledgePermissionPolicy,
)
from brain.knowledge.metadata import (
    DocumentMetadata,
    ChunkMetadata,
)
from brain.knowledge.documents import (
    KnowledgeDocument,
    DocumentChunk,
    ParsedDocument,
    ParsedSection,
)
from brain.knowledge.config import KnowledgeConfig
from brain.knowledge.ingestion import (
    DocumentParser,
    compute_content_hash,
    DocumentDiscovery,
    IngestionManager,
    TextDocumentParser,
    PDFDocumentParser,
    DOCXDocumentParser,
    ParserFactory,
    get_parser_factory,
)
from brain.knowledge.chunking import (
    Chunker,
    DeterministicChunker,
)
from brain.knowledge.embeddings import (
    EmbeddingProvider,
    DeterministicLocalEmbeddingProvider,
    EmbeddingProviderFactory,
    get_embedding_factory,
)
from brain.knowledge.index import (
    KnowledgeIndex,
    LocalKnowledgeIndex,
    IndexedDocumentRecord,
    IndexedChunkRecord,
)
from brain.knowledge.retrieval import (
    RetrievalEngine,
    KnowledgeQuery,
    HybridScorer,
    Reranker,
    NoOpReranker,
    DeterministicLocalReranker,
    KnowledgeRetrievalEngine,
)
from brain.knowledge.provenance import (
    Citation,
    RetrievalResult,
)
from brain.knowledge.lifecycle import KnowledgeLifecycleManager
from brain.knowledge.health import KnowledgeHealth
from brain.knowledge.runtime import KnowledgeRuntime, get_knowledge_runtime

__all__ = [
    "DocumentStatus",
    "DocumentMimeType",
    "DocumentClassification",
    "KnowledgeHealthStatus",
    "KnowledgeAccessIdentity",
    "KnowledgePermissionPolicy",
    "DocumentMetadata",
    "ChunkMetadata",
    "KnowledgeDocument",
    "DocumentChunk",
    "ParsedDocument",
    "ParsedSection",
    "KnowledgeConfig",
    "DocumentParser",
    "compute_content_hash",
    "DocumentDiscovery",
    "IngestionManager",
    "TextDocumentParser",
    "PDFDocumentParser",
    "DOCXDocumentParser",
    "ParserFactory",
    "get_parser_factory",
    "Chunker",
    "DeterministicChunker",
    "EmbeddingProvider",
    "DeterministicLocalEmbeddingProvider",
    "EmbeddingProviderFactory",
    "get_embedding_factory",
    "KnowledgeIndex",
    "LocalKnowledgeIndex",
    "IndexedDocumentRecord",
    "IndexedChunkRecord",
    "RetrievalEngine",
    "KnowledgeQuery",
    "HybridScorer",
    "Reranker",
    "NoOpReranker",
    "DeterministicLocalReranker",
    "KnowledgeRetrievalEngine",
    "Citation",
    "RetrievalResult",
    "KnowledgeLifecycleManager",
    "KnowledgeHealth",
    "KnowledgeRuntime",
    "get_knowledge_runtime",
]
