"""
DOCX Artifact Validator
Validates Word deliverables by verifying Office Open XML zip structure and document.xml integrity.
"""

import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

from brain.artifacts.definitions import ArtifactType
from brain.artifacts.validators.interface import ArtifactValidator


class DOCXValidator(ArtifactValidator):
    """
    Validates DOCX files by ensuring valid Office Open XML ZIP structure and parseable document.xml.
    """

    def supports(self, artifact_type: ArtifactType) -> bool:
        return artifact_type == ArtifactType.DOCX

    def validate(self, file_path: Path) -> bool:
        if not file_path.exists() or file_path.stat().st_size == 0:
            return False

        try:
            with zipfile.ZipFile(file_path, "r") as zf:
                namelist = zf.namelist()
                if "[Content_Types].xml" not in namelist:
                    return False
                if "word/document.xml" not in namelist:
                    return False

                # Parse document.xml to ensure well-formed XML
                doc_xml = zf.read("word/document.xml")
                root = ET.fromstring(doc_xml)
                if not root.tag.endswith("document"):
                    return False

            return True
        except Exception:
            return False
