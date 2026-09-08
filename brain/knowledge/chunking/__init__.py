"""
Knowledge Chunking Subsystem
"""

from brain.knowledge.chunking.interface import Chunker
from brain.knowledge.chunking.deterministic import DeterministicChunker

__all__ = [
    "Chunker",
    "DeterministicChunker",
]
