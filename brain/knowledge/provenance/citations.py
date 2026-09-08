"""
Knowledge Provenance and Citation Representation
Constructs structured citations linking retrieved chunks to original document sources.
"""

from typing import Optional, Dict, Any
from dataclasses import dataclass, field


@dataclass
class Citation:
    """Structured citation metadata pointing to an exact document source location."""
    document_id: str
    document_title: str
    source_path: str
    page_number: Optional[int] = None
    section: Optional[str] = None
    chunk_index: int = 0

    def format_citation(self) -> str:
        """Format a human-readable citation string."""
        parts = [f"Source: {self.document_title}"]
        if self.page_number is not None:
            parts.append(f"p. {self.page_number}")
        if self.section and self.section != "General":
            parts.append(f"sec: {self.section}")
        return f"[{', '.join(parts)}]"


@dataclass
class RetrievalResult:
    """A scored, citation-ready chunk returned from the retrieval engine."""
    chunk_id: str
    document_id: str
    text: str
    score: float
    rank: int = 1
    source_path: str = ""
    display_name: str = ""
    page_number: Optional[int] = None
    section: Optional[str] = None
    citation: Optional[Citation] = None
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "chunk_id": self.chunk_id,
            "document_id": self.document_id,
            "text": self.text,
            "score": round(self.score, 4),
            "rank": self.rank,
            "source_path": self.source_path,
            "display_name": self.display_name,
            "page_number": self.page_number,
            "section": self.section,
            "citation": self.citation.format_citation() if self.citation else f"[{self.display_name}]",
            "metadata": self.metadata,
        }
