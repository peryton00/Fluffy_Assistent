"""
Corpus Acceptance Tests for Multimodal Ingestion
Tests realistic mixed corpus (text PDF, scanned PDF, handwriting, inspection photo, drawing) and validates execution paths.
"""

import unittest
import tempfile
import io
import zlib
from pathlib import Path
from PIL import Image

from brain.knowledge.definitions import DocumentClassification, DocumentStatus
from brain.knowledge.config import KnowledgeConfig
from brain.knowledge.index.local import LocalKnowledgeIndex
from brain.knowledge.runtime import KnowledgeRuntime
from brain.knowledge.ingestion.parsers.factory import ParserFactory
from brain.knowledge.ingestion.parsers.text import TextDocumentParser
from brain.knowledge.ingestion.parsers.pdf import PDFDocumentParser
from brain.multimodal.ocr.local import DeterministicTestOCRProvider
from brain.multimodal.adapters.knowledge import MultimodalImageDocumentParser
from brain.multimodal.definitions import RegionType


class TestMultimodalCorpus(unittest.TestCase):
    """Validation across diverse document formats and extraction methods."""

    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.corpus_dir = Path(self.temp_dir.name)
        self.db_path = self.corpus_dir / "corpus_index.db"

        self.config = KnowledgeConfig(
            data_dir=self.corpus_dir,
            embedding_dimension=64,
        )
        self.index = LocalKnowledgeIndex(db_path=self.db_path)

        self.parser_factory = ParserFactory(populate_defaults=False)
        self.parser_factory.register_parser(TextDocumentParser())
        self.parser_factory.register_parser(PDFDocumentParser())

        # Test OCR provider configured with realistic multi-modal dictionary
        self.ocr_provider = DeterministicTestOCRProvider(
            mock_text="Inspection Report: No microcracks detected in housing weld seam 4A. Certified QA Pass."
        )
        self.parser_factory.register_parser(MultimodalImageDocumentParser(ocr_provider=self.ocr_provider))

        self.runtime = KnowledgeRuntime(
            config=self.config,
            index=self.index,
            parser_factory=self.parser_factory,
        )

        self._build_corpus()

    def tearDown(self):
        self.temp_dir.cleanup()

    def _build_corpus(self):
        # 1. Text-bearing PDF
        text_stream = b"BT /F1 12 Tf 72 712 Td (Text Manual: Standard operating procedure for high voltage transformer) Tj ET"
        compressed = zlib.compress(text_stream)
        stream_len = len(compressed)
        pdf_data = (
            b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"
            b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n"
            b"3 0 obj\n<< /Type /Page /Parent 2 0 R /Contents 4 0 R >>\nendobj\n"
            b"4 0 obj\n<< /Length " + str(stream_len).encode("ascii") + b" /Filter /FlateDecode >>\nstream\n"
            + compressed
            + b"\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f\n"
            b"trailer\n<< /Root 1 0 R /Size 5 >>\nstartxref\n500\n%%EOF"
        )
        (self.corpus_dir / "text_manual.pdf").write_bytes(pdf_data)

        # 2. Handwritten note image
        img_hw = Image.new("RGB", (400, 200), color=(255, 255, 240))
        img_hw.save(self.corpus_dir / "handwritten_note.png")

        # 3. Inspection photo image
        img_insp = Image.new("RGB", (500, 400), color=(200, 220, 240))
        img_insp.save(self.corpus_dir / "inspection_photo.jpg")

        # 4. Engineering drawing image
        img_dwg = Image.new("RGB", (800, 600), color=(255, 255, 255))
        img_dwg.save(self.corpus_dir / "engineering_drawing.png")

        # 5. Scanned PDF (Pure raster image, 0 text stream)
        img_scan = Image.new("RGB", (300, 200), color=(250, 250, 250))
        img_byte_arr = io.BytesIO()
        img_scan.save(img_byte_arr, format="JPEG")
        jpg_bytes = img_byte_arr.getvalue()
        scanned_pdf_data = (
            b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"
            b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n"
            b"3 0 obj\n<< /Type /Page /Parent 2 0 R /Contents 4 0 R >>\nendobj\n"
            b"4 0 obj\n<< /Length " + str(len(jpg_bytes)).encode("ascii") + b" /Filter /DCTDecode >>\nstream\n"
            + jpg_bytes
            + b"\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f\n"
            b"trailer\n<< /Root 1 0 R /Size 5 >>\nstartxref\n500\n%%EOF"
        )
        (self.corpus_dir / "scanned_manual.pdf").write_bytes(scanned_pdf_data)

    def test_text_pdf_uses_text_stream_path(self):
        doc = self.runtime.index_file(self.corpus_dir / "text_manual.pdf")
        self.assertEqual(doc.metadata.status, DocumentStatus.READY)
        self.assertEqual(doc.metadata.parser_name, "pdf_parser")

        # Search for text stream content
        results = self.runtime.search("high voltage transformer")
        self.assertGreater(len(results), 0)
        self.assertIn("transformer", results[0].text.lower())

    def test_scanned_pdf_triggers_multimodal_ocr(self):
        # Register test OCR in global multimodal runtime for scanned PDF flow
        from brain.multimodal.runtime import get_multimodal_runtime
        m_runtime = get_multimodal_runtime()
        m_runtime.ocr_registry.register_provider(self.ocr_provider)

        doc = self.runtime.index_file(self.corpus_dir / "scanned_manual.pdf")
        self.assertEqual(doc.metadata.status, DocumentStatus.READY)

        # Search for scanned PDF OCR content
        results = self.runtime.search("microcracks housing weld seam")
        self.assertGreater(len(results), 0)
        self.assertIn("weld seam", results[0].text)

    def test_image_files_use_multimodal_path(self):
        for img_name in ["handwritten_note.png", "inspection_photo.jpg", "engineering_drawing.png"]:
            doc = self.runtime.index_file(self.corpus_dir / img_name)
            self.assertEqual(doc.metadata.status, DocumentStatus.READY)
            self.assertEqual(doc.metadata.parser_name, "multimodal_image_parser")

        # Search across indexed images
        results = self.runtime.search("housing weld seam 4A QA Pass")
        self.assertGreater(len(results), 0)
        self.assertIn("weld seam", results[0].text)


if __name__ == "__main__":
    unittest.main()
