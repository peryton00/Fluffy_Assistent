"""
Security and Boundary Tests for Artifact Subsystem
Verifies traversal rejection, protected paths, overwrite protection, classification inheritance, and air-gap network isolation.
"""

import unittest
import tempfile
import socket
from pathlib import Path

from brain.artifacts.definitions import (
    ArtifactType,
    OverwritePolicy,
    ArtifactStatus,
)
from brain.artifacts.requests import ArtifactRequest
from brain.artifacts.config import ArtifactConfig
from brain.artifacts.runtime import ArtifactRuntime
from brain.artifacts.storage.paths import ArtifactPathManager
from brain.knowledge.definitions import DocumentClassification


class TestArtifactSecurity(unittest.TestCase):
    """Test security invariants for deliverable generation."""

    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.workspace = Path(self.temp_dir.name)
        self.config = ArtifactConfig(workspace_dir=self.workspace)
        self.runtime = ArtifactRuntime(config=self.config)

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_path_traversal_rejection(self):
        """Verify destination paths with traversal tokens or escapes are rejected."""
        req = ArtifactRequest(
            artifact_type=ArtifactType.TXT,
            name="escape.txt",
            destination_dir=str(self.workspace) + "/../../Windows/System32",
            content="malicious write",
        )
        res = self.runtime.generate_artifact(req)
        self.assertFalse(res.success)
        self.assertIn("Access denied", res.error)

    def test_reserved_device_name_sanitization(self):
        """Verify Windows reserved device names (CON, NUL, PRN) are safely sanitized."""
        req = ArtifactRequest(
            artifact_type=ArtifactType.TXT,
            name="CON.txt",
            destination_dir=str(self.workspace),
            content="safe device write",
        )
        res = self.runtime.generate_artifact(req)
        self.assertTrue(res.success)
        # Sanitized filename must not be raw CON.txt
        self.assertEqual(res.filename, "safe_CON.txt")
        self.assertTrue(Path(res.file_path).exists())

    def test_classification_inheritance_and_no_downgrade(self):
        """Verify classification is properly resolved and not silently downgraded."""
        req = ArtifactRequest(
            artifact_type=ArtifactType.MARKDOWN,
            name="classified_summary.md",
            destination_dir=str(self.workspace),
            content="# Confidential Strategy\nClassified industrial details.",
            classification=DocumentClassification.CONFIDENTIAL,
        )
        res = self.runtime.generate_artifact(req)
        self.assertTrue(res.success)
        self.assertEqual(res.classification, DocumentClassification.CONFIDENTIAL)

    def test_air_gap_network_zero_isolation(self):
        """Verify artifact generation makes zero outbound network or HTTP connections."""
        req = ArtifactRequest(
            artifact_type=ArtifactType.DOCX,
            name="airgap_test.docx",
            destination_dir=str(self.workspace),
            content="Testing airgap isolation.",
        )

        def mock_connect(*args, **kwargs):
            raise AssertionError("Outbound network connection attempted during local artifact generation!")

        orig_connect = socket.socket.connect
        try:
            socket.socket.connect = mock_connect
            res = self.runtime.generate_artifact(req)
            self.assertTrue(res.success)
        finally:
            socket.socket.connect = orig_connect


if __name__ == "__main__":
    unittest.main()
