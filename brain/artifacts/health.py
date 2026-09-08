"""
Artifact Subsystem Health and Diagnostics
Reports availability and dependency status across all local artifact format generators.
"""

from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional
import time

from brain.artifacts.definitions import ArtifactHealthStatus, ArtifactType


@dataclass
class ArtifactHealth:
    """Telemetry describing format generator readiness and local storage health."""
    status: ArtifactHealthStatus
    supported_formats: List[str] = field(default_factory=list)
    generator_availability: Dict[str, bool] = field(default_factory=dict)
    is_offline_compliant: bool = True
    total_artifacts_generated: int = 0
    last_error: Optional[str] = None
    last_checked: float = field(default_factory=time.time)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "status": self.status.value,
            "supported_formats": self.supported_formats,
            "generator_availability": self.generator_availability,
            "is_offline_compliant": self.is_offline_compliant,
            "total_artifacts_generated": self.total_artifacts_generated,
            "last_error": self.last_error,
            "last_checked": self.last_checked,
        }
