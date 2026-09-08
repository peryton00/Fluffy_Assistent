"""
Multimodal OCR Subsystem
Local-first, offline-capable optical character recognition providers and utilities.
"""

from brain.multimodal.ocr.interface import OCRProvider
from brain.multimodal.ocr.preprocessing import ImagePreprocessorPipeline
from brain.multimodal.ocr.local import LocalOCRProvider, DeterministicTestOCRProvider
from brain.multimodal.ocr.provider import OCRProviderRegistry, get_ocr_registry

__all__ = [
    "OCRProvider",
    "ImagePreprocessorPipeline",
    "LocalOCRProvider",
    "DeterministicTestOCRProvider",
    "OCRProviderRegistry",
    "get_ocr_registry",
]
