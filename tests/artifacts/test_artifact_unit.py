"""
Unit Tests for Local Artifact Subsystem
Tests data models, path sanitization, atomic write transactions, manifest auditing, and health telemetry.
"""

import unittest
import tempfile
import time
from pathlib import Path

from brain.artifacts.definitions import (
    ArtifactType,
    ArtifactStatus,
    OverwritePolicy,
    ValidationStatus,
    ArtifactHealthStatus,
)
from brain.artifacts.models import (
    TableData,
    SlideData,
    DocumentSectionData,
    SpreadsheetSheetData,
    ArtifactMetadata,
    ArtifactManifestRecord,
)
from brain.artifacts.requests import ArtifactRequest
from brain.artifacts.results import ArtifactResult
from brain.artifacts.config import ArtifactConfig
from brain.artifacts.health import ArtifactHealth
from brain.artifacts.permissions import ArtifactPermissionPolicy
from brain.artifacts.storage.paths import ArtifactPathManager
from brain.artifacts.storage.atomic import AtomicWriteTransaction
from brain.artifacts.storage.manifest import ArtifactManifestManager
from brain.artifacts.runtime import ArtifactRuntime
from brain.knowledge.definitions import DocumentClassification


class TestArtifactDataModels(unittest.TestCase):
    """Test data structures and serialization."""

    def test_table_data_model(self):
        table = TableData(headers=["ColA", "ColB"], rows=[["Val1", "Val2"]])
        d = table.to_dict()
        self.assertEqual(d["headers"], ["ColA", "ColB"])
        self.assertEqual(len(d["rows"]), 1)

    def test_document_section_data_model(self):
        sec = DocumentSectionData(heading="Executive Summary", level=1, text="Overview text.", bullet_points=["Point 1", "Point 2"])
        d = sec.to_dict()
        self.assertEqual(d["heading"], "Executive Summary")
        self.assertEqual(len(d["bullet_points"]), 2)

    def test_slide_data_model(self):
        slide = SlideData(title="Architecture", content="System diagram", bullet_points=["Local RAG", "Air-gapped"], notes="Presenter note")
        d = slide.to_dict()
        self.assertEqual(d["title"], "Architecture")
        self.assertEqual(d["notes"], "Presenter note")

    def test_spreadsheet_sheet_data_model(self):
        sheet = SpreadsheetSheetData(sheet_name="Q1_Metrics", headers=["Metric", "Value"], rows=[["Uptime", "99.9%"]], formulas={"C2": "=A2+B2"})
        d = sheet.to_dict()
        self.assertEqual(d["sheet_name"], "Q1_Metrics")
        self.assertEqual(d["formulas"]["C2"], "=A2+B2")


