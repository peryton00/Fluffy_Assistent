"""
Knowledge Subsystem Offline and Air-Gap Verification Tests
Verifies that document ingestion, embedding, indexing, and retrieval operate with 0 external network requests.
"""

import unittest
import tempfile
from pathlib import Path

from brain.knowledge.config import KnowledgeConfig
from brain.knowledge.runtime import KnowledgeRuntime
from brain.knowledge.ingestion.discovery import DocumentDiscovery
from brain.security.sovereignty import RuntimeNetworkMonitor


class TestKnowledgeOffline(unittest.TestCase):
    """Test Knowledge & RAG subsystem in 100% offline air-gapped mode."""

    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.workspace = Path(self.temp_dir.name)
        self.config = KnowledgeConfig(
            data_dir=self.workspace / "data",
        )
        self.runtime = KnowledgeRuntime(config=self.config)
        self.monitor = RuntimeNetworkMonitor(enforce_block=True)
        self.monitor.reset()

    def tearDown(self):
        self.monitor.stop()
        self.temp_dir.cleanup()

    def test_full_knowledge_lifecycle_with_zero_network_calls(self):
        """Document creation, ingestion, indexing, and search execute with 0 network calls."""
        # Create a sample markdown file
        doc_path = self.workspace / "industrial_turbine_specs.md"
        doc_path.write_text(
            "# Industrial Gas Turbine Specification\n"
            "Operating rotor speed must not exceed 3600 RPM under continuous load.\n"
            "Lubrication oil temperature must remain between 45°C and 60°C.\n",
            encoding="utf-8",
        )

        with self.monitor:
            # 1. Ingest / Index document
            doc = self.runtime.index_file(doc_path)
            self.assertIsNotNone(doc)

            # 2. Search knowledge base
            results = self.runtime.search(query="rotor speed limit")
            self.assertIsInstance(results, list)
            self.assertGreater(len(results), 0)
            self.assertIn("3600 RPM", results[0].text)

        # Verify zero external network attempts
        self.assertTrue(self.monitor.is_clean())
        self.assertEqual(self.monitor.get_external_count(), 0)


if __name__ == "__main__":
    unittest.main()
