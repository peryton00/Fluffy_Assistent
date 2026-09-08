"""
Hardware capability and detection package for Fluffy AI.
"""

from brain.ai.hardware.capabilities import (
    AcceleratorType,
    OSInfo,
    CPUInfo,
    MemoryInfo,
    GPUInfo,
    HardwareCapabilities,
)
from brain.ai.hardware.detector import HardwareDetector, get_hardware_detector

__all__ = [
    "AcceleratorType",
    "OSInfo",
    "CPUInfo",
    "MemoryInfo",
    "GPUInfo",
    "HardwareCapabilities",
    "HardwareDetector",
    "get_hardware_detector",
]
