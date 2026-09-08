"""
Vision Provider Interface
Standard protocol for local vision analysis providers.
"""

from typing import Protocol, runtime_checkable
from brain.multimodal.models import VisionRequest, VisionResult
from brain.multimodal.definitions import MultimodalHealthStatus


@runtime_checkable
class VisionProvider(Protocol):
    """Protocol for local vision models."""

    @property
    def name(self) -> str:
        ...

    @property
    def is_available(self) -> bool:
        ...

    def supports(self, request: VisionRequest) -> bool:
        ...

    def analyze(self, request: VisionRequest) -> VisionResult:
        ...

    def check_health(self) -> MultimodalHealthStatus:
        ...
