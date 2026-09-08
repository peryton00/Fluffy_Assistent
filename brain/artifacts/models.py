"""
Artifact Data Models
Typed structures for structured document sections, slides, spreadsheets, tables, and manifest auditing.
"""

from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional
import time

from brain.artifacts.definitions import (
    ArtifactType,
    ArtifactStatus,
    ValidationStatus,
)
from brain.knowledge.definitions import DocumentClassification


@dataclass
class TableData:
    """Tabular dataset with headers and rows."""
    headers: List[str] = field(default_factory=list)
    rows: List[List[Any]] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {"headers": self.headers, "rows": self.rows}


@dataclass
class DocumentSectionData:
    """A structured section for Word (DOCX) or Markdown documents."""
    heading: str
    level: int = 1
    text: str = ""
    bullet_points: List[str] = field(default_factory=list)
    table: Optional[TableData] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "heading": self.heading,
            "level": self.level,
            "text": self.text,
            "bullet_points": self.bullet_points,
            "table": self.table.to_dict() if self.table else None,
        }


@dataclass
class SlideData:
    """A structured presentation slide for PowerPoint (PPTX)."""
    title: str
    content: str = ""
    bullet_points: List[str] = field(default_factory=list)
    table: Optional[TableData] = None
    notes: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "title": self.title,
            "content": self.content,
            "bullet_points": self.bullet_points,
            "table": self.table.to_dict() if self.table else None,
            "notes": self.notes,
        }


@dataclass
class SpreadsheetSheetData:
    """A structured sheet within an Excel workbook (XLSX)."""
    sheet_name: str = "Sheet1"
    headers: List[str] = field(default_factory=list)
    rows: List[List[Any]] = field(default_factory=list)
    formulas: Dict[str, str] = field(default_factory=dict)  # cell_ref (e.g. 'C10') -> formula (e.g. '=SUM(C2:C9)')

    def to_dict(self) -> Dict[str, Any]:
        return {
            "sheet_name": self.sheet_name,
            "headers": self.headers,
            "rows": self.rows,
            "formulas": self.formulas,
        }


@dataclass
class ArtifactMetadata:
    """Metadata describing artifact generation parameters and provenance."""
    title: Optional[str] = None
    author: str = "Fluffy Assistant"
    subject: Optional[str] = None
    description: Optional[str] = None
    created_at: float = field(default_factory=time.time)
    generator_name: str = "unknown"
    classification: DocumentClassification = DocumentClassification.INTERNAL
    source_documents: List[str] = field(default_factory=list)
    source_chunk_ids: List[str] = field(default_factory=list)
    custom_properties: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "title": self.title,
            "author": self.author,
            "subject": self.subject,
            "description": self.description,
            "created_at": self.created_at,
            "generator_name": self.generator_name,
            "classification": self.classification.value,
            "source_documents": self.source_documents,
            "source_chunk_ids": self.source_chunk_ids,
            "custom_properties": self.custom_properties,
        }


@dataclass
class ArtifactManifestRecord:
    """Persistent audit trail entry for generated deliverables."""
    artifact_id: str
    artifact_type: ArtifactType
    file_path: str
    filename: str
    size_bytes: int
    content_hash: str
    created_at: float
    status: ArtifactStatus
    validation_status: ValidationStatus
    classification: DocumentClassification
    generator_name: str
    source_documents: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "artifact_id": self.artifact_id,
            "artifact_type": self.artifact_type.value,
            "file_path": self.file_path,
            "filename": self.filename,
            "size_bytes": self.size_bytes,
            "content_hash": self.content_hash,
            "created_at": self.created_at,
            "status": self.status.value,
            "validation_status": self.validation_status.value,
            "classification": self.classification.value,
            "generator_name": self.generator_name,
            "source_documents": self.source_documents,
            "metadata": self.metadata,
        }
