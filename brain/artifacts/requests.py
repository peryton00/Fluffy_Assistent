"""
Artifact Request Models
Encapsulates structured deliverable generation requests submitted by the Agent or Tool Runtime.
"""

from dataclasses import dataclass, field
from typing import Dict, Any, Optional, List, Union
from pathlib import Path

from brain.artifacts.definitions import (
    ArtifactType,
    OverwritePolicy,
)
from brain.artifacts.models import ArtifactMetadata
from brain.knowledge.definitions import DocumentClassification


@dataclass
class ArtifactRequest:
    """
    Structured deliverable creation request.
    Prevents arbitrary unvalidated filesystem writes.
    """
    artifact_type: ArtifactType
    name: str  # Desired filename or base name (e.g. 'quarterly_report.docx')
    destination_dir: Optional[str] = None  # None -> uses default workspace/artifacts dir
    content: Union[str, Dict[str, Any], List[Any]] = ""  # Raw text or structured sections/sheets/slides
    metadata: Optional[ArtifactMetadata] = None
    sources: List[str] = field(default_factory=list)  # Document IDs or citation strings
    overwrite_policy: OverwritePolicy = OverwritePolicy.VERSION
    classification: Optional[DocumentClassification] = None  # Inherited from sources if None
    language: Optional[str] = None  # For code artifacts (e.g. 'python', 'rust', 'javascript')
    custom_options: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "artifact_type": self.artifact_type.value,
            "name": self.name,
            "destination_dir": self.destination_dir,
            "content": self.content if isinstance(self.content, (str, dict, list)) else str(self.content),
            "metadata": self.metadata.to_dict() if self.metadata else None,
            "sources": self.sources,
            "overwrite_policy": self.overwrite_policy.value,
            "classification": self.classification.value if self.classification else None,
            "language": self.language,
            "custom_options": self.custom_options,
        }
