"""
Knowledge Subsystem Unit Tests
Tests document parsing, hashing, deterministic chunking, embeddings, indexing, and citations.
"""

import unittest
import tempfile
import shutil
import zipfile
import zlib
from pathlib import Path

from brain.knowledge.definitions import (
    DocumentStatus,
    DocumentMimeType,
    DocumentClassification,
)
from brain.knowledge.metadata import DocumentMetadata, ChunkMetadata
from brain.knowledge.documents import KnowledgeDocument, DocumentChunk, ParsedDocument
from brain.knowledge.ingestion.hashing import compute_content_hash
from brain.knowledge.ingestion.parsers.text import TextDocumentParser
from brain.knowledge.ingestion.parsers.pdf import PDFDocumentParser
from brain.knowledge.ingestion.parsers.docx import DOCXDocumentParser
from brain.knowledge.ingestion.parsers.factory import ParserFactory
from brain.knowledge.ingestion.manager import IngestionManager
from brain.knowledge.chunking.deterministic import DeterministicChunker
from brain.knowledge.embeddings.local import DeterministicLocalEmbeddingProvider
from brain.knowledge.index.local import LocalKnowledgeIndex
from brain.knowledge.provenance.citations import Citation, RetrievalResult


class TestKnowledgeUnit(unittest.TestCase):
    """Unit tests for knowledge components."""

    def setUp(self):
        self.temp_dir = tempfile.mkdtemp()
        self.temp_path = Path(self.temp_dir)
        self.db_path = self.temp_path / "test_index.db"
        self.index = LocalKnowledgeIndex(db_path=self.db_path)

    def tearDown(self):
        self.index.close()
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_content_hashing_determinism(self):
        """Content hash must be deterministic across calls and types."""
        text = "Confidential Turbine Specification v1.0"
        h1 = compute_content_hash(text)
        h2 = compute_content_hash(text)
        self.assertEqual(h1, h2)
        self.assertEqual(len(h1), 64)

        # File hash matches string hash
        test_file = self.temp_path / "spec.txt"
        test_file.write_text(text, encoding="utf-8")
        h_file = compute_content_hash(test_file)
        self.assertEqual(h1, h_file)

    def test_text_parser(self):
        """Text parser extracts paragraphs and markdown headings."""
        md_file = self.temp_path / "manual.md"
        md_file.write_text("# Overview\nThis is the system overview.\n\n# Maintenance\nPerform regular checks.", encoding="utf-8")

        parser = TextDocumentParser()
        self.assertTrue(parser.supports(md_file))
        parsed = parser.parse(md_file)
        self.assertFalse(parsed.ocr_required)
        self.assertEqual(len(parsed.sections), 2)
        self.assertEqual(parsed.sections[0].section_title, "Overview")
        self.assertEqual(parsed.sections[1].section_title, "Maintenance")

    def test_pdf_text_parser(self):
        """PDF parser extracts text streams and page numbers from valid text PDFs."""
        pdf_file = self.temp_path / "sample.pdf"
        # Construct valid minimal PDF binary with decompressed text stream
        stream_content = b"BT /F1 12 Tf 72 712 Td (Turbine Hydraulic Pressure 3000 PSI) Tj ET"
        compressed_stream = zlib.compress(stream_content)
        pdf_bytes = (
            b"%PDF-1.4\n"
            b"1 0 obj <</Type /Catalog /Pages 2 0 R>> endobj\n"
            b"2 0 obj <</Type /Pages /Kids [3 0 R] /Count 1>> endobj\n"
            b"3 0 obj <</Type /Page /Parent 2 0 R /Contents 4 0 R>> endobj\n"
            b"4 0 obj <</Length " + str(len(compressed_stream)).encode() + b">> stream\n"
            + compressed_stream + b"\nendstream\nendobj\n"
            b"xref\n0 5\ntrailer <</Root 1 0 R>>\n%%EOF"
        )
        pdf_file.write_bytes(pdf_bytes)

        parser = PDFDocumentParser()
        self.assertTrue(parser.supports(pdf_file))
        parsed = parser.parse(pdf_file)
        self.assertFalse(parsed.ocr_required)
        self.assertIn("Turbine Hydraulic Pressure 3000 PSI", parsed.raw_text)

    def test_pdf_scanned_ocr_required_detection(self):
        """PDF with 0 extractable text characters must report OCR_REQUIRED."""
        pdf_file = self.temp_path / "scanned_image.pdf"
        pdf_bytes = (
            b"%PDF-1.4\n"
            b"1 0 obj <</Type /Catalog /Pages 2 0 R>> endobj\n"
            b"2 0 obj <</Type /Pages /Kids [3 0 R] /Count 1>> endobj\n"
            b"3 0 obj <</Type /Page /Parent 2 0 R>> endobj\n"
            b"xref\n0 4\ntrailer <</Root 1 0 R>>\n%%EOF"
        )
        pdf_file.write_bytes(pdf_bytes)

        parser = PDFDocumentParser()
        parsed = parser.parse(pdf_file)
        self.assertTrue(parsed.ocr_required)

    def test_docx_parser(self):
        """DOCX parser extracts paragraphs, headings, and table cells from zip archive."""
        docx_file = self.temp_path / "specs.docx"
        doc_xml = (
            b'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            b'<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
            b'<w:body>'
            b'<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Cooling Loop Requirements</w:t></w:r></w:p>'
            b'<w:p><w:r><w:t>Coolant flow must exceed 50 L/min at all operating loads.</w:t></w:r></w:p>'
            b'<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Sensor A</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Active</w:t></w:r></w:p></w:tc></w:tr></w:tbl>'
            b'</w:body></w:document>'
        )

        with zipfile.ZipFile(docx_file, "w") as z:
            z.writestr("word/document.xml", doc_xml)

        parser = DOCXDocumentParser()
        self.assertTrue(parser.supports(docx_file))
        parsed = parser.parse(docx_file)
        self.assertFalse(parsed.ocr_required)
        self.assertIn("Cooling Loop Requirements", parsed.raw_text)
        self.assertIn("Sensor A | Active", parsed.raw_text)

    def test_deterministic_chunking(self):
        """Deterministic chunker produces stable chunk IDs and preserves boundaries."""
        meta = DocumentMetadata(
            document_id="doc_test123",
            source_path="/test/path.txt",
            display_name="path.txt",
        )
        doc = KnowledgeDocument(metadata=meta)
        doc._parsed_content = ParsedDocument(
            raw_text="Para 1 text. " * 30 + "\n\n" + "Para 2 text. " * 30,
            sections=[],
        )

        chunker = DeterministicChunker(target_chunk_size=200, chunk_overlap=30)
        chunks = chunker.chunk(doc)

        self.assertGreater(len(chunks), 1)
        self.assertTrue(chunks[0].chunk_id.startswith("doc_test123_chk_0000"))
        self.assertTrue(chunks[1].chunk_id.startswith("doc_test123_chk_0001"))

    def test_local_embedding_provider(self):
        """Embedding provider produces normalized dense vectors deterministically."""
        provider = DeterministicLocalEmbeddingProvider(dimension=256)
        self.assertEqual(provider.dimension, 256)

        text1 = "Bearing temperature monitoring protocol"
        text2 = "Bearing temperature monitoring protocol"
        text3 = "Unrelated cafeteria lunch menu"

        vec1 = provider.embed_single(text1)
        vec2 = provider.embed_single(text2)
        vec3 = provider.embed_single(text3)

        self.assertEqual(len(vec1), 256)
        self.assertEqual(vec1, vec2)  # Deterministic

        # Dot products
        import numpy as np
        sim_identical = float(np.dot(vec1, vec2))
        sim_unrelated = float(np.dot(vec1, vec3))

        self.assertAlmostEqual(sim_identical, 1.0, places=4)
        self.assertLess(sim_unrelated, sim_identical)

    def test_local_index_crud(self):
        """Local SQLite index supports upsert, get, list, search, and delete."""
        meta = DocumentMetadata(
            document_id="doc_crud_1",
            source_path=str(self.temp_path / "crud.txt"),
            display_name="crud.txt",
            content_hash="abc12345",
            status=DocumentStatus.READY,
        )
        chunk_meta = ChunkMetadata(
            chunk_id="doc_crud_1_chk_0000",
            document_id="doc_crud_1",
            chunk_index=0,
            section="Header",
            content_hash="chk123",
        )
        emb = [0.1] * 256
        chunk = DocumentChunk(metadata=chunk_meta, text="Turbine bearing lubrication schedule", embedding=emb)
        doc = KnowledgeDocument(metadata=meta, chunks=[chunk])

        # Upsert
        success = self.index.upsert_document(doc)
        self.assertTrue(success)
        self.assertEqual(self.index.count_documents(), 1)
        self.assertEqual(self.index.count_chunks(), 1)

        # Get
        retrieved_meta = self.index.get_document("doc_crud_1")
        self.assertIsNotNone(retrieved_meta)
        self.assertEqual(retrieved_meta.display_name, "crud.txt")

        # Vector search
        search_results = self.index.search_vector(query_vector=[0.1] * 256, top_k=5)
        self.assertEqual(len(search_results), 1)
        self.assertEqual(search_results[0][0].chunk_id, "doc_crud_1_chk_0000")

        # Delete
        del_success = self.index.delete_document("doc_crud_1")
        self.assertTrue(del_success)
        self.assertEqual(self.index.count_documents(), 0)
        self.assertEqual(self.index.count_chunks(), 0)

    def test_citation_formatting(self):
        """Citation correctly structures document title, page, and section."""
        cit = Citation(
            document_id="doc_123",
            document_title="turbine_manual.pdf",
            source_path="/docs/turbine_manual.pdf",
            page_number=37,
            section="Lubrication",
        )
        formatted = cit.format_citation()
        self.assertEqual(formatted, "[Source: turbine_manual.pdf, p. 37, sec: Lubrication]")


if __name__ == "__main__":
    unittest.main()
