"""
Hardware Detection & Platform Abstraction Tests
Validates capability detection and platform independence via mocked profiles.
"""

import os
import unittest
from unittest.mock import patch, MagicMock

from brain.ai.hardware.capabilities import (
    AcceleratorType,
    OSInfo,
    CPUInfo,
    MemoryInfo,
    GPUInfo,
    HardwareCapabilities,
)
from brain.ai.hardware.detector import HardwareDetector


class TestHardwareDetection(unittest.TestCase):
    """Test real and mocked hardware detection capabilities."""

    def tearDown(self):
        # Reset mock capabilities after each test
        HardwareDetector.set_mock_capabilities(None)

    def test_live_detection_on_current_host(self):
        """Verify detector runs without error on the host platform."""
        caps = HardwareDetector.detect(force_refresh=True)
        self.assertIsInstance(caps, HardwareCapabilities)
        self.assertIn(caps.os.system, ["windows", "linux", "macos", "unknown"])
        self.assertGreater(caps.cpu.logical_cores, 0)
        self.assertGreater(caps.memory.total_gb, 0.0)
        self.assertIsInstance(caps.primary_accelerator, AcceleratorType)

    def test_mock_windows_cuda_hardware(self):
        """Verify capability profile representation for Windows + CUDA."""
        mock_caps = HardwareCapabilities(
            os=OSInfo(system="windows", release="11", version="10.0.22631", architecture="x86_64"),
            cpu=CPUInfo(architecture="x86_64", physical_cores=8, logical_cores=16, features=["AVX2"]),
            memory=MemoryInfo(total_bytes=32 * (1024 ** 3), available_bytes=24 * (1024 ** 3)),
            gpus=[
                GPUInfo(
                    index=0,
                    name="NVIDIA GeForce RTX 4080",
                    vendor="nvidia",
                    total_memory_bytes=16 * (1024 ** 3),
                    free_memory_bytes=14 * (1024 ** 3),
                    accelerator_type=AcceleratorType.CUDA,
                    compute_capability="8.9",
                )
            ],
            primary_accelerator=AcceleratorType.CUDA,
        )
        HardwareDetector.set_mock_capabilities(mock_caps)

        caps = HardwareDetector.detect()
        self.assertEqual(caps.os.system, "windows")
        self.assertTrue(caps.has_gpu)
        self.assertEqual(caps.primary_accelerator, AcceleratorType.CUDA)
        self.assertEqual(caps.total_vram_gb, 16.0)

    def test_mock_linux_rocm_hardware(self):
        """Verify capability profile representation for Linux + ROCm."""
        mock_caps = HardwareCapabilities(
            os=OSInfo(system="linux", release="6.5.0", version="Ubuntu 22.04", architecture="x86_64"),
            cpu=CPUInfo(architecture="x86_64", physical_cores=16, logical_cores=32, features=["AVX512"]),
            memory=MemoryInfo(total_bytes=64 * (1024 ** 3), available_bytes=48 * (1024 ** 3)),
            gpus=[
                GPUInfo(
                    index=0,
                    name="AMD Radeon RX 7900 XTX",
                    vendor="amd",
                    total_memory_bytes=24 * (1024 ** 3),
                    free_memory_bytes=20 * (1024 ** 3),
                    accelerator_type=AcceleratorType.ROCM,
                )
            ],
            primary_accelerator=AcceleratorType.ROCM,
        )
        HardwareDetector.set_mock_capabilities(mock_caps)

        caps = HardwareDetector.detect()
        self.assertEqual(caps.os.system, "linux")
        self.assertEqual(caps.primary_accelerator, AcceleratorType.ROCM)
        self.assertEqual(caps.total_vram_gb, 24.0)

    def test_mock_macos_metal_hardware(self):
        """Verify capability profile representation for macOS + Apple Silicon Metal."""
        mock_caps = HardwareCapabilities(
            os=OSInfo(system="macos", release="14.4", version="Darwin 23.4.0", architecture="arm64"),
            cpu=CPUInfo(architecture="arm64", physical_cores=12, logical_cores=12, features=["NEON"]),
            memory=MemoryInfo(total_bytes=36 * (1024 ** 3), available_bytes=28 * (1024 ** 3)),
            gpus=[
                GPUInfo(
                    index=0,
                    name="Apple M3 Max GPU",
                    vendor="apple",
                    total_memory_bytes=36 * (1024 ** 3),
                    free_memory_bytes=28 * (1024 ** 3),
                    accelerator_type=AcceleratorType.METAL,
                )
            ],
            primary_accelerator=AcceleratorType.METAL,
        )
        HardwareDetector.set_mock_capabilities(mock_caps)

        caps = HardwareDetector.detect()
        self.assertEqual(caps.os.system, "macos")
        self.assertEqual(caps.primary_accelerator, AcceleratorType.METAL)
        self.assertEqual(caps.total_vram_gb, 36.0)

    def test_mock_cpu_only_system(self):
        """Verify capability profile representation for a CPU-only environment."""
        mock_caps = HardwareCapabilities(
            os=OSInfo(system="linux", release="5.15", version="Debian", architecture="x86_64"),
            cpu=CPUInfo(architecture="x86_64", physical_cores=4, logical_cores=8),
            memory=MemoryInfo(total_bytes=16 * (1024 ** 3), available_bytes=12 * (1024 ** 3)),
            gpus=[],
            primary_accelerator=AcceleratorType.CPU,
        )
        HardwareDetector.set_mock_capabilities(mock_caps)

        caps = HardwareDetector.detect()
        self.assertFalse(caps.has_gpu)
        self.assertEqual(caps.primary_accelerator, AcceleratorType.CPU)
        self.assertEqual(caps.total_vram_gb, 0.0)


if __name__ == "__main__":
    unittest.main()
