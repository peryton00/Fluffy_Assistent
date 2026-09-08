"""
Hardware Detector Module
Provides platform-independent, capability-based hardware detection.
Inspects CPU, RAM, and available accelerators without crashing or coupling to a specific OS.
"""

import os
import platform
import subprocess
import shutil
from typing import Optional, List

try:
    import psutil
except ImportError:
    psutil = None

from brain.ai.hardware.capabilities import (
    AcceleratorType,
    OSInfo,
    CPUInfo,
    MemoryInfo,
    GPUInfo,
    HardwareCapabilities,
)


class HardwareDetector:
    """
    Detects system hardware and hardware capabilities.
    Thread-safe, platform-independent, and non-intrusive.
    """

    _cached_capabilities: Optional[HardwareCapabilities] = None

    @classmethod
    def detect(cls, force_refresh: bool = False) -> HardwareCapabilities:
        """
        Detect system hardware capabilities.
        Uses cached profile unless force_refresh is True.
        """
        if cls._cached_capabilities is not None and not force_refresh:
            return cls._cached_capabilities

        os_info = cls._detect_os()
        cpu_info = cls._detect_cpu()
        mem_info = cls._detect_memory()
        gpus = cls._detect_gpus(os_info)

        primary_accel = AcceleratorType.CPU
        if gpus:
            # First GPU's accelerator type is selected as primary
            primary_accel = gpus[0].accelerator_type

        capabilities = HardwareCapabilities(
            os=os_info,
            cpu=cpu_info,
            memory=mem_info,
            gpus=gpus,
            primary_accelerator=primary_accel,
        )

        cls._cached_capabilities = capabilities
        return capabilities

    @classmethod
    def set_mock_capabilities(cls, capabilities: Optional[HardwareCapabilities]) -> None:
        """Override detected capabilities for deterministic testing."""
        cls._cached_capabilities = capabilities

    @classmethod
    def _detect_os(cls) -> OSInfo:
        """Detect operating system information."""
        sys_name = platform.system().lower()
        if sys_name == "darwin":
            canonical_sys = "macos"
        elif sys_name == "windows":
            canonical_sys = "windows"
        elif sys_name == "linux":
            canonical_sys = "linux"
        else:
            canonical_sys = sys_name

        return OSInfo(
            system=canonical_sys,
            release=platform.release(),
            version=platform.version(),
            architecture=platform.machine() or "unknown",
        )

    @classmethod
    def _detect_cpu(cls) -> CPUInfo:
        """Detect CPU core count and features."""
        physical_cores = 1
        logical_cores = 1

        if psutil:
            physical_cores = psutil.cpu_count(logical=False) or 1
            logical_cores = psutil.cpu_count(logical=True) or physical_cores
        else:
            logical_cores = os.cpu_count() or 1
            physical_cores = max(1, logical_cores // 2)

        return CPUInfo(
            architecture=platform.machine() or "x86_64",
            physical_cores=physical_cores,
            logical_cores=logical_cores,
            features=[],
        )

    @classmethod
    def _detect_memory(cls) -> MemoryInfo:
        """Detect total and available RAM in bytes."""
        if psutil:
            vmem = psutil.virtual_memory()
            return MemoryInfo(
                total_bytes=vmem.total,
                available_bytes=vmem.available,
            )
        # Fallback if psutil is unavailable
        # ponytail: fallback assumption of 8GB if psutil is missing
        default_bytes = 8 * (1024 ** 3)
        return MemoryInfo(total_bytes=default_bytes, available_bytes=default_bytes // 2)

    @classmethod
    def _detect_gpus(cls, os_info: OSInfo) -> List[GPUInfo]:
        """
        Detect GPUs / accelerators without crashing on unsupported hardware.
        """
        gpus: List[GPUInfo] = []

        # 1. Try Apple Silicon Metal detection on macOS
        if os_info.system == "macos" and os_info.architecture in ("arm64", "aarch64"):
            # Unified memory on Apple Silicon
            mem = cls._detect_memory()
            gpus.append(
                GPUInfo(
                    index=0,
                    name="Apple Silicon Unified GPU",
                    vendor="apple",
                    total_memory_bytes=mem.total_bytes,
                    free_memory_bytes=mem.available_bytes,
                    accelerator_type=AcceleratorType.METAL,
                )
            )
            return gpus

        # 2. Try NVIDIA detection via nvidia-smi command if available
        if shutil.which("nvidia-smi"):
            try:
                cmd = [
                    "nvidia-smi",
                    "--query-gpu=index,name,memory.total,memory.free",
                    "--format=csv,noheader,nounits",
                ]
                output = subprocess.check_output(
                    cmd,
                    stderr=subprocess.DEVNULL,
                    timeout=2,
                    text=True,
                )
                for line in output.strip().splitlines():
                    parts = [p.strip() for p in line.split(",")]
                    if len(parts) >= 4:
                        idx = int(parts[0])
                        name = parts[1]
                        total_mb = int(parts[2])
                        free_mb = int(parts[3])
                        gpus.append(
                            GPUInfo(
                                index=idx,
                                name=name,
                                vendor="nvidia",
                                total_memory_bytes=total_mb * 1024 * 1024,
                                free_memory_bytes=free_mb * 1024 * 1024,
                                accelerator_type=AcceleratorType.CUDA,
                            )
                        )
                if gpus:
                    return gpus
            except Exception:
                # nvidia-smi failed or returned unexpected output; proceed to fallback
                pass

        # 3. Try ROCm detection on Linux if rocm-smi is present
        if os_info.system == "linux" and shutil.which("rocm-smi"):
            try:
                gpus.append(
                    GPUInfo(
                        index=0,
                        name="AMD ROCm Device",
                        vendor="amd",
                        total_memory_bytes=0,
                        free_memory_bytes=0,
                        accelerator_type=AcceleratorType.ROCM,
                    )
                )
                return gpus
            except Exception:
                pass

        return gpus


# Global singleton instance
_hardware_detector: Optional[HardwareDetector] = None


def get_hardware_detector() -> HardwareDetector:
    """Get or create the global HardwareDetector instance."""
    global _hardware_detector
    if _hardware_detector is None:
        _hardware_detector = HardwareDetector()
    return _hardware_detector

