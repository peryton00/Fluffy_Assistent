"""
Multimodal Data Models
Typed representations for extracted multimodal information, layout structures, OCR results, and vision outputs.
"""

from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional
import time

from brain.multimodal.definitions import (
    MultimodalMediaType,
    ExtractionMethod,
    ExtractionQuality,
    RegionType,
)


@dataclass
class BoundingBox:
    """Normalized or pixel coordinates for layout bounding box."""
    x0: float
    y0: float
    x1: float
    y1: float
    is_normalized: bool = False

    def validate(self) -> bool:
        return self.x0 <= self.x1 and self.y0 <= self.y1

    def to_dict(self) -> Dict[str, Any]:
        return {
            "x0": self.x0,
            "y0": self.y0,
            "x1": self.x1,
            "y1": self.y1,
            "is_normalized": self.is_normalized,
        }


@dataclass
class TextRegion:
    """Extracted text fragment associated with spatial and confidence metadata."""
    text: str
    region_type: RegionType = RegionType.PARAGRAPH
    bounding_box: Optional[BoundingBox] = None
    confidence: float = 1.0
    language: Optional[str] = None
    page_number: int = 1

    def to_dict(self) -> Dict[str, Any]:
        return {
            "text": self.text,
            "region_type": self.region_type.value,
            "bounding_box": self.bounding_box.to_dict() if self.bounding_box else None,
            "confidence": self.confidence,
            "language": self.language,
            "page_number": self.page_number,
        }


@dataclass
class ImageRegion:
    """Embedded image region within a multimodal document."""
    region_id: str
    page_number: int = 1
    bounding_box: Optional[BoundingBox] = None
    description: Optional[str] = None
    format: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "region_id": self.region_id,
            "page_number": self.page_number,
            "bounding_box": self.bounding_box.to_dict() if self.bounding_box else None,
            "description": self.description,
            "format": self.format,
        }


@dataclass
class TableRegion:
    """Tabular layout structure."""
    rows: List[List[str]] = field(default_factory=list)
    headers: List[str] = field(default_factory=list)
    page_number: int = 1
    bounding_box: Optional[BoundingBox] = None
    confidence: float = 1.0

    def to_markdown(self) -> str:
        """Render extracted table structure as clean Markdown."""
        if not self.rows and not self.headers:
            return ""
        lines: List[str] = []
        if self.headers:
            lines.append("| " + " | ".join(self.headers) + " |")
            lines.append("| " + " | ".join(["---"] * len(self.headers)) + " |")
        for row in self.rows:
            lines.append("| " + " | ".join(row) + " |")
        return "\n".join(lines)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "headers": self.headers,
            "rows": self.rows,
            "page_number": self.page_number,
            "bounding_box": self.bounding_box.to_dict() if self.bounding_box else None,
            "confidence": self.confidence,
        }


@dataclass
class DrawingRegion:
    """Engineering drawing, blueprint, or schematic visual region."""
    drawing_id: str
    page_number: int = 1
    bounding_box: Optional[BoundingBox] = None
    labels: List[str] = field(default_factory=list)
    associated_text: Optional[str] = None
    extraction_method: ExtractionMethod = ExtractionMethod.TEXT_STREAM

    def to_dict(self) -> Dict[str, Any]:
        return {
            "drawing_id": self.drawing_id,
            "page_number": self.page_number,
            "bounding_box": self.bounding_box.to_dict() if self.bounding_box else None,
            "labels": self.labels,
            "associated_text": self.associated_text,
            "extraction_method": self.extraction_method.value,
        }


@dataclass
class ExtractionMetadata:
    """Metadata detailing the origin, latency, engine, and confidence of extraction."""
    method: ExtractionMethod
    quality: ExtractionQuality
    engine_name: str
    engine_version: Optional[str] = None
    processing_time_ms: float = 0.0
    average_confidence: float = 1.0
    warnings: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "method": self.method.value,
            "quality": self.quality.value,
            "engine_name": self.engine_name,
            "engine_version": self.engine_version,
            "processing_time_ms": self.processing_time_ms,
            "average_confidence": self.average_confidence,
            "warnings": self.warnings,
        }


@dataclass
class MultimodalPage:
    """Structured representation of an individual page within a multimodal document."""
    page_number: int
    raw_text: str = ""
    text_regions: List[TextRegion] = field(default_factory=list)
    image_regions: List[ImageRegion] = field(default_factory=list)
    table_regions: List[TableRegion] = field(default_factory=list)
    drawing_regions: List[DrawingRegion] = field(default_factory=list)
    width: Optional[int] = None
    height: Optional[int] = None
    extraction_metadata: Optional[ExtractionMetadata] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "page_number": self.page_number,
            "raw_text": self.raw_text,
            "text_regions": [r.to_dict() for r in self.text_regions],
            "image_regions": [r.to_dict() for r in self.image_regions],
            "table_regions": [r.to_dict() for r in self.table_regions],
            "drawing_regions": [r.to_dict() for r in self.drawing_regions],
            "width": self.width,
            "height": self.height,
            "extraction_metadata": self.extraction_metadata.to_dict() if self.extraction_metadata else None,
        }


@dataclass
class MultimodalDocument:
    """Canonical multimodal document structure holding parsed pages and metadata."""
    document_id: str
    source_path: str
    media_type: MultimodalMediaType
    pages: List[MultimodalPage] = field(default_factory=list)
    page_count: int = 1
    full_text: str = ""
    metadata: Optional[ExtractionMetadata] = None
    error: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "document_id": self.document_id,
            "source_path": self.source_path,
            "media_type": self.media_type.value,
            "page_count": self.page_count,
            "full_text": self.full_text,
            "pages": [p.to_dict() for p in self.pages],
            "metadata": self.metadata.to_dict() if self.metadata else None,
            "error": self.error,
        }


@dataclass
class OCRRequest:
    """Request payload for local OCR processing."""
    file_path: str
    page_numbers: Optional[List[int]] = None
    language: str = "eng"
    preserve_layout: bool = True
    detect_tables: bool = True
    detect_drawings: bool = True
    timeout_seconds: float = 30.0


@dataclass
class OCRResult:
    """Structured result returned by OCR providers."""
    success: bool
    document: Optional[MultimodalDocument] = None
    error: Optional[str] = None
    execution_time_ms: float = 0.0
    provider_name: str = "none"
    method: ExtractionMethod = ExtractionMethod.UNAVAILABLE
    quality: ExtractionQuality = ExtractionQuality.UNAVAILABLE


@dataclass
class VisionRequest:
    """Request payload for local vision analysis."""
    image_path: str
    prompt: Optional[str] = None
    task: str = "describe"
    timeout_seconds: float = 30.0


@dataclass
class VisionResult:
    """Structured result returned by local vision providers."""
    success: bool
    description: Optional[str] = None
    structured_findings: Dict[str, Any] = field(default_factory=dict)
    error: Optional[str] = None
    execution_time_ms: float = 0.0
    provider_name: str = "none"
