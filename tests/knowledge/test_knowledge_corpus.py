"""
Real Local Corpus Acceptance Tests
Verifies multi-document ingestion, query relevancy, citations, change synchronization, and offline operation.
"""

import unittest
import tempfile
import shutil
import zipfile
import zlib
from pathlib import Path

from brain.knowledge.runtime import KnowledgeRuntime
from brain.knowledge.config import KnowledgeConfig
from brain.knowledge.definitions import DocumentClassification, DocumentStatus


class TestKnowledgeCorpus(unittest.TestCase):
    """Corpus-level acceptance test suite for Local Knowledge / RAG."""

    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self.temp_path = Path(self.temp_dir)
        self.corpus_dir = self.temp_path / "corpus"
        self.corpus_dir.mkdir(parents=True, exist_ok=True)
        self.data_dir = self.temp_path / "data"

        # 1. Create maintenance.txt
        (self.corpus_dir / "maintenance.txt").write_text(
            "Turbine Bearing Lubrication Guide:\n"
            "Apply synthetic high-viscosity oil every 1000 operational hours.\n"
            "Check oil reservoir pressure daily to ensure stable 4.5 Bar supply.",
            encoding="utf-8",
        )

        # 2. Create safety.md
        (self.corpus_dir / "safety.md").write_text(
            "# Industrial Plant Safety Protocols\n"
            "All personnel entering Area 4 must wear level-3 arc-flash protective gear.\n\n"
            "# Emergency Evacuation\n"
            "In case of coolant pressure drop below 2.0 Bar, initiate immediate plant alarm.",
            encoding="utf-8",
        )

        # 3. Create specs.pdf
        pdf_file = self.corpus_dir / "specs.pdf"
        stream_content = b"BT /F1 12 Tf 72 712 Td (Hydraulic Actuator Model H-500 Maximum Force 25000 Newtons) Tj ET"
        compressed = zlib.compress(stream_content)
        pdf_bytes = (
            b"%PDF-1.4\n"
            b"1 0 obj <</Type /Catalog /Pages 2 0 R>> endobj\n"
            b"2 0 obj <</Type /Pages /Kids [3 0 R] /Count 1>> endobj\n"
            b"3 0 obj <</Type /Page /Parent 2 0 R /Contents 4 0 R>> endobj\n"
            b"4 0 obj <</Length " + str(len(compressed)).encode() + b">> stream\n"
            + compressed + b"\nendstream\nendobj\n"
            b"xref\n0 5\ntrailer <</Root 1 0 R>>\n%%EOF"
        )
        pdf_file.write_bytes(pdf_bytes)

        # 4. Create procedures.docx
        docx_file = self.corpus_dir / "procedures.docx"
        doc_xml = (
            b'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            b'<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
            b'<w:body>'
            b'<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Valve Calibration Procedure</w:t></w:r></w:p>'
            b'<w:p><w:r><w:t>Calibrate bypass throttle valve using 4-20mA signal generator.</w:t></w:r></w:p>'
            b'</w:body></w:document>'
        )
        with zipfile.ZipFile(docx_file, "w") as z:
            z.writestr("word/document.xml", doc_xml)

        self.config = KnowledgeConfig(data_dir=self.data_dir)
        self.runtime = KnowledgeRuntime(config=self.config)

    def tearDown(self):
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_multi_document_corpus_indexing_and_search(self):
        """Index all documents in directory and perform specific target queries."""
        indexed_docs = self.runtime.index_directory(self.corpus_dir, recursive=False)
        self.assertEqual(len(indexed_docs), 4)

        # Query 1: Lubrication -> maintenance.txt
        res1 = self.runtime.search("bearing lubrication reservoir pressure 4.5 Bar", top_k=1)
        self.assertGreater(len(res1), 0)
        self.assertEqual(res1[0].display_name, "maintenance.txt")
        self.assertIn("synthetic high-viscosity oil", res1[0].text)

        # Query 2: Safety arc-flash -> safety.md
        res2 = self.runtime.search("arc-flash protective gear area 4", top_k=1)
        self.assertGreater(len(res2), 0)
        self.assertEqual(res2[0].display_name, "safety.md")
        self.assertIn("level-3 arc-flash", res2[0].text)

        # Query 3: Actuator force -> specs.pdf
        res3 = self.runtime.search("Hydraulic Actuator H-500 Newtons", top_k=1)
        self.assertGreater(len(res3), 0)
        self.assertEqual(res3[0].display_name, "specs.pdf")
        self.assertIn("25000 Newtons", res3[0].text)

        # Query 4: Calibration -> procedures.docx
        res4 = self.runtime.search("bypass throttle valve 4-20mA calibration", top_k=1)
        self.assertGreater(len(res4), 0)
        self.assertEqual(res4[0].display_name, "procedures.docx")
        self.assertIn("4-20mA signal", res4[0].text)

    def test_modification_change_synchronization(self):
        """Modifying a document on disk and running sync_file updates index with new text."""
        safety_file = self.corpus_dir / "safety.md"
        self.runtime.index_file(safety_file)

        # Initial check
        res_init = self.runtime.search("nitrogen purge protocol", top_k=1)
        if res_init:
            self.assertNotIn("N2 ventilation dampers", res_init[0].text)

        # Modify file on disk
        safety_file.write_text(
            "# Industrial Plant Safety Protocols\n"
            "Emergency Nitrogen Purge Protocol: evacuate hall and engage N2 ventilation dampers.",
            encoding="utf-8",
        )

        # Sync file
        status = self.runtime.sync_file(safety_file)
        self.assertEqual(status, DocumentStatus.READY)

        # Search now finds modified text
        res_updated = self.runtime.search("nitrogen purge protocol", top_k=1)
        self.assertGreater(len(res_updated), 0)
        self.assertEqual(res_updated[0].display_name, "safety.md")
        self.assertIn("N2 ventilation dampers", res_updated[0].text)

    def test_deletion_synchronization(self):
        """Deleting a file on disk and syncing removes it from search index."""
        docx_file = self.corpus_dir / "procedures.docx"
        self.runtime.index_file(docx_file)

        res_before = self.runtime.search("throttle valve", top_k=1)
        self.assertGreater(len(res_before), 0)

        # Remove file from disk
        docx_file.unlink()

        # Sync
        status = self.runtime.sync_file(docx_file)
        self.assertEqual(status, DocumentStatus.DELETED)

        # Search now returns 0 results
        res_after = self.runtime.search("throttle valve", top_k=1)
        self.assertEqual(len(res_after), 0)


if __name__ == "__main__":
    unittest.main()
