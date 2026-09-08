"""
Code Deliverable Generator
Generates clean source code files (.py, .rs, .js, .ts, .cpp, .java, etc.).
Strictly non-executable: only creates and statically validates source code files; execution is strictly isolated in Sandbox.
"""

from typing import List, Optional
from pathlib import Path

from brain.artifacts.definitions import ArtifactType
from brain.artifacts.requests import ArtifactRequest
from brain.artifacts.generators.interface import ArtifactGenerator


class CodeArtifactGenerator(ArtifactGenerator):
    """Generates source code deliverables with comment headers."""

    @property
    def name(self) -> str:
        return "code_generator"

    @property
    def supported_types(self) -> List[ArtifactType]:
        return [ArtifactType.CODE]

    @property
    def is_available(self) -> bool:
        return True

    def supports(self, artifact_type: ArtifactType) -> bool:
        return artifact_type == ArtifactType.CODE

    def generate_to_path(self, request: ArtifactRequest, target_path: Path) -> None:
        code_body = str(request.content)
        ext = target_path.suffix.lower()

        # Determine comment prefix
        comment_prefix = "//"
        if ext in [".py", ".sh", ".yaml", ".yml"]:
            comment_prefix = "#"
        elif ext in [".sql", ".lua"]:
            comment_prefix = "--"

        header_lines: List[str] = []
        if request.metadata and request.metadata.title:
            header_lines.append(f"{comment_prefix} {request.metadata.title}")

        if request.sources:
            header_lines.append(f"{comment_prefix} Sources & Provenance:")
            for s in request.sources:
                header_lines.append(f"{comment_prefix}   - {s}")

        if header_lines:
            header_lines.append("")

        full_code = "\n".join(header_lines) + code_body if header_lines else code_body

        target_path.write_text(full_code.strip() + "\n", encoding="utf-8")
