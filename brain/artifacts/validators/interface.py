"""
Artifact Validator Interface
Protocol for structural validation of generated deliverables.
"""

from typing import Protocol, runtime_checkable
from pathlib import Path

from brain.artifacts.definitions import ArtifactType


@runtime_checkable
class ArtifactValidator(Protocol):
    """Protocol for post-generation deliverable validation."""

    def supports(self, artifact_type: ArtifactType) -> bool:
        """Check if validator supports the artifact type."""
        ...

    def validate(self, file_path: Path) -> bool:
        """Validate artifact integrity on disk. Returns True if valid."""
        ...
