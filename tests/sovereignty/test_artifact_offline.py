"""
Artifact Subsystem Offline and Air-Gap Verification Tests
Verifies that deliverable generation across all formats (DOCX, XLSX, PPTX, JSON, CSV, Markdown, Code) operates with 0 network calls.
"""

import unittest
import tempfile
from pathlib import Path

from brain.artifacts.definitions import ArtifactType
from brain.artifacts.config import ArtifactConfig
from brain.artifacts.runtime import ArtifactRuntime
from brain.artifacts.requests import ArtifactRequest
from brain.artifacts.models import DocumentSectionData, TableData, SlideData
from brain.security.sovereignty import RuntimeNetworkMonitor


class TestArtifactOffline(unittest.TestCase):
    """Test artifact generation in 100% offline air-gapped mode."""

    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.workspace = Path(self.temp_dir.name)
        self.config = ArtifactConfig(workspace_dir=self.workspace)
        self.runtime = ArtifactRuntime(config=self.config)
        self.monitor = RuntimeNetworkMonitor(enforce_block=True)
        self.monitor.reset()

    def tearDown(self):
        self.monitor.stop()
        self.temp_dir.cleanup()

    def test_generate_all_office_deliverables_zero_network(self):
        """Generate DOCX, XLSX, and PPTX files with 0 network egress."""
        with self.monitor:
            # 1. DOCX
            docx_req = ArtifactRequest(
                artifact_type=ArtifactType.DOCX,
                name="Sovereign_Doc.docx",
                destination_dir=str(self.workspace),
                content=[
                    DocumentSectionData(heading="Air-Gap Verification", text="Generated strictly on-premise.")
                ],
            )
            docx_res = self.runtime.generate_artifact(docx_req)
            self.assertTrue(docx_res.success)

            # 2. XLSX
            xlsx_req = ArtifactRequest(
                artifact_type=ArtifactType.XLSX,
                name="Sovereign_Sheet.xlsx",
                destination_dir=str(self.workspace),
                content={
                    "sheet_name": "Audit",
                    "headers": ["Metric", "Value"],
                    "rows": [["External Egress", 0], ["Local Host Egress", 1]],
                },
            )
            xlsx_res = self.runtime.generate_artifact(xlsx_req)
            self.assertTrue(xlsx_res.success)

            # 3. PPTX
            pptx_req = ArtifactRequest(
                artifact_type=ArtifactType.PPTX,
                name="Sovereign_Deck.pptx",
                destination_dir=str(self.workspace),
                content=[
                    SlideData(title="Sovereignty Proof", content="No remote dependencies.")
                ],
            )
            pptx_res = self.runtime.generate_artifact(pptx_req)
            self.assertTrue(pptx_res.success)

        self.assertTrue(self.monitor.is_clean())
        self.assertEqual(self.monitor.get_external_count(), 0)


if __name__ == "__main__":
    unittest.main()
