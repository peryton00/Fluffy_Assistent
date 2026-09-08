"""
Multimodal Health and Diagnostics
Provides non-destructive health checks and diagnostic telemetry for local OCR and vision engines.
"""

from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional
import time

from brain.multimodal.definitions import MultimodalHealthStatus


@dataclass
class MultimodalHealth:
    """Diagnostic state of multimodal and OCR subsystems."""
    status: MultimodalHealthStatus
    ocr_available: bool = False
    ocr_provider_name: str = "none"
    vision_available: bool = False
    vision_provider_name: str = "none"
    supported_formats: List[str] = field(default_factory=list)
    is_offline_compliant: bool = True
    last_error: Optional[str] = None
    last_checked: float = field(default_factory=time.time)
    diagnostics: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "status": self.status.value,
            "ocr_available": self.ocr_available,
            "ocr_provider_name": self.ocr_provider_name,
            "vision_available": self.vision_available,
            "vision_provider_name": self.vision_provider_name,
            "supported_formats": self.supported_formats,
            "is_offline_compliant": self.is_offline_compliant,
            "last_error": self.last_error,
            "last_checked": self.last_checked,
            "diagnostics": self.diagnostics,
        }
