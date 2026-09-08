"""
OCR Provider Interface
Standard protocol for local OCR providers.
"""

from typing import Protocol, runtime_checkable
from brain.multimodal.models import OCRRequest, OCRResult
from brain.multimodal.definitions import MultimodalHealthStatus


@runtime_checkable
class OCRProvider(Protocol):
    """Protocol defining local OCR engine operations."""

    @property
    def name(self) -> str:
        ...

    @property
    def is_available(self) -> bool:
        ...

    def supports(self, request: OCRRequest) -> bool:
        ...

    def extract(self, request: OCRRequest) -> OCRResult:
        ...

    def check_health(self) -> MultimodalHealthStatus:
        ...
