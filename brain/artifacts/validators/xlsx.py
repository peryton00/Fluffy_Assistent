"""
XLSX Artifact Validator
Validates Excel deliverables by inspecting Office Open XML zip structures and workbook.xml.
"""

import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

from brain.artifacts.definitions import ArtifactType
from brain.artifacts.validators.interface import ArtifactValidator


class XLSXValidator(ArtifactValidator):
    """
    Validates XLSX workbooks by ensuring valid Open XML ZIP packaging and parseable workbook structure.
    """

    def supports(self, artifact_type: ArtifactType) -> bool:
        return artifact_type == ArtifactType.XLSX

    def validate(self, file_path: Path) -> bool:
        if not file_path.exists() or file_path.stat().st_size == 0:
            return False

        try:
            with zipfile.ZipFile(file_path, "r") as zf:
                namelist = zf.namelist()
                if "[Content_Types].xml" not in namelist:
                    return False
                if "xl/workbook.xml" not in namelist:
                    return False

                # Parse workbook XML
                wb_xml = zf.read("xl/workbook.xml")
                root = ET.fromstring(wb_xml)
                if not root.tag.endswith("workbook"):
                    return False

            return True
        except Exception:
            return False
