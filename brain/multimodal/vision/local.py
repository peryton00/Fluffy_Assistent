"""
Local Vision Provider
Provides local visual understanding using on-device vision-language models when available.
Strictly offline: reports UNAVAILABLE when no local vision model is present.
"""

import time
from pathlib import Path
from typing import Optional, Dict, Any

from brain.multimodal.definitions import MultimodalHealthStatus
from brain.multimodal.models import VisionRequest, VisionResult
from brain.multimodal.vision.interface import VisionProvider


class LocalVisionProvider(VisionProvider):
    """
    Local Vision Provider interfacing with on-premise vision models.
    Reports UNAVAILABLE if no local multimodal model is loaded.
    """

    def __init__(self, ai_runtime: Optional[Any] = None):
        self._ai_runtime = ai_runtime

    @property
    def name(self) -> str:
        return "local_vision_vlm"

    @property
    def is_available(self) -> bool:
        # Check if local AI runtime has a vision-capable model loaded
        if self._ai_runtime and hasattr(self._ai_runtime, "has_capability"):
            try:
                return self._ai_runtime.has_capability("vision")
            except Exception:
                return False
        return False

    def check_health(self) -> MultimodalHealthStatus:
        if self.is_available:
            return MultimodalHealthStatus.AVAILABLE
        return MultimodalHealthStatus.UNAVAILABLE

    def supports(self, request: VisionRequest) -> bool:
        ext = Path(request.image_path).suffix.lower()
        return ext in [".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tiff"]

    def analyze(self, request: VisionRequest) -> VisionResult:
        start_time = time.time()
        if not self.is_available:
            return VisionResult(
                success=False,
                error="Local vision model is unavailable (no local multimodal vision model loaded in AI Runtime)",
                execution_time_ms=(time.time() - start_time) * 1000,
                provider_name=self.name,
            )

        target_path = Path(request.image_path)
        if not target_path.exists():
            return VisionResult(
                success=False,
                error=f"Image not found: {request.image_path}",
                execution_time_ms=(time.time() - start_time) * 1000,
                provider_name=self.name,
            )

        # If a real local runtime is connected and available, execute inference here
        try:
            # Placeholder hook for local AI runtime multimodal inference
            return VisionResult(
                success=False,
                error="Local vision inference backend not configured",
                execution_time_ms=(time.time() - start_time) * 1000,
                provider_name=self.name,
            )
        except Exception as e:
            return VisionResult(
                success=False,
                error=f"Vision inference error: {str(e)}",
                execution_time_ms=(time.time() - start_time) * 1000,
                provider_name=self.name,
            )
