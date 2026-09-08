"""
Knowledge Ingestion Manager
Orchestrates file discovery, path validation, hashing, parser dispatch, and metadata synthesis.
"""

import os
import uuid
import time
from pathlib import Path
from typing import Union, Optional, Dict, Any, List

from brain.knowledge.definitions import DocumentStatus, DocumentMimeType, DocumentClassification
from brain.knowledge.metadata import DocumentMetadata
from brain.knowledge.documents import KnowledgeDocument, ParsedDocument
from brain.knowledge.ingestion.hashing import compute_content_hash
from brain.knowledge.ingestion.discovery import DocumentDiscovery
from brain.knowledge.ingestion.parsers.factory import ParserFactory, get_parser_factory


class IngestionManager:
    """
    Manages the ingestion pipeline for local knowledge documents.
    """

    def __init__(self, parser_factory: Optional[ParserFactory] = None):
        self.parser_factory = parser_factory or get_parser_factory()

    def ingest_file(
        self,
        file_path: Union[str, Path],
        classification: DocumentClassification = DocumentClassification.INTERNAL,
        owner: Optional[str] = None,
        allowed_identities: Optional[List[str]] = None,
        custom_metadata: Optional[Dict[str, Any]] = None,
    ) -> KnowledgeDocument:
        """
        Ingest and parse a local document, creating a KnowledgeDocument entity.
        """
        path = Path(file_path).resolve()
        path_str = str(path)

        # 1. Path Safety & Existence Check
        if not path.exists() or not path.is_file():
            doc_id = f"doc_{uuid.uuid4().hex[:12]}"
            meta = DocumentMetadata(
                document_id=doc_id,
                source_path=path_str,
                display_name=path.name or "unknown",
                status=DocumentStatus.FAILED,
                error_message=f"File does not exist: {path_str}",
                classification=classification,
                owner=owner,
            )
            return KnowledgeDocument(metadata=meta)

        if not DocumentDiscovery.is_safe_path(path_str):
            doc_id = f"doc_{uuid.uuid4().hex[:12]}"
            meta = DocumentMetadata(
                document_id=doc_id,
                source_path=path_str,
                display_name=path.name,
                status=DocumentStatus.FAILED,
                error_message=f"Access denied: Path failed security validation: {path_str}",
                classification=classification,
                owner=owner,
            )
            return KnowledgeDocument(metadata=meta)

        # 2. File stats and content hashing
        try:
            stat = path.stat()
            size_bytes = stat.st_size
            modified_at = stat.st_mtime
            created_at = stat.st_ctime
            content_hash = compute_content_hash(path)
        except Exception as e:
            doc_id = f"doc_{uuid.uuid4().hex[:12]}"
            meta = DocumentMetadata(
                document_id=doc_id,
                source_path=path_str,
                display_name=path.name,
                status=DocumentStatus.FAILED,
                error_message=f"Failed reading file stats/hash: {str(e)}",
                classification=classification,
                owner=owner,
            )
            return KnowledgeDocument(metadata=meta)

        # Deterministic document ID based on hash
        doc_id = f"doc_{content_hash[:16]}"

        # 3. Resolve Parser
        parser = self.parser_factory.get_parser_for_file(path)
        if not parser:
            meta = DocumentMetadata(
                document_id=doc_id,
                source_path=path_str,
                display_name=path.name,
                size_bytes=size_bytes,
                content_hash=content_hash,
                created_at=created_at,
                modified_at=modified_at,
                indexed_at=time.time(),
                parser_name="none",
                status=DocumentStatus.FAILED,
                error_message=f"No supported parser found for file extension '{path.suffix}'",
                classification=classification,
                owner=owner,
            )
            return KnowledgeDocument(metadata=meta)

        # 4. Execute Parser
        try:
            parsed_doc = parser.parse(path)
        except Exception as e:
            meta = DocumentMetadata(
                document_id=doc_id,
                source_path=path_str,
                display_name=path.name,
                size_bytes=size_bytes,
                content_hash=content_hash,
                created_at=created_at,
                modified_at=modified_at,
                indexed_at=time.time(),
                parser_name=parser.name,
                status=DocumentStatus.FAILED,
                error_message=f"Parser exception: {str(e)}",
                classification=classification,
                owner=owner,
            )
            return KnowledgeDocument(metadata=meta)

        # 5. Check OCR_REQUIRED or Parsing Error
        if parsed_doc.ocr_required:
            status = DocumentStatus.OCR_REQUIRED
            err_msg = "Document contains no extractable text layer (scanned image or raster PDF; OCR required)"
        elif parsed_doc.error:
            status = DocumentStatus.FAILED
            err_msg = parsed_doc.error
        else:
            status = DocumentStatus.PARSING
            err_msg = None

        mime_type = DocumentMimeType.TEXT
        ext = path.suffix.lower()
        if ext in [".md", ".markdown"]:
            mime_type = DocumentMimeType.MARKDOWN
        elif ext == ".pdf":
            mime_type = DocumentMimeType.PDF
        elif ext == ".docx":
            mime_type = DocumentMimeType.DOCX
        elif ext == ".json":
            mime_type = DocumentMimeType.JSON
        elif ext == ".csv":
            mime_type = DocumentMimeType.CSV
        elif ext == ".png":
            mime_type = DocumentMimeType.IMAGE_PNG
        elif ext in [".jpg", ".jpeg"]:
            mime_type = DocumentMimeType.IMAGE_JPEG
        elif ext == ".webp":
            mime_type = DocumentMimeType.IMAGE_WEBP
        elif ext == ".bmp":
            mime_type = DocumentMimeType.IMAGE_BMP
        elif ext == ".tiff":
            mime_type = DocumentMimeType.IMAGE_TIFF

        meta = DocumentMetadata(
            document_id=doc_id,
            source_path=path_str,
            display_name=path.name,
            mime_type=mime_type,
            size_bytes=size_bytes,
            content_hash=content_hash,
            created_at=created_at,
            modified_at=modified_at,
            indexed_at=time.time(),
            parser_name=parser.name,
            version=1,
            status=status,
            classification=classification,
            owner=owner,
            allowed_identities=allowed_identities or [],
            page_count=parsed_doc.page_count,
            error_message=err_msg,
            custom_metadata=custom_metadata or {},
        )

        doc = KnowledgeDocument(metadata=meta)
        # Attach parsed_doc for downstream chunking
        doc._parsed_content = parsed_doc
        return doc
