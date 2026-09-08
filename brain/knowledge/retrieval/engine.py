"""
Knowledge Retrieval Engine
Coordinates query vectorization, index lookup, hybrid scoring, reranking,
permission enforcement, and citation generation.
"""

from typing import List, Optional, Dict, Any, Tuple

from brain.knowledge.index.interface import KnowledgeIndex
from brain.knowledge.embeddings.interface import EmbeddingProvider
from brain.knowledge.retrieval.interface import RetrievalEngine
from brain.knowledge.retrieval.query import KnowledgeQuery
from brain.knowledge.retrieval.scoring import HybridScorer
from brain.knowledge.retrieval.reranking import Reranker, DeterministicLocalReranker
from brain.knowledge.permissions import KnowledgePermissionPolicy
from brain.knowledge.provenance.citations import Citation, RetrievalResult
from brain.knowledge.documents import DocumentChunk
from brain.knowledge.metadata import DocumentMetadata


class KnowledgeRetrievalEngine(RetrievalEngine):
    """
    Coordinates multi-stage local retrieval with strict access control and provenance tracking.
    """

    def __init__(
        self,
        index: KnowledgeIndex,
        embedding_provider: EmbeddingProvider,
        reranker: Optional[Reranker] = None,
    ):
        self.index = index
        self.embedding_provider = embedding_provider
        self.reranker = reranker or DeterministicLocalReranker()

    def search(self, query: KnowledgeQuery) -> List[RetrievalResult]:
        """Execute knowledge search pipeline."""
        if not query.query_text or not query.query_text.strip():
            return []

        # 1. Resolve Document IDs from paths if provided
        target_doc_ids: Optional[List[str]] = None
        if query.document_ids:
            target_doc_ids = list(query.document_ids)
        elif query.paths:
            resolved_ids = []
            for p in query.paths:
                meta = self.index.get_document_by_path(p)
                if meta:
                    resolved_ids.append(meta.document_id)
            target_doc_ids = resolved_ids if resolved_ids else ["non_existent_id"]

        # Fetch extra candidates for hybrid fusion and reranking
        fetch_k = max(query.top_k * 3, 20)

        # 2. Dense Vector Retrieval
        query_vector = self.embedding_provider.embed_single(query.query_text)
        vec_results = self.index.search_vector(
            query_vector=query_vector,
            top_k=fetch_k,
            document_ids=target_doc_ids,
        )

        # 3. Lexical Retrieval
        lex_results = self.index.search_lexical(
            query_text=query.query_text,
            top_k=fetch_k,
            document_ids=target_doc_ids,
        )

        # 4. Hybrid Score Fusion
        fused = HybridScorer.combine_scores(
            vector_results=vec_results,
            lexical_results=lex_results,
            alpha=query.alpha,
        )

        # 5. Optional Local Reranking
        if query.rerank and self.reranker:
            candidates = self.reranker.rerank(query.query_text, fused)
        else:
            candidates = fused

        # 6. Document Metadata Cache & Permission Filtering
        doc_cache: Dict[str, Optional[DocumentMetadata]] = {}
        filtered_results: List[RetrievalResult] = []
        current_rank = 1

        for chunk, score in candidates:
            if score < query.minimum_score:
                continue

            doc_id = chunk.document_id
            if doc_id not in doc_cache:
                doc_cache[doc_id] = self.index.get_document(doc_id)

            doc_meta = doc_cache[doc_id]
            if not doc_meta:
                continue

            # Permission Gate: verify access before returning content
            allowed = KnowledgePermissionPolicy.is_access_allowed(
                classification=doc_meta.classification,
                owner=doc_meta.owner,
                allowed_identities=doc_meta.allowed_identities,
                identity=query.identity,
            )
            if not allowed:
                continue

            # Check optional classification filter in query
            if query.classification_filter and doc_meta.classification != query.classification_filter:
                continue

            # Construct Citation
            c_meta = chunk.metadata
            citation = Citation(
                document_id=doc_meta.document_id,
                document_title=doc_meta.display_name,
                source_path=doc_meta.source_path,
                page_number=c_meta.page_number,
                section=c_meta.section,
                chunk_index=c_meta.chunk_index,
            )

            res = RetrievalResult(
                chunk_id=c_meta.chunk_id,
                document_id=doc_meta.document_id,
                text=chunk.text,
                score=score,
                rank=current_rank,
                source_path=doc_meta.source_path,
                display_name=doc_meta.display_name,
                page_number=c_meta.page_number,
                section=c_meta.section,
                citation=citation,
                metadata=dict(c_meta.custom_metadata),
            )
            filtered_results.append(res)
            current_rank += 1

            if len(filtered_results) >= query.top_k:
                break

        return filtered_results
