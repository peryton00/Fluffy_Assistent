"""
Markdown Artifact Generator
Generates formatted Markdown (.md) documents with headings, bullet lists, tables, and provenance metadata.
"""

from typing import List, Dict, Any
from pathlib import Path

from brain.artifacts.definitions import ArtifactType
from brain.artifacts.requests import ArtifactRequest
from brain.artifacts.models import DocumentSectionData, TableData
from brain.artifacts.generators.interface import ArtifactGenerator


class MarkdownArtifactGenerator(ArtifactGenerator):
    """Generates structured Markdown deliverables."""

    @property
    def name(self) -> str:
        return "markdown_generator"

    @property
    def supported_types(self) -> List[ArtifactType]:
        return [ArtifactType.MARKDOWN]

    @property
    def is_available(self) -> bool:
        return True

    def supports(self, artifact_type: ArtifactType) -> bool:
        return artifact_type == ArtifactType.MARKDOWN

    def generate_to_path(self, request: ArtifactRequest, target_path: Path) -> None:
        lines: List[str] = []

        # 1. Document Title
        title = (request.metadata.title if request.metadata else None) or request.name.replace(".md", "").replace("_", " ").title()
        lines.append(f"# {title}\n")

        # 2. Metadata / Provenance Header
        if request.metadata and request.metadata.description:
            lines.append(f"> {request.metadata.description}\n")

        if request.sources:
            lines.append("### Sources & Citations")
            for s in request.sources:
                lines.append(f"- {s}")
            lines.append("")

        # 3. Content rendering
        content = request.content
        if isinstance(content, str):
            lines.append(content)
        elif isinstance(content, list):
            for item in content:
                if isinstance(item, DocumentSectionData):
                    hashes = "#" * max(1, min(item.level + 1, 6))
                    lines.append(f"{hashes} {item.heading}\n")
                    if item.text:
                        lines.append(f"{item.text}\n")
                    if item.bullet_points:
                        for bp in item.bullet_points:
                            lines.append(f"- {bp}")
                        lines.append("")
                    if item.table:
                        lines.append(self._render_table(item.table))
                elif isinstance(item, dict):
                    h_text = item.get("heading", "")
                    if h_text:
                        lvl = item.get("level", 1)
                        hashes = "#" * max(1, min(lvl + 1, 6))
                        lines.append(f"{hashes} {h_text}\n")
                    txt = item.get("text", "")
                    if txt:
                        lines.append(f"{txt}\n")
                    bps = item.get("bullet_points", [])
                    for bp in bps:
                        lines.append(f"- {bp}")
                    if bps:
                        lines.append("")
        elif isinstance(content, dict):
            sections = content.get("sections", [])
            for sec in sections:
                h_text = sec.get("heading", "")
                if h_text:
                    lvl = sec.get("level", 1)
                    hashes = "#" * max(1, min(lvl + 1, 6))
                    lines.append(f"{hashes} {h_text}\n")
                txt = sec.get("text", "")
                if txt:
                    lines.append(f"{txt}\n")
                bps = sec.get("bullet_points", [])
                for bp in bps:
                    lines.append(f"- {bp}")
                if bps:
                    lines.append("")
                tbl = sec.get("table")
                if tbl and isinstance(tbl, dict):
                    t_data = TableData(headers=tbl.get("headers", []), rows=tbl.get("rows", []))
                    lines.append(self._render_table(t_data))

        target_path.write_text("\n".join(lines).strip() + "\n", encoding="utf-8")

    def _render_table(self, table: TableData) -> str:
        if not table.headers and not table.rows:
            return ""
        t_lines: List[str] = []
        if table.headers:
            t_lines.append("| " + " | ".join(str(h) for h in table.headers) + " |")
            t_lines.append("| " + " | ".join(["---"] * len(table.headers)) + " |")
        for row in table.rows:
            t_lines.append("| " + " | ".join(str(c) for c in row) + " |")
        t_lines.append("")
        return "\n".join(t_lines)
