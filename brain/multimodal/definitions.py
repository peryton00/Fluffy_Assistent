"""
Multimodal Subsystem Definitions and Enumerations
Defines media types, extraction methods, quality tiers, and health metrics for local Multimodal & OCR processing.
"""

from enum import Enum


class MultimodalMediaType(str, Enum):
    """Supported multimodal input media formats."""
    IMAGE_PNG = "image/png"
    IMAGE_JPEG = "image/jpeg"
    IMAGE_WEBP = "image/webp"
    IMAGE_BMP = "image/bmp"
    IMAGE_TIFF = "image/tiff"
    PDF_SCANNED = "application/pdf+scanned"
    UNKNOWN = "application/octet-stream"


class ExtractionMethod(str, Enum):
    """Method used to extract multimodal content."""
    TEXT_STREAM = "text_stream"
    TESSERACT_OCR = "tesseract_ocr"
    WINDOWS_MEDIA_OCR = "windows_media_ocr"
    LOCAL_OCR_CUSTOM = "local_ocr_custom"
    LOCAL_VISION_MODEL = "local_vision_model"
    TEST_SYNTHETIC = "test_synthetic"
    UNAVAILABLE = "unavailable"


class ExtractionQuality(str, Enum):
    """Subjective and statistical extraction confidence levels."""
    HIGH_CONFIDENCE = "high_confidence"
    MEDIUM_CONFIDENCE = "medium_confidence"
    LOW_CONFIDENCE = "low_confidence"
    FAILED = "failed"
    UNAVAILABLE = "unavailable"


class RegionType(str, Enum):
    """Structural layout region classification."""
    PARAGRAPH = "paragraph"
    HEADING = "heading"
    TABLE = "table"
    DRAWING = "drawing"
    CAPTION = "caption"
    HANDWRITING = "handwriting"
    METADATA_HEADER = "metadata_header"
    UNKNOWN = "unknown"


class MultimodalHealthStatus(str, Enum):
    """Health and readiness states for multimodal processing engines."""
    AVAILABLE = "available"
    DEGRADED = "degraded"
    UNAVAILABLE = "unavailable"
    FAILED = "failed"
