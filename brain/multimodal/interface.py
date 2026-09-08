"""
Multimodal Subsystem Interfaces and Protocols
Standard contracts for OCR providers, Vision providers, Preprocessors, and Multimodal parsers.
"""

from typing import Protocol, runtime_checkable, Union, Optional
from pathlib import Path
from PIL import Image

from brain.multimodal.models import (
    OCRRequest,
    OCRResult,
    VisionRequest,
    VisionResult,
    MultimodalDocument,
)
from brain.multimodal.definitions import MultimodalHealthStatus


@runtime_checkable
class OCRProvider(Protocol):
    """Protocol for local OCR engines."""

    @property
    def name(self) -> str:
        """Provider identification name."""
        ...

    @property
    def is_available(self) -> bool:
        """Check whether local runtime dependencies for this provider are present."""
        ...

    def supports(self, request: OCRRequest) -> bool:
        """Check if request format and options are supported."""
        ...

    def extract(self, request: OCRRequest) -> OCRResult:
        """Execute local OCR extraction."""
        ...

    def check_health(self) -> MultimodalHealthStatus:
        """Report provider health status."""
        ...


@runtime_checkable
class VisionProvider(Protocol):
    """Protocol for local vision models and image analysis engines."""

    @property
    def name(self) -> str:
        """Provider identification name."""
        ...

    @property
    def is_available(self) -> bool:
        """Check whether local runtime dependencies for this provider are present."""
        ...

    def supports(self, request: VisionRequest) -> bool:
        """Check if request is supported."""
        ...

    def analyze(self, request: VisionRequest) -> VisionResult:
        """Execute local vision analysis."""
        ...

    def check_health(self) -> MultimodalHealthStatus:
        """Report provider health status."""
        ...


@runtime_checkable
class ImagePreprocessor(Protocol):
    """Protocol for image preparation, orientation, and contrast correction."""

    def preprocess_image(self, image: Image.Image) -> Image.Image:
        """Process image for improved OCR accuracy."""
        ...
