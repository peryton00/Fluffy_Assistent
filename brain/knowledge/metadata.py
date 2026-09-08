"""
Knowledge Document and Chunk Metadata Models
Provides structured, serializable metadata for indexed documents and individual text chunks.
"""

from typing import Dict, Any, List, Optional
from dataclasses import dataclass, field
import time

from brain.knowledge.definitions import DocumentStatus, DocumentMimeType, DocumentClassification


@dataclass
class DocumentMetadata:
    """Structured metadata describing an indexed document."""
    document_id: str
    source_path: str
    display_name: str
    mime_type: DocumentMimeType = DocumentMimeType.TEXT
    size_bytes: int = 0
    content_hash: str = ""
    created_at: float = field(default_factory=time.time)
    modified_at: float = field(default_factory=time.time)
    indexed_at: float = field(default_factory=time.time)
    parser_name: str = "default"
    version: int = 1
    status: DocumentStatus = DocumentStatus.DISCOVERED
    classification: DocumentClassification = DocumentClassification.INTERNAL
    owner: Optional[str] = None
    allowed_identities: List[str] = field(default_factory=list)
    chunk_count: int = 0
    page_count: Optional[int] = None
    error_message: Optional[str] = None
    custom_metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "document_id": self.document_id,
            "source_path": self.source_path,
            "display_name": self.display_name,
            "mime_type": self.mime_type.value,
            "size_bytes": self.size_bytes,
            "content_hash": self.content_hash,
            "created_at": self.created_at,
            "modified_at": self.modified_at,
            "indexed_at": self.indexed_at,
            "parser_name": self.parser_name,
            "version": self.version,
            "status": self.status.value,
            "classification": self.classification.value,
            "owner": self.owner,
            "allowed_identities": self.allowed_identities,
            "chunk_count": self.chunk_count,
            "page_count": self.page_count,
            "error_message": self.error_message,
            "custom_metadata": self.custom_metadata,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "DocumentMetadata":
        mime_str = data.get("mime_type", "text/plain")
        mime = DocumentMimeType(mime_str) if mime_str in DocumentMimeType._value2member_map_ else DocumentMimeType.TEXT

        status_str = data.get("status", "discovered")
        status = DocumentStatus(status_str) if status_str in DocumentStatus._value2member_map_ else DocumentStatus.DISCOVERED

        class_str = data.get("classification", "internal")
        classification = DocumentClassification(class_str) if class_str in DocumentClassification._value2member_map_ else DocumentClassification.INTERNAL

        return cls(
            document_id=data["document_id"],
            source_path=data.get("source_path", ""),
            display_name=data.get("display_name", ""),
            mime_type=mime,
            size_bytes=int(data.get("size_bytes", 0)),
            content_hash=data.get("content_hash", ""),
            created_at=float(data.get("created_at", time.time())),
            modified_at=float(data.get("modified_at", time.time())),
            indexed_at=float(data.get("indexed_at", time.time())),
            parser_name=data.get("parser_name", "default"),
            version=int(data.get("version", 1)),
            status=status,
            classification=classification,
            owner=data.get("owner"),
            allowed_identities=data.get("allowed_identities", []),
            chunk_count=int(data.get("chunk_count", 0)),
            page_count=data.get("page_count"),
            error_message=data.get("error_message"),
            custom_metadata=data.get("custom_metadata", {}),
        )


@dataclass
class ChunkMetadata:
    """Structured metadata for an individual document chunk."""
    chunk_id: str
    document_id: str
    chunk_index: int
    page_number: Optional[int] = None
    section: Optional[str] = None
    start_offset: int = 0
    end_offset: int = 0
    token_count: int = 0
    content_hash: str = ""
    custom_metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "chunk_id": self.chunk_id,
            "document_id": self.document_id,
            "chunk_index": self.chunk_index,
            "page_number": self.page_number,
            "section": self.section,
            "start_offset": self.start_offset,
            "end_offset": self.end_offset,
            "token_count": self.token_count,
            "content_hash": self.content_hash,
            "custom_metadata": self.custom_metadata,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "ChunkMetadata":
        return cls(
            chunk_id=data["chunk_id"],
            document_id=data["document_id"],
            chunk_index=int(data.get("chunk_index", 0)),
            page_number=data.get("page_number"),
            section=data.get("section"),
            start_offset=int(data.get("start_offset", 0)),
            end_offset=int(data.get("end_offset", 0)),
            token_count=int(data.get("token_count", 0)),
            content_hash=data.get("content_hash", ""),
            custom_metadata=data.get("custom_metadata", {}),
        )
