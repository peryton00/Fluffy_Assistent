"""
Multimodal Subsystem Configuration
Resource boundaries, timeout limits, and local provider configurations.
"""

from dataclasses import dataclass, field
from typing import Optional, List
from pathlib import Path


@dataclass
class MultimodalConfig:
    """Resource limits and local execution parameters for OCR and Vision."""
    max_image_dimension: int = 4096
    max_pages: int = 100
    max_file_size_bytes: int = 50 * 1024 * 1024  # 50 MB
    ocr_timeout_seconds: float = 30.0
    vision_timeout_seconds: float = 30.0
    max_concurrent_jobs: int = 2
    enable_preprocessing: bool = True
    tesseract_cmd: Optional[str] = None
    default_language: str = "eng"
    allowed_extensions: List[str] = field(default_factory=lambda: [
        ".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tiff", ".pdf"
    ])
