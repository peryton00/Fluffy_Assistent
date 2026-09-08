"""
Artifact Generator Interface
Protocol for local artifact format generators.
"""

from typing import Protocol, runtime_checkable, List
from pathlib import Path

from brain.artifacts.definitions import ArtifactType
from brain.artifacts.requests import ArtifactRequest


@runtime_checkable
class ArtifactGenerator(Protocol):
    """Protocol for local deliverable generators."""

    @property
    def name(self) -> str:
        """Generator identifier name."""
        ...

    @property
    def supported_types(self) -> List[ArtifactType]:
        """List of supported artifact format types."""
        ...

    @property
    def is_available(self) -> bool:
        """Whether required runtime dependencies for this generator are present."""
        ...

    def supports(self, artifact_type: ArtifactType) -> bool:
        """Check whether specific artifact type is supported."""
        ...

    def generate_to_path(self, request: ArtifactRequest, target_path: Path) -> None:
        """
        Generate deliverable file directly to target staging path.
        Raises exception if generation fails.
        """
        ...
