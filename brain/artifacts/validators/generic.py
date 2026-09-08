"""
Generic Text, JSON, and CSV Validators
Validates encoding, non-empty content, JSON syntax, and CSV parsing structure.
"""

import json
import csv
from pathlib import Path
from typing import Optional

from brain.artifacts.definitions import ArtifactType
from brain.artifacts.validators.interface import ArtifactValidator


class GenericTextValidator(ArtifactValidator):
    """Validates plain text and Markdown files for UTF-8 integrity and non-zero size."""

    def supports(self, artifact_type: ArtifactType) -> bool:
        return artifact_type in (ArtifactType.TXT, ArtifactType.MARKDOWN)

    def validate(self, file_path: Path) -> bool:
        if not file_path.exists() or file_path.stat().st_size == 0:
            return False
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                content = f.read()
            return len(content) > 0
        except Exception:
            return False


class JSONValidator(ArtifactValidator):
    """Validates JSON deliverables for syntax correctness."""

    def supports(self, artifact_type: ArtifactType) -> bool:
        return artifact_type == ArtifactType.JSON

    def validate(self, file_path: Path) -> bool:
        if not file_path.exists() or file_path.stat().st_size == 0:
            return False
        try:
            with open(file_path, "r", encoding="utf-8") as f:
                json.load(f)
            return True
        except Exception:
            return False


class CSVValidator(ArtifactValidator):
    """Validates CSV deliverables for parseability and row structure."""

    def supports(self, artifact_type: ArtifactType) -> bool:
        return artifact_type == ArtifactType.CSV

    def validate(self, file_path: Path) -> bool:
        if not file_path.exists() or file_path.stat().st_size == 0:
            return False
        try:
            with open(file_path, "r", encoding="utf-8", newline="") as f:
                reader = csv.reader(f)
                rows = list(reader)
            return len(rows) > 0
        except Exception:
            return False
