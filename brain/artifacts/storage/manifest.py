"""
Artifact Audit Manifest Manager
Maintains a local SQLite audit log of all generated artifacts, content hashes, and source provenance.
"""

import sqlite3
import json
import threading
from pathlib import Path
from typing import List, Optional, Dict, Any

from brain.artifacts.definitions import ArtifactType, ArtifactStatus, ValidationStatus
from brain.artifacts.models import ArtifactManifestRecord
from brain.knowledge.definitions import DocumentClassification


class ArtifactManifestManager:
    """
    SQLite-backed audit log for all generated artifacts.
    """

    def __init__(self, db_path: Path):
        self._db_path = db_path
        self._lock = threading.Lock()
        self._init_db()

    def _get_connection(self) -> sqlite3.Connection:
        self._db_path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(str(self._db_path), check_same_thread=False)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self) -> None:
        with self._lock:
            conn = self._get_connection()
            try:
                with conn:
                    conn.execute("""
                        CREATE TABLE IF NOT EXISTS artifact_manifest (
                            artifact_id TEXT PRIMARY KEY,
                            artifact_type TEXT NOT NULL,
                            file_path TEXT NOT NULL,
                            filename TEXT NOT NULL,
                            size_bytes INTEGER NOT NULL,
                            content_hash TEXT NOT NULL,
                            created_at REAL NOT NULL,
                            status TEXT NOT NULL,
                            validation_status TEXT NOT NULL,
                            classification TEXT NOT NULL,
                            generator_name TEXT NOT NULL,
                            source_documents TEXT NOT NULL,
                            metadata_json TEXT NOT NULL
                        )
                    """)
                    conn.execute("CREATE INDEX IF NOT EXISTS idx_art_created ON artifact_manifest(created_at DESC)")
                    conn.execute("CREATE INDEX IF NOT EXISTS idx_art_type ON artifact_manifest(artifact_type)")
            finally:
                conn.close()

    def record_artifact(self, record: ArtifactManifestRecord) -> None:
        """Insert or update artifact manifest record."""
        with self._lock:
            conn = self._get_connection()
            try:
                with conn:
                    conn.execute("""
                        INSERT OR REPLACE INTO artifact_manifest (
                            artifact_id, artifact_type, file_path, filename, size_bytes,
                            content_hash, created_at, status, validation_status,
                            classification, generator_name, source_documents, metadata_json
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        record.artifact_id,
                        record.artifact_type.value,
                        record.file_path,
                        record.filename,
                        record.size_bytes,
                        record.content_hash,
                        record.created_at,
                        record.status.value,
                        record.validation_status.value,
                        record.classification.value,
                        record.generator_name,
                        json.dumps(record.source_documents),
                        json.dumps(record.metadata),
                    ))
            finally:
                conn.close()

    def get_artifact(self, artifact_id: str) -> Optional[ArtifactManifestRecord]:
        """Retrieve artifact record by ID."""
        with self._lock:
            conn = self._get_connection()
            try:
                cur = conn.execute("SELECT * FROM artifact_manifest WHERE artifact_id = ?", (artifact_id,))
                row = cur.fetchone()
                if not row:
                    return None
                return self._row_to_record(row)
            finally:
                conn.close()

    def list_artifacts(self, limit: int = 50) -> List[ArtifactManifestRecord]:
        """List recently generated artifacts."""
        with self._lock:
            conn = self._get_connection()
            try:
                cur = conn.execute("SELECT * FROM artifact_manifest ORDER BY created_at DESC LIMIT ?", (limit,))
                return [self._row_to_record(r) for r in cur.fetchall()]
            finally:
                conn.close()

    def count_artifacts(self) -> int:
        """Count total recorded artifacts."""
        with self._lock:
            conn = self._get_connection()
            try:
                cur = conn.execute("SELECT COUNT(*) FROM artifact_manifest")
                return cur.fetchone()[0]
            finally:
                conn.close()

    def _row_to_record(self, row: sqlite3.Row) -> ArtifactManifestRecord:
        return ArtifactManifestRecord(
            artifact_id=row["artifact_id"],
            artifact_type=ArtifactType(row["artifact_type"]),
            file_path=row["file_path"],
            filename=row["filename"],
            size_bytes=row["size_bytes"],
            content_hash=row["content_hash"],
            created_at=row["created_at"],
            status=ArtifactStatus(row["status"]),
            validation_status=ValidationStatus(row["validation_status"]),
            classification=DocumentClassification(row["classification"]),
            generator_name=row["generator_name"],
            source_documents=json.loads(row["source_documents"]),
            metadata=json.loads(row["metadata_json"]),
        )
