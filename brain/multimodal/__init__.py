"""
Fluffy Multimodal Subsystem
Local-first, offline-capable OCR, vision, and multimodal document ingestion for Knowledge & RAG.
"""

from brain.multimodal.definitions import (
    MultimodalMediaType,
    ExtractionMethod,
    ExtractionQuality,
    RegionType,
    MultimodalHealthStatus,
)
from brain.multimodal.models import (
    BoundingBox,
    TextRegion,
    ImageRegion,
    TableRegion,
    DrawingRegion,
    ExtractionMetadata,
    MultimodalPage,
    MultimodalDocument,
    OCRRequest,
    OCRResult,
    VisionRequest,
    VisionResult,
)
from brain.multimodal.config import MultimodalConfig
from brain.multimodal.health import MultimodalHealth
from brain.multimodal.interface import OCRProvider, VisionProvider, ImagePreprocessor
from brain.multimodal.runtime import MultimodalRuntime, get_multimodal_runtime

__all__ = [
    "MultimodalMediaType",
    "ExtractionMethod",
    "ExtractionQuality",
    "RegionType",
    "MultimodalHealthStatus",
    "BoundingBox",
    "TextRegion",
    "ImageRegion",
    "TableRegion",
    "DrawingRegion",
    "ExtractionMetadata",
    "MultimodalPage",
    "MultimodalDocument",
    "OCRRequest",
    "OCRResult",
    "VisionRequest",
    "VisionResult",
    "MultimodalConfig",
    "MultimodalHealth",
    "OCRProvider",
    "VisionProvider",
    "ImagePreprocessor",
    "MultimodalRuntime",
    "get_multimodal_runtime",
]
