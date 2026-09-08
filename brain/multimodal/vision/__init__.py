"""
Multimodal Vision Subsystem
Local vision model analysis and diagram/drawing interpretation providers.
"""

from brain.multimodal.vision.interface import VisionProvider
from brain.multimodal.vision.local import LocalVisionProvider
from brain.multimodal.vision.provider import VisionProviderRegistry, get_vision_registry

__all__ = [
    "VisionProvider",
    "LocalVisionProvider",
    "VisionProviderRegistry",
    "get_vision_registry",
]
