"""
Artifact Result Models
Structured outcome returned after generation, structural validation, and atomic filesystem commitment.
"""

from dataclasses import dataclass, field
from typing import Optional, List, Dict, Any

from brain.artifacts.definitions import (
    ArtifactType,
    ArtifactStatus,
    ValidationStatus,
)
from brain.knowledge.definitions import DocumentClassification


@dataclass
class ArtifactResult:
    """
    Outcome of an artifact generation operation.
    Only reports success if generation, validation, and atomic commit all succeed.
    """
    success: bool
    artifact_id: str
    artifact_type: ArtifactType
    file_path: str = ""
    filename: str = ""
    size_bytes: int = 0
    content_hash: str = ""
    status: ArtifactStatus = ArtifactStatus.FAILED
    validation_status: ValidationStatus = ValidationStatus.FAILED
    classification: DocumentClassification = DocumentClassification.INTERNAL
    sources: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    error: Optional[str] = None
    duration_ms: float = 0.0
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "success": self.success,
            "artifact_id": self.artifact_id,
            "artifact_type": self.artifact_type.value,
            "file_path": self.file_path,
            "filename": self.filename,
            "size_bytes": self.size_bytes,
            "content_hash": self.content_hash,
            "status": self.status.value,
            "validation_status": self.validation_status.value,
            "classification": self.classification.value,
            "sources": self.sources,
            "warnings": self.warnings,
            "error": self.error,
            "duration_ms": self.duration_ms,
            "metadata": self.metadata,
        }
