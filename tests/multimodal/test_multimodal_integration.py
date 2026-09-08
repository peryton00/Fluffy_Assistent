"""
Integration Tests for Multimodal Ingestion and Knowledge Subsystem
Tests end-to-end ingestion from image/scanned document through Knowledge index and retrieval via knowledge.search.
"""

import unittest
import tempfile
import time
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
from brain.multimodal.runtime import MultimodalRuntime
from brain.multimodal.ocr.provider import OCRProviderRegistry
from brain.tools.runtime import UnifiedToolRuntime, ToolRequest
from brain.tools.adapters.knowledge import KnowledgeToolAdapter


class TestMultimodalKnowledgeIntegration(unittest.TestCase):
    """End-to-end integration tests connecting multimodal ingestion to RAG retrieval."""

    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.data_dir = Path(self.temp_dir.name)
        self.db_path = self.data_dir / "index.db"

        self.config = KnowledgeConfig(
            data_dir=self.data_dir,
            embedding_dimension=64,
        )
        self.index = LocalKnowledgeIndex(db_path=self.db_path)

        # Build parser factory with deterministic test OCR provider for images
        self.parser_factory = ParserFactory(populate_defaults=False)
        self.parser_factory.register_parser(TextDocumentParser())
        self.parser_factory.register_parser(PDFDocumentParser())

        self.test_ocr = DeterministicTestOCRProvider(
            mock_text="Industrial safety specification: Maximum turbine operational speed is 3600 RPM under nominal load."
        )
        self.image_parser = MultimodalImageDocumentParser(ocr_provider=self.test_ocr)
        self.parser_factory.register_parser(self.image_parser)

        self.runtime = KnowledgeRuntime(
            config=self.config,
            index=self.index,
            parser_factory=self.parser_factory,
        )

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_image_ingestion_and_retrieval(self):
        """Verify image ingestion -> indexing -> search returns citation with provenance."""
        img_path = self.data_dir / "turbine_spec.png"
        img = Image.new("RGB", (300, 200), color=(255, 255, 255))
        img.save(img_path)

        doc = self.runtime.index_file(img_path, classification=DocumentClassification.INTERNAL)
        self.assertEqual(doc.metadata.status, DocumentStatus.READY)
        self.assertGreaterEqual(len(doc.chunks), 1)

        # Search for content extracted from the image
        results = self.runtime.search("turbine operational speed 3600 RPM")
        self.assertGreater(len(results), 0)

        top_hit = results[0]
        self.assertIn("3600 RPM", top_hit.text)
        self.assertEqual(top_hit.page_number, 1)

        # Verify citation format
        formatted = top_hit.citation.format_citation() if top_hit.citation else ""
        self.assertIn("turbine_spec.png", formatted)
        self.assertIn("p. 1", formatted)

    def test_tool_runtime_invocation_for_multimodal_document(self):
        """Verify UnifiedToolRuntime search returns indexed multimodal contents."""
        img_path = self.data_dir / "bearing_manual.jpg"
        img = Image.new("RGB", (300, 200), color=(255, 255, 255))
        img.save(img_path)

        self.runtime.index_file(img_path)

        # Register knowledge tool adapter
        adapter = KnowledgeToolAdapter(knowledge_runtime=self.runtime)
        tool_runtime = UnifiedToolRuntime()
        tool_def = tool_runtime.registry.get("knowledge.search")
        if tool_def:
            tool_runtime.registry.register(tool_def, adapter=adapter, allow_override=True)

        req = ToolRequest(
            tool_id="knowledge.search",
            parameters={"query": "nominal load turbine speed"},
        )
        tool_res = tool_runtime.execute(req)
        self.assertTrue(tool_res.success)
        self.assertIn("results", tool_res.output)
        self.assertGreater(len(tool_res.output["results"]), 0)


if __name__ == "__main__":
    unittest.main()
