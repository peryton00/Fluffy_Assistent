"""
Knowledge Index Record Models
Provides typed database record representations for local SQLite storage.
"""

from typing import List, Optional, Dict, Any
from dataclasses import dataclass
import json


@dataclass
class IndexedDocumentRecord:
    """Row record for documents table."""
    document_id: str
    source_path: str
    display_name: str
    mime_type: str
    size_bytes: int
    content_hash: str
    created_at: float
    modified_at: float
    indexed_at: float
    parser_name: str
    version: int
    status: str
    classification: str
    owner: Optional[str]
    allowed_identities_json: str
    chunk_count: int
    page_count: Optional[int]
    error_message: Optional[str]
    custom_metadata_json: str


@dataclass
class IndexedChunkRecord:
    """Row record for chunks table."""
    chunk_id: str
    document_id: str
    chunk_index: int
    page_number: Optional[int]
    section: Optional[str]
    start_offset: int
    end_offset: int
    token_count: int
    content_hash: str
    text: str
    embedding_json: Optional[str]
    custom_metadata_json: str
