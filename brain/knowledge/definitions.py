"""
Knowledge Subsystem Definitions and Enumerations
Defines lifecycle statuses, supported MIME types, classification tiers, and health metrics for Local Knowledge / RAG.
"""

from enum import Enum


class DocumentStatus(str, Enum):
    """Document processing and lifecycle status."""
    DISCOVERED = "discovered"
    PARSING = "parsing"
    INDEXING = "indexing"
    READY = "ready"
    STALE = "stale"
    FAILED = "failed"
    DELETED = "deleted"
    OCR_REQUIRED = "ocr_required"
    OCR_PROCESSING = "ocr_processing"
    OCR_UNAVAILABLE = "ocr_unavailable"


class DocumentMimeType(str, Enum):
    """Supported document MIME types."""
    TEXT = "text/plain"
    MARKDOWN = "text/markdown"
    PDF = "application/pdf"
    DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    JSON = "application/json"
    CSV = "text/csv"
    CODE = "text/x-code"
    IMAGE_PNG = "image/png"
    IMAGE_JPEG = "image/jpeg"
    IMAGE_WEBP = "image/webp"
    IMAGE_BMP = "image/bmp"
    IMAGE_TIFF = "image/tiff"
    UNKNOWN = "application/octet-stream"


class DocumentClassification(str, Enum):
    """Document security and confidentiality classification levels."""
    PUBLIC = "public"
    INTERNAL = "internal"
    CONFIDENTIAL = "confidential"
    RESTRICTED = "restricted"


class KnowledgeHealthStatus(str, Enum):
    """Health status of the knowledge and retrieval subsystem."""
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    UNAVAILABLE = "unavailable"
    FAILED = "failed"
