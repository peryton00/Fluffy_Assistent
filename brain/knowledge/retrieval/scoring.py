"""
Hybrid Scoring Engine
Combines dense vector semantic similarity with lexical token matching scores.
"""

from typing import Dict, List, Tuple
from brain.knowledge.documents import DocumentChunk


class HybridScorer:
    """
    Combines vector cosine similarity and lexical token overlap into a unified score.
    """

    @staticmethod
    def combine_scores(
        vector_results: List[Tuple[DocumentChunk, float]],
        lexical_results: List[Tuple[DocumentChunk, float]],
        alpha: float = 0.7,
    ) -> List[Tuple[DocumentChunk, float]]:
        """
        Merge vector and lexical scored results.
        alpha: weight for vector score (1.0 = pure vector, 0.0 = pure lexical).
        """
        chunk_map: Dict[str, DocumentChunk] = {}
        vec_scores: Dict[str, float] = {}
        lex_scores: Dict[str, float] = {}

        for chunk, score in vector_results:
            cid = chunk.chunk_id
            chunk_map[cid] = chunk
            # Normalize cosine score from [-1, 1] to [0, 1]
            norm_score = max(0.0, min(1.0, (score + 1.0) / 2.0))
            vec_scores[cid] = norm_score

        for chunk, score in lexical_results:
            cid = chunk.chunk_id
            chunk_map[cid] = chunk
            lex_scores[cid] = max(0.0, min(1.0, score))

        combined: List[Tuple[DocumentChunk, float]] = []
        all_ids = set(vec_scores.keys()).union(set(lex_scores.keys()))

        for cid in all_ids:
            s_vec = vec_scores.get(cid, 0.0)
            s_lex = lex_scores.get(cid, 0.0)
            final_score = (alpha * s_vec) + ((1.0 - alpha) * s_lex)
            combined.append((chunk_map[cid], final_score))

        combined.sort(key=lambda x: x[1], reverse=True)
        return combined
