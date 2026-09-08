"""
Knowledge Document Ingestion Subsystem
"""

from brain.knowledge.ingestion.interface import DocumentParser
from brain.knowledge.ingestion.hashing import compute_content_hash
from brain.knowledge.ingestion.discovery import DocumentDiscovery
from brain.knowledge.ingestion.manager import IngestionManager
from brain.knowledge.ingestion.parsers import (
    TextDocumentParser,
    PDFDocumentParser,
    DOCXDocumentParser,
    ParserFactory,
    get_parser_factory,
)

__all__ = [
    "DocumentParser",
    "compute_content_hash",
    "DocumentDiscovery",
    "IngestionManager",
    "TextDocumentParser",
    "PDFDocumentParser",
    "DOCXDocumentParser",
    "ParserFactory",
    "get_parser_factory",
]
