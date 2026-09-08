"""
Text and Plain Document Generator
Generates clean UTF-8 text deliverables.
"""

from typing import List
from pathlib import Path

from brain.artifacts.definitions import ArtifactType
from brain.artifacts.requests import ArtifactRequest
from brain.artifacts.generators.interface import ArtifactGenerator


class TextArtifactGenerator(ArtifactGenerator):
    """Generates plain text (.txt) deliverables."""

    @property
    def name(self) -> str:
        return "text_generator"

    @property
    def supported_types(self) -> List[ArtifactType]:
        return [ArtifactType.TXT]

    @property
    def is_available(self) -> bool:
        return True

    def supports(self, artifact_type: ArtifactType) -> bool:
        return artifact_type == ArtifactType.TXT

    def generate_to_path(self, request: ArtifactRequest, target_path: Path) -> None:
        content = request.content
        if isinstance(content, (dict, list)):
            import json
            text_data = json.dumps(content, indent=2, ensure_ascii=False)
        else:
            text_data = str(content)

        # Include basic provenance header if citations exist
        header_lines: List[str] = []
        if request.sources:
            header_lines.append("# Sources & Provenance:")
            for s in request.sources:
                header_lines.append(f"# - {s}")
            header_lines.append("")

        full_text = "\n".join(header_lines) + text_data if header_lines else text_data

        target_path.write_text(full_text, encoding="utf-8")
