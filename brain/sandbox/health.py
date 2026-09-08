"""
Sandbox Backend Health Tracking
Monitors isolation backend readiness, execution metrics, and security violation counts.
"""

from dataclasses import dataclass, field
from typing import Dict, Any, List, Optional
import time

from brain.sandbox.definitions import SandboxHealthStatus


@dataclass
class SandboxHealth:
    """Health status and performance telemetry for sandbox backend."""
    status: SandboxHealthStatus = SandboxHealthStatus.AVAILABLE
    available_languages: List[str] = field(default_factory=lambda: ["python"])
    latency_ms: float = 0.0
    total_executions: int = 0
    failed_executions: int = 0
    security_violations: int = 0
    last_error: Optional[str] = None
    last_checked: float = field(default_factory=time.time)

    @property
    def is_available(self) -> bool:
        return self.status in (SandboxHealthStatus.AVAILABLE, SandboxHealthStatus.DEGRADED)

    def record_execution(self, success: bool, latency_ms: float, error: Optional[str] = None, is_security_violation: bool = False) -> None:
        """Update metrics following an execution."""
        self.total_executions += 1
        self.latency_ms = latency_ms
        self.last_checked = time.time()
        if not success:
            self.failed_executions += 1
            if error:
                self.last_error = error
        if is_security_violation:
            self.security_violations += 1

    def to_dict(self) -> Dict[str, Any]:
        return {
            "status": self.status.value,
            "available_languages": self.available_languages,
            "latency_ms": self.latency_ms,
            "total_executions": self.total_executions,
            "failed_executions": self.failed_executions,
            "security_violations": self.security_violations,
            "last_error": self.last_error,
            "last_checked": self.last_checked,
        }