class TestArtifactPathSafetyAndVersioning(unittest.TestCase):
    """Test path sanitization, traversal defenses, and OverwritePolicy resolution."""

    def test_sanitize_filename(self):
        self.assertEqual(ArtifactPathManager.sanitize_filename("report.docx"), "report.docx")
        self.assertEqual(ArtifactPathManager.sanitize_filename("../../etc/passwd.txt"), "passwd.txt")
        self.assertEqual(ArtifactPathManager.sanitize_filename("bad:file*name?.md"), "bad_file_name_.md")
        self.assertEqual(ArtifactPathManager.sanitize_filename("CON.txt"), "safe_CON.txt")
        self.assertEqual(ArtifactPathManager.sanitize_filename("NUL.json"), "safe_NUL.json")

    def test_versioning_collision_resolution(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            base_dir = Path(tmpdir)
            (base_dir / "report.docx").write_text("existing content", encoding="utf-8")

            # OverwritePolicy.VERSION -> resolves to 'report (1).docx'
            dest, is_replace = ArtifactPathManager.resolve_destination_path(
                base_dir=base_dir,
                filename="report.docx",
                overwrite_policy=OverwritePolicy.VERSION,
            )
            self.assertEqual(dest.name, "report (1).docx")
            self.assertFalse(is_replace)

            # Create 'report (1).docx' -> next is 'report (2).docx'
            dest.write_text("v1 content", encoding="utf-8")
            dest2, is_replace2 = ArtifactPathManager.resolve_destination_path(
                base_dir=base_dir,
                filename="report.docx",
                overwrite_policy=OverwritePolicy.VERSION,
            )
            self.assertEqual(dest2.name, "report (2).docx")
            self.assertFalse(is_replace2)

    def test_deny_overwrite_policy(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            base_dir = Path(tmpdir)
            (base_dir / "report.docx").write_text("existing content", encoding="utf-8")

            with self.assertRaises(FileExistsError):
                ArtifactPathManager.resolve_destination_path(
                    base_dir=base_dir,
                    filename="report.docx",
                    overwrite_policy=OverwritePolicy.DENY,
                )


class TestAtomicWriteTransactions(unittest.TestCase):
    """Test atomic commit transactions, validation gate, and rollback protection."""

    def test_successful_atomic_write(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            target = Path(tmpdir) / "output.txt"

            def write_cb(tmp: Path):
                tmp.write_text("Hello Atomic World", encoding="utf-8")

            def validate_cb(tmp: Path) -> bool:
                return "Hello" in tmp.read_text(encoding="utf-8")

            dest, content_hash, size_bytes = AtomicWriteTransaction.commit_transaction(
                target_path=target,
                write_callback=write_cb,
                validate_callback=validate_cb,
            )

            self.assertTrue(dest.exists())
            self.assertEqual(dest.read_text(encoding="utf-8"), "Hello Atomic World")
            self.assertGreater(len(content_hash), 0)
            self.assertEqual(size_bytes, len("Hello Atomic World"))

    def test_failed_validation_rolls_back_and_leaves_target_clean(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            target = Path(tmpdir) / "original.txt"
            target.write_text("Original safe content", encoding="utf-8")

            def write_cb(tmp: Path):
                tmp.write_text("Corrupted content", encoding="utf-8")

            def validate_cb(tmp: Path) -> bool:
                return False  # Force validation failure

            with self.assertRaises(ValueError):
                AtomicWriteTransaction.commit_transaction(
                    target_path=target,
                    write_callback=write_cb,
                    validate_callback=validate_cb,
                    overwrite_policy=OverwritePolicy.REPLACE,
                )

            # Original safe content must remain untouched
            self.assertEqual(target.read_text(encoding="utf-8"), "Original safe content")


class TestArtifactManifest(unittest.TestCase):
    """Test SQLite audit logging for generated deliverables."""

    def test_record_and_query_manifest(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            db_path = Path(tmpdir) / "manifest.db"
            manager = ArtifactManifestManager(db_path=db_path)

            record = ArtifactManifestRecord(
                artifact_id="art_1001",
                artifact_type=ArtifactType.DOCX,
                file_path="/safe/path/report.docx",
                filename="report.docx",
                size_bytes=10240,
                content_hash="abc123hash",
                created_at=time.time(),
                status=ArtifactStatus.READY,
                validation_status=ValidationStatus.PASSED,
                classification=DocumentClassification.CONFIDENTIAL,
                generator_name="docx_generator",
                source_documents=["doc_turbine_manual"],
            )

            manager.record_artifact(record)
            self.assertEqual(manager.count_artifacts(), 1)

            retrieved = manager.get_artifact("art_1001")
            self.assertIsNotNone(retrieved)
            self.assertEqual(retrieved.filename, "report.docx")
            self.assertEqual(retrieved.classification, DocumentClassification.CONFIDENTIAL)
            self.assertIn("doc_turbine_manual", retrieved.source_documents)


class TestClassificationInheritance(unittest.TestCase):
    """Test security clearance inheritance."""

    def test_inherit_highest_source_classification(self):
        sources = [DocumentClassification.PUBLIC, DocumentClassification.CONFIDENTIAL, DocumentClassification.INTERNAL]
        resolved = ArtifactPermissionPolicy.resolve_classification(source_classifications=sources)
        self.assertEqual(resolved, DocumentClassification.CONFIDENTIAL)

        sources_restricted = [DocumentClassification.CONFIDENTIAL, DocumentClassification.RESTRICTED]
        resolved_restr = ArtifactPermissionPolicy.resolve_classification(source_classifications=sources_restricted)
        self.assertEqual(resolved_restr, DocumentClassification.RESTRICTED)


if __name__ == "__main__":
    unittest.main()
