"""
Knowledge Query Request Model
Structured query request model for knowledge retrieval operations.
"""

from typing import Optional, List, Dict, Any
from dataclasses import dataclass, field

from brain.knowledge.permissions import KnowledgeAccessIdentity
from brain.knowledge.definitions import DocumentClassification


@dataclass
class KnowledgeQuery:
    """Structured search query for knowledge retrieval."""
    query_text: str
    top_k: int = 5
    document_ids: Optional[List[str]] = None
    paths: Optional[List[str]] = None
    minimum_score: float = 0.0
    alpha: float = 0.7  # 0.7 vector semantic weight, 0.3 lexical weight
    identity: Optional[KnowledgeAccessIdentity] = None
    classification_filter: Optional[DocumentClassification] = None
    rerank: bool = True
    custom_filters: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "query_text": self.query_text,
            "top_k": self.top_k,
            "document_ids": self.document_ids,
            "paths": self.paths,
            "minimum_score": self.minimum_score,
            "alpha": self.alpha,
            "rerank": self.rerank,
            "custom_filters": self.custom_filters,
        }
