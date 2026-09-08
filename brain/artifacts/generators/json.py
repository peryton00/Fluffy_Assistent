"""
JSON and CSV Deliverable Generators
Generates standards-compliant JSON and CSV files with deterministic formatting and quoting.
"""

import json
import csv
from pathlib import Path
from typing import List, Dict, Any, Union

from brain.artifacts.definitions import ArtifactType
from brain.artifacts.requests import ArtifactRequest
from brain.artifacts.models import TableData
from brain.artifacts.generators.interface import ArtifactGenerator


class JSONArtifactGenerator(ArtifactGenerator):
    """Generates structured JSON deliverables."""

    @property
    def name(self) -> str:
        return "json_generator"

    @property
    def supported_types(self) -> List[ArtifactType]:
        return [ArtifactType.JSON]

    @property
    def is_available(self) -> bool:
        return True

    def supports(self, artifact_type: ArtifactType) -> bool:
        return artifact_type == ArtifactType.JSON

    def generate_to_path(self, request: ArtifactRequest, target_path: Path) -> None:
        content = request.content
        if isinstance(content, str):
            # Parse to ensure valid JSON before writing
            data = json.loads(content)
        else:
            data = content

        payload: Dict[str, Any] = {}
        if isinstance(data, dict):
            payload = data.copy()
            if request.sources and "_sources" not in payload:
                payload["_sources"] = request.sources
        else:
            payload = {"data": data}
            if request.sources:
                payload["_sources"] = request.sources

        target_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False, sort_keys=True) + "\n", encoding="utf-8")


class CSVArtifactGenerator(ArtifactGenerator):
    """Generates CSV tabular deliverables."""

    @property
    def name(self) -> str:
        return "csv_generator"

    @property
    def supported_types(self) -> List[ArtifactType]:
        return [ArtifactType.CSV]

    @property
    def is_available(self) -> bool:
        return True

    def supports(self, artifact_type: ArtifactType) -> bool:
        return artifact_type == ArtifactType.CSV

    def generate_to_path(self, request: ArtifactRequest, target_path: Path) -> None:
        content = request.content
        headers: List[str] = []
        rows: List[List[Any]] = []

        if isinstance(content, TableData):
            headers = content.headers
            rows = content.rows
        elif isinstance(content, dict):
            headers = content.get("headers", [])
            rows = content.get("rows", [])
        elif isinstance(content, list):
            if content and isinstance(content[0], dict):
                # List of dicts -> extract keys as headers
                headers = list(content[0].keys())
                for item in content:
                    rows.append([item.get(k, "") for k in headers])
            elif content and isinstance(content[0], list):
                # First list row can be header if not specified
                headers = [str(c) for c in content[0]]
                rows = content[1:]
        elif isinstance(content, str):
            # Already formatted CSV string -> write directly
            target_path.write_text(content.strip() + "\n", encoding="utf-8")
            return

        with open(target_path, "w", encoding="utf-8", newline="") as f:
            writer = csv.writer(f, quoting=csv.QUOTE_MINIMAL)
            if headers:
                writer.writerow(headers)
            for r in rows:
                writer.writerow(r)
