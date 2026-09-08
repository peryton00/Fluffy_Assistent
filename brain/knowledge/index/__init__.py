"""
Knowledge Index Subsystem
"""

from brain.knowledge.index.interface import KnowledgeIndex
from brain.knowledge.index.records import IndexedDocumentRecord, IndexedChunkRecord
from brain.knowledge.index.local import LocalKnowledgeIndex

__all__ = [
    "KnowledgeIndex",
    "IndexedDocumentRecord",
    "IndexedChunkRecord",
    "LocalKnowledgeIndex",
]
