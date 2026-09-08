"""
PPTX Artifact Validator
Validates PowerPoint presentation deliverables via python-pptx presentation inspection or Open XML zip validation.
"""

import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

from brain.artifacts.definitions import ArtifactType
from brain.artifacts.validators.interface import ArtifactValidator


class PPTXValidator(ArtifactValidator):
    """
    Validates PPTX presentations by verifying Open XML zip packaging and presentation.xml parsing.
    """

    def supports(self, artifact_type: ArtifactType) -> bool:
        return artifact_type == ArtifactType.PPTX

    def validate(self, file_path: Path) -> bool:
        if not file_path.exists() or file_path.stat().st_size == 0:
            return False

        # 1. Attempt reopening with python-pptx if installed
        try:
            from pptx import Presentation
            prs = Presentation(str(file_path))
            if len(prs.slides) >= 0:
                return True
        except ImportError:
            pass
        except Exception:
            return False

        # 2. Open XML ZIP verification fallback
        try:
            with zipfile.ZipFile(file_path, "r") as zf:
                namelist = zf.namelist()
                if "[Content_Types].xml" not in namelist:
                    return False
                if "ppt/presentation.xml" not in namelist:
                    return False

                # Parse presentation XML
                pres_xml = zf.read("ppt/presentation.xml")
                root = ET.fromstring(pres_xml)
                if not root.tag.endswith("presentation"):
                    return False

            return True
        except Exception:
            return False
