"""
Security and Boundary Tests for Multimodal Subsystem
Verifies traversal rejection, protected paths, permission clearance preservation, air-gap isolation, and malformed inputs.
"""

import unittest
import socket
import tempfile
from pathlib import Path
from PIL import Image

from brain.knowledge.definitions import DocumentClassification, DocumentStatus
from brain.knowledge.ingestion.discovery import DocumentDiscovery
from brain.knowledge.ingestion.manager import IngestionManager
from brain.knowledge.permissions import KnowledgeAccessIdentity
from brain.multimodal.definitions import MultimodalHealthStatus
from brain.multimodal.models import OCRRequest
from brain.multimodal.ocr.local import LocalOCRProvider, DeterministicTestOCRProvider
from brain.multimodal.ocr.provider import OCRProviderRegistry
from brain.multimodal.adapters.knowledge import MultimodalImageDocumentParser
from brain.knowledge.ingestion.parsers.factory import ParserFactory


class TestMultimodalSecurity(unittest.TestCase):
    """Test security boundaries and invariants for multimodal ingestion."""

    def test_path_traversal_prevention_on_image_paths(self):
        self.assertFalse(DocumentDiscovery.is_safe_path("../../../etc/shadow.png"))
        self.assertFalse(DocumentDiscovery.is_safe_path("..\\..\\windows\\system32\\cmd.exe.jpg"))
        self.assertFalse(DocumentDiscovery.is_safe_path("\\\\evil-server\\share\\scan.png"))
        self.assertFalse(DocumentDiscovery.is_safe_path("CON.png"))
        self.assertFalse(DocumentDiscovery.is_safe_path("NUL.jpg"))
        self.assertFalse(DocumentDiscovery.is_safe_path("safe_dir/\x00/evil.png"))

    def test_protected_system_paths_rejection(self):
        self.assertFalse(DocumentDiscovery.is_safe_path("C:\\Windows\\System32\\scan.png"))
        self.assertFalse(DocumentDiscovery.is_safe_path("/etc/ssl/cert.png"))
        self.assertFalse(DocumentDiscovery.is_safe_path("/root/secret.jpg"))

    def test_air_gap_offline_guarantee(self):
        """Verify OCR and Vision execution makes 0 outbound network calls."""
        with tempfile.TemporaryDirectory() as tmpdir:
            img_path = Path(tmpdir) / "test_scan.png"
            img = Image.new("RGB", (100, 100), color=(255, 255, 255))
            img.save(img_path)

            provider = LocalOCRProvider()
            req = OCRRequest(file_path=str(img_path))

            # Monkeypatch socket to ensure any connect attempt triggers an assertion
            def mock_connect(*args, **kwargs):
                raise AssertionError("Network connection attempted during local multimodal processing!")

            orig_connect = socket.socket.connect
            try:
                socket.socket.connect = mock_connect
                res = provider.extract(req)
                # Regardless of availability, no network attempt was made
                self.assertIsNotNone(res)
            finally:
                socket.socket.connect = orig_connect

    def test_permission_clearance_preservation(self):
        """Ensure classification level assigned during image ingestion is properly preserved."""
        with tempfile.TemporaryDirectory() as tmpdir:
            img_path = Path(tmpdir) / "confidential_blueprint.png"
            img = Image.new("RGB", (100, 100), color=(255, 255, 255))
            img.save(img_path)

            # Ingest image with explicit test OCR provider
            factory = ParserFactory(populate_defaults=False)
            test_ocr = DeterministicTestOCRProvider(mock_text="Confidential turbine blueprint specs.")
            factory.register_parser(MultimodalImageDocumentParser(ocr_provider=test_ocr))

            ingestion = IngestionManager(parser_factory=factory)
            doc = ingestion.ingest_file(
                file_path=img_path,
                classification=DocumentClassification.CONFIDENTIAL,
                owner="engineering_lead",
            )

            self.assertEqual(doc.metadata.classification, DocumentClassification.CONFIDENTIAL)
            self.assertEqual(doc.metadata.owner, "engineering_lead")
            self.assertEqual(doc.metadata.status, DocumentStatus.PARSING)

    def test_malformed_and_corrupted_image_handling(self):
        """Verify corrupted image files fail explicitly without unbounded resource consumption."""
        with tempfile.TemporaryDirectory() as tmpdir:
            corrupt_path = Path(tmpdir) / "corrupt.png"
            corrupt_path.write_bytes(b"\x89PNG\r\n\x1a\nCORRUPT_BYTES_HERE_NOT_AN_IMAGE")

            provider = LocalOCRProvider()
            req = OCRRequest(file_path=str(corrupt_path))
            res = provider.extract(req)
            self.assertFalse(res.success)
            self.assertIsNotNone(res.error)


if __name__ == "__main__":
    unittest.main()
