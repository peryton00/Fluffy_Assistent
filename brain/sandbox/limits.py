"""
Sandbox Resource Limits
Deterministic resource control specifications and boundary validation.
"""

from dataclasses import dataclass
from typing import Dict, Any


@dataclass
class SandboxLimits:
    """Resource limits enforced on sandbox executions."""
    timeout_seconds: float = 5.0
    max_timeout_seconds: float = 30.0
    max_stdout_bytes: int = 64 * 1024       # 64 KB
    max_stderr_bytes: int = 64 * 1024       # 64 KB
    max_output_bytes: int = 128 * 1024      # 128 KB
    max_processes: int = 1                  # Disallow child processes
    max_memory_mb: int = 256                # 256 MB
    max_workspace_bytes: int = 10 * 1024 * 1024  # 10 MB

    def get_effective_timeout(self, requested_timeout: float = None) -> float:
        """Resolve deterministic bounded timeout."""
        if requested_timeout is None or requested_timeout <= 0:
            return self.timeout_seconds
        return min(float(requested_timeout), self.max_timeout_seconds)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "timeout_seconds": self.timeout_seconds,
            "max_timeout_seconds": self.max_timeout_seconds,
            "max_stdout_bytes": self.max_stdout_bytes,
            "max_stderr_bytes": self.max_stderr_bytes,
            "max_output_bytes": self.max_output_bytes,
            "max_processes": self.max_processes,
            "max_memory_mb": self.max_memory_mb,
            "max_workspace_bytes": self.max_workspace_bytes,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "SandboxLimits":
        return cls(
            timeout_seconds=float(data.get("timeout_seconds", 5.0)),
            max_timeout_seconds=float(data.get("max_timeout_seconds", 30.0)),
            max_stdout_bytes=int(data.get("max_stdout_bytes", 64 * 1024)),
            max_stderr_bytes=int(data.get("max_stderr_bytes", 64 * 1024)),
            max_output_bytes=int(data.get("max_output_bytes", 128 * 1024)),
            max_processes=int(data.get("max_processes", 1)),
            max_memory_mb=int(data.get("max_memory_mb", 256)),
            max_workspace_bytes=int(data.get("max_workspace_bytes", 10 * 1024 * 1024)),
        )
