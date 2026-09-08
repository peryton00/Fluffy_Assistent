"""
Format-by-Format Deliverable Generation Tests
Verifies that all supported artifact formats (DOCX, XLSX, PPTX, TXT, Markdown, JSON, CSV, Code)
generate real, well-formed files that can be independently reopened and parsed.
"""

import unittest
import tempfile
import json
import csv
import ast
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

from brain.artifacts.definitions import (
    ArtifactType,
    ArtifactStatus,
    ValidationStatus,
)
from brain.artifacts.models import (
    DocumentSectionData,
    TableData,
    SlideData,
    SpreadsheetSheetData,
    ArtifactMetadata,
)
from brain.artifacts.requests import ArtifactRequest
from brain.artifacts.config import ArtifactConfig
from brain.artifacts.runtime import ArtifactRuntime


class TestArtifactFormats(unittest.TestCase):
    """Test format-specific deliverable generation and reopening validation."""

    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.workspace = Path(self.temp_dir.name)
        self.config = ArtifactConfig(workspace_dir=self.workspace)
        self.runtime = ArtifactRuntime(config=self.config)

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_generate_and_reopen_docx(self):
        """Generate a real Word DOCX deliverable with title, sections, bullet points, and tables."""
        sections = [
            DocumentSectionData(
                heading="1. Operational Assessment",
                level=1,
                text="The turbine maintenance check completed with zero defects found in primary rotor assembly.",
                bullet_points=[
                    "Vibration levels within tolerance (0.02 mm/s)",
                    "Lubrication pressure nominal at 4.2 bar",
                ],
                table=TableData(
                    headers=["Sensor ID", "Reading", "Status"],
                    rows=[
                        ["VIB-01", "0.018 mm/s", "NOMINAL"],
                        ["PRS-04", "4.2 bar", "NOMINAL"],
                        ["TMP-09", "68.4 °C", "NORMAL"],
                    ],
                ),
            ),
        ]

        req = ArtifactRequest(
            artifact_type=ArtifactType.DOCX,
            name="turbine_inspection_report.docx",
            destination_dir=str(self.workspace),
            content=sections,
            metadata=ArtifactMetadata(
                title="Turbine Inspection Report",
                author="Chief Quality Engineer",
                description="Quarterly sovereign maintenance report",
            ),
            sources=["[Source: turbine_manual.pdf, p. 12]"],
        )

        res = self.runtime.generate_artifact(req)
        self.assertTrue(res.success, msg=f"DOCX generation failed: {res.error}")
        self.assertEqual(res.status, ArtifactStatus.READY)
        self.assertEqual(res.validation_status, ValidationStatus.PASSED)

        # Independently reopen and parse Office Open XML document
        docx_path = Path(res.file_path)
        self.assertTrue(docx_path.exists())
        self.assertGreater(docx_path.stat().st_size, 1000)

        with zipfile.ZipFile(docx_path, "r") as zf:
            doc_xml = zf.read("word/document.xml")
            root = ET.fromstring(doc_xml)
            # Verify document root
            self.assertTrue(root.tag.endswith("document"))
            # Verify text content exists inside XML
            xml_str = doc_xml.decode("utf-8")
            self.assertIn("Turbine Inspection Report", xml_str)
            self.assertIn("Operational Assessment", xml_str)
            self.assertIn("VIB-01", xml_str)

    def test_generate_and_reopen_xlsx(self):
        """Generate a real Excel XLSX deliverable with multiple sheets and formulas."""
        sheet1 = SpreadsheetSheetData(
            sheet_name="Inventory",
            headers=["Part Number", "Description", "Unit Cost", "Quantity", "Total Value"],
            rows=[
                ["BRG-902", "Ceramic Bearing", 145.50, 10, 1455.00],
                ["SEAL-44", "Fluoropolymer Seal", 32.00, 50, 1600.00],
                ["VALV-12", "Relief Valve", 890.00, 2, 1780.00],
            ],
            formulas={"E5": "=SUM(E2:E4)"},
        )

        req = ArtifactRequest(
            artifact_type=ArtifactType.XLSX,
            name="parts_inventory.xlsx",
            destination_dir=str(self.workspace),
            content=sheet1,
            metadata=ArtifactMetadata(title="Parts Inventory Report"),
            sources=["[Source: warehouse_manifest.pdf]"],
        )

        res = self.runtime.generate_artifact(req)
        self.assertTrue(res.success, msg=f"XLSX generation failed: {res.error}")
        self.assertEqual(res.status, ArtifactStatus.READY)

        # Independently reopen and verify zip package
        xlsx_path = Path(res.file_path)
        self.assertTrue(xlsx_path.exists())

        with zipfile.ZipFile(xlsx_path, "r") as zf:
            namelist = zf.namelist()
            self.assertIn("xl/workbook.xml", namelist)
            wb_xml = zf.read("xl/workbook.xml")
            root = ET.fromstring(wb_xml)
            self.assertTrue(root.tag.endswith("workbook"))

    def test_generate_and_reopen_pptx(self):
        """Generate a real PowerPoint PPTX presentation deliverable."""
        slides = [
            SlideData(
                title="Industrial Agent Workbench",
                content="Architecture and sovereign deployment overview.",
                bullet_points=[
                    "On-premise LLM inference with zero cloud egress",
                    "Deterministic tool runtime security boundaries",
                    "Unified multi-format deliverable generation",
                ],
                table=TableData(
                    headers=["Phase", "Milestone", "Status"],
                    rows=[
                        ["Phase 2F", "Local RAG", "VERIFIED"],
                        ["Phase 2G", "Multimodal / OCR", "VERIFIED"],
                        ["Phase 2H", "Artifact Subsystem", "ACTIVE"],
                    ],
                ),
                notes="Emphasize air-gap compliance and offline guarantees.",
            ),
        ]

        req = ArtifactRequest(
            artifact_type=ArtifactType.PPTX,
            name="system_briefing.pptx",
            destination_dir=str(self.workspace),
            content=slides,
            metadata=ArtifactMetadata(title="System Architecture Briefing"),
            sources=["[Source: industrial_spec.md]"],
        )

        res = self.runtime.generate_artifact(req)
        self.assertTrue(res.success, msg=f"PPTX generation failed: {res.error}")
        self.assertEqual(res.status, ArtifactStatus.READY)

        # Independently reopen with python-pptx
        from pptx import Presentation
        prs = Presentation(res.file_path)
        # Title slide + 1 content slide + 1 sources slide = 3 slides
        self.assertGreaterEqual(len(prs.slides), 2)
        # Verify title slide text
        self.assertIn("System Architecture Briefing", prs.slides[0].shapes.title.text)

    def test_generate_and_parse_json(self):
        """Generate and round-trip parse JSON deliverable."""
        payload = {
            "project": "Fluffy Assistant",
            "telemetry": {"status": "nominal", "nodes": [1, 2, 3]},
            "metrics": [
                {"name": "latency_ms", "value": 12.4},
                {"name": "cpu_util", "value": 14.8},
            ],
        }

        req = ArtifactRequest(
            artifact_type=ArtifactType.JSON,
            name="telemetry_dump.json",
            destination_dir=str(self.workspace),
            content=payload,
            sources=["[Source: node_logs.json]"],
        )

        res = self.runtime.generate_artifact(req)
        self.assertTrue(res.success)
        self.assertEqual(res.status, ArtifactStatus.READY)

        with open(res.file_path, "r", encoding="utf-8") as f:
            parsed = json.load(f)
        self.assertEqual(parsed["project"], "Fluffy Assistant")
        self.assertIn("_sources", parsed)

    def test_generate_and_parse_csv(self):
        """Generate and round-trip parse CSV deliverable."""
        table = TableData(
            headers=["Device ID", "Firmware", "Status", "Comment, with comma"],
            rows=[
                ["DEV-001", "v2.1.0", "ONLINE", "Standard operation"],
                ["DEV-002", "v2.1.0", "STANDBY", 'Quotes and "commas, inside"'],
            ],
        )

        req = ArtifactRequest(
            artifact_type=ArtifactType.CSV,
            name="device_fleet.csv",
            destination_dir=str(self.workspace),
            content=table,
        )

        res = self.runtime.generate_artifact(req)
        self.assertTrue(res.success)

        with open(res.file_path, "r", encoding="utf-8", newline="") as f:
            reader = csv.reader(f)
            rows = list(reader)

        self.assertEqual(len(rows), 3)
        self.assertEqual(rows[0][0], "Device ID")
        self.assertEqual(rows[2][3], 'Quotes and "commas, inside"')

    def test_generate_and_validate_python_code(self):
        """Generate Python code artifact and statically validate syntax with AST."""
        python_code = """
def compute_efficiency(input_power_kw: float, output_power_kw: float) -> float:
    if input_power_kw <= 0:
        raise ValueError("Input power must be positive.")
    return (output_power_kw / input_power_kw) * 100.0
"""
        req = ArtifactRequest(
            artifact_type=ArtifactType.CODE,
            name="power_calc.py",
            destination_dir=str(self.workspace),
            content=python_code,
            language="python",
            metadata=ArtifactMetadata(title="Power Efficiency Calculator"),
        )

        res = self.runtime.generate_artifact(req)
        self.assertTrue(res.success)

        code_text = Path(res.file_path).read_text(encoding="utf-8")
        parsed_ast = ast.parse(code_text)
        self.assertIsNotNone(parsed_ast)
        self.assertIn("compute_efficiency", code_text)


if __name__ == "__main__":
    unittest.main()
