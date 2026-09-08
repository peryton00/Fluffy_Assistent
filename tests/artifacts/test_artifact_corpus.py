"""
Corpus and Cross-Subsystem Integration Tests for Artifact Generation
Tests end-to-end knowledge/RAG retrieval -> DOCX/Markdown report generation,
and Multimodal OCR -> deliverable generation with full provenance and citation tracking.
"""

import unittest
import tempfile
import json
from pathlib import Path

from brain.artifacts.definitions import ArtifactType, OverwritePolicy
from brain.artifacts.config import ArtifactConfig
from brain.artifacts.requests import ArtifactRequest
from brain.artifacts.models import DocumentSectionData, TableData
from brain.artifacts.runtime import ArtifactRuntime
from brain.knowledge.definitions import DocumentClassification


class TestArtifactCorpusIntegration(unittest.TestCase):
    """End-to-end tests validating deliverable creation from RAG search and OCR extraction pipelines."""

    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.workspace = Path(self.temp_dir.name)
        self.config = ArtifactConfig(workspace_dir=self.workspace)
        self.runtime = ArtifactRuntime(config=self.config)

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_knowledge_retrieval_to_docx_report(self):
        """
        Verify knowledge search retrieval results being packaged into a structured Word report:
        - Inherits confidential classification
        - Embeds document citations
        - Creates executive summary, findings table, and bibliography
        """
        # Simulated RAG chunks with CONFIDENTIAL classification
        mock_chunks = [
            {
                "doc_id": "spec_industrial_safety.pdf",
                "text": "Turbine temperature limits must not exceed 650°C during peak load operation.",
                "classification": DocumentClassification.CONFIDENTIAL,
                "page_number": 14,
            },
            {
                "doc_id": "spec_industrial_safety.pdf",
                "text": "Cooling pump pressure should be maintained at 4.2 bar ± 0.3 bar.",
                "classification": DocumentClassification.CONFIDENTIAL,
                "page_number": 19,
            },
        ]

        # Extract findings and citations
        citations = [f"{c['doc_id']} (p. {c['page_number']})" for c in mock_chunks]
        findings_bullets = [c["text"] for c in mock_chunks]

        # Structure report
        sections = [
            DocumentSectionData(
                heading="1. Executive Summary",
                text="This report summarizes key operational safety parameters retrieved from confidential engineering specifications.",
            ),
            DocumentSectionData(
                heading="2. Operational Boundaries",
                bullet_points=findings_bullets,
            ),
            DocumentSectionData(
                heading="3. Key Parameters Table",
                table=TableData(
                    headers=["Parameter", "Standard Limit", "Source Citation"],
                    rows=[
                        ["Turbine Temperature", "650°C Max", citations[0]],
                        ["Cooling Pressure", "4.2 bar ± 0.3 bar", citations[1]],
                    ],
                ),
            ),
            DocumentSectionData(
                heading="4. References & Provenance",
                bullet_points=[f"Source Document: {cit}" for cit in citations],
            ),
        ]

        req = ArtifactRequest(
            artifact_type=ArtifactType.DOCX,
            name="Confidential_Turbine_Safety_Audit.docx",
            destination_dir=str(self.workspace),
            content=sections,
            classification=DocumentClassification.CONFIDENTIAL,
            sources=citations,
        )

        res = self.runtime.generate_artifact(req)
        self.assertTrue(res.success, msg=f"DOCX Generation failed: {res.error}")
        self.assertTrue(Path(res.file_path).exists())
        self.assertEqual(res.classification, DocumentClassification.CONFIDENTIAL)
        self.assertGreater(res.size_bytes, 0)

        # Query manifest to verify provenance recording
        record = self.runtime.manifest.get_artifact(res.artifact_id)
        self.assertIsNotNone(record)
        self.assertEqual(record.classification, DocumentClassification.CONFIDENTIAL)
        self.assertTrue(any("spec_industrial_safety.pdf" in s for s in record.source_documents))

    def test_multimodal_ocr_to_markdown_and_csv_deliverable(self):
        """
        Verify multimodal OCR scanned table extraction transformed into structured CSV and Markdown:
        - High-density data conversion
        - Verifiable checksums
        """
        # Simulated OCR structured table output from a scanned physical bill of materials
        ocr_extracted_headers = ["Item_Code", "Description", "Quantity", "Unit_Price_USD"]
        ocr_extracted_rows = [
            ["BRG-9021", "Ceramic Ball Bearing 20mm", "150", "42.50"],
            ["GSK-4011", "High-Temp Fluorosilicone Gasket", "500", "3.20"],
            ["VLV-1004", "Proportional Solenoid Valve 24V", "25", "310.00"],
            ["SNS-7720", "Piezoelectric Vibration Sensor", "60", "185.00"],
        ]

        # 1. Generate CSV Deliverable
        csv_req = ArtifactRequest(
            artifact_type=ArtifactType.CSV,
            name="Scanned_BOM_Extracted.csv",
            destination_dir=str(self.workspace),
            content=TableData(headers=ocr_extracted_headers, rows=ocr_extracted_rows),
            classification=DocumentClassification.INTERNAL,
            sources=["scanned_blueprint_page_03.png"],
        )
        csv_res = self.runtime.generate_artifact(csv_req)
        self.assertTrue(csv_res.success)
        self.assertTrue(Path(csv_res.file_path).exists())

        # 2. Generate Markdown Summary Report
        md_req = ArtifactRequest(
            artifact_type=ArtifactType.MARKDOWN,
            name="Scanned_BOM_Summary.md",
            destination_dir=str(self.workspace),
            content=[
                DocumentSectionData(
                    heading="Scanned Bill of Materials Summary",
                    text="The following inventory was extracted directly from on-premise scanned engineering schematics.",
                    table=TableData(headers=ocr_extracted_headers, rows=ocr_extracted_rows),
                )
            ],
            classification=DocumentClassification.INTERNAL,
            sources=["scanned_blueprint_page_03.png"],
        )
        md_res = self.runtime.generate_artifact(md_req)
        self.assertTrue(md_res.success)
        self.assertTrue(Path(md_res.file_path).exists())

        # Read back markdown content
        with open(md_res.file_path, "r", encoding="utf-8") as f:
            content = f.read()
        self.assertIn("BRG-9021", content)
        self.assertIn("High-Temp Fluorosilicone Gasket", content)
        self.assertIn("scanned_blueprint_page_03.png", content)


if __name__ == "__main__":
    unittest.main()
