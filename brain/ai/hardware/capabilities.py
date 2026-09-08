"""
Hardware capabilities data structures for Fluffy AI Runtime.
Provides platform-independent, capability-oriented descriptors.
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import List, Optional, Dict, Any


class AcceleratorType(str, Enum):
    """Supported hardware acceleration types."""
    CPU = "cpu"
    CUDA = "cuda"
    ROCM = "rocm"
    METAL = "metal"
    VULKAN = "vulkan"
    DIRECTML = "directml"
    NONE = "none"


@dataclass(frozen=True)
class OSInfo:
    """Operating system metadata."""
    system: str              # "windows", "linux", "darwin", etc.
    release: str             # OS release version
    version: str             # Kernel / build version
    architecture: str        # "x86_64", "arm64", "AMD64", etc.


@dataclass(frozen=True)
class CPUInfo:
    """CPU capability details."""
    architecture: str
    physical_cores: int
    logical_cores: int
    features: List[str] = field(default_factory=list)  # AVX2, AVX512, NEON, etc.


@dataclass(frozen=True)
class MemoryInfo:
    """System memory (RAM) in bytes and gigabytes."""
    total_bytes: int
    available_bytes: int

    @property
    def total_gb(self) -> float:
        return round(self.total_bytes / (1024 ** 3), 2)

    @property
    def available_gb(self) -> float:
        return round(self.available_bytes / (1024 ** 3), 2)


@dataclass(frozen=True)
class GPUInfo:
    """GPU / accelerator device details."""
    index: int
    name: str
    vendor: str                         # "nvidia", "amd", "apple", "intel", etc.
    total_memory_bytes: int
    free_memory_bytes: int
    accelerator_type: AcceleratorType
    compute_capability: Optional[str] = None

    @property
    def total_vram_gb(self) -> float:
        return round(self.total_memory_bytes / (1024 ** 3), 2)

    @property
    def free_vram_gb(self) -> float:
        return round(self.free_memory_bytes / (1024 ** 3), 2)


@dataclass(frozen=True)
class HardwareCapabilities:
    """
    Consolidated hardware profile.
    Capability-based representation without platform-specific assumptions.
    """
    os: OSInfo
    cpu: CPUInfo
    memory: MemoryInfo
    gpus: List[GPUInfo] = field(default_factory=list)
    primary_accelerator: AcceleratorType = AcceleratorType.CPU

    @property
    def has_gpu(self) -> bool:
        return len(self.gpus) > 0 and self.primary_accelerator != AcceleratorType.CPU

    @property
    def total_vram_gb(self) -> float:
        return sum(gpu.total_vram_gb for gpu in self.gpus)

    def to_dict(self) -> Dict[str, Any]:
        """Convert capabilities to a clean serializable dictionary."""
        return {
            "os": {
                "system": self.os.system,
                "release": self.os.release,
                "version": self.os.version,
                "architecture": self.os.architecture,
            },
            "cpu": {
                "architecture": self.cpu.architecture,
                "physical_cores": self.cpu.physical_cores,
                "logical_cores": self.cpu.logical_cores,
                "features": self.cpu.features,
            },
            "memory": {
                "total_gb": self.memory.total_gb,
                "available_gb": self.memory.available_gb,
            },
            "gpus": [
                {
                    "index": gpu.index,
                    "name": gpu.name,
                    "vendor": gpu.vendor,
                    "total_vram_gb": gpu.total_vram_gb,
                    "free_vram_gb": gpu.free_vram_gb,
                    "accelerator_type": gpu.accelerator_type.value,
                    "compute_capability": gpu.compute_capability,
                }
                for gpu in self.gpus
            ],
            "primary_accelerator": self.primary_accelerator.value,
            "has_gpu": self.has_gpu,
        }
