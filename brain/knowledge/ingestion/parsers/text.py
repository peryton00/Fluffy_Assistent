"""
Plain Text and Structured Text Document Parser
Parses .txt, .md, .markdown, .json, .csv, .yaml, .py, .rs, .html, .log files.
"""

from pathlib import Path
from typing import Union, List
import re

from brain.knowledge.definitions import DocumentMimeType
from brain.knowledge.documents import ParsedDocument, ParsedSection
from brain.knowledge.ingestion.interface import DocumentParser


class TextDocumentParser(DocumentParser):
    """Parses plain text, markdown, and structured text source files."""

    EXTENSIONS = [
        ".txt", ".md", ".markdown", ".json", ".csv",
        ".log", ".yaml", ".yml", ".py", ".rs", ".js",
        ".ts", ".html", ".css", ".xml", ".ini", ".conf",
    ]

    @property
    def name(self) -> str:
        return "text_parser"

    @property
    def supported_mime_types(self) -> List[DocumentMimeType]:
        return [DocumentMimeType.TEXT, DocumentMimeType.MARKDOWN, DocumentMimeType.JSON, DocumentMimeType.CSV, DocumentMimeType.CODE]

    @property
    def supported_extensions(self) -> List[str]:
        return self.EXTENSIONS

    def supports(self, file_path: Union[str, Path]) -> bool:
        ext = Path(file_path).suffix.lower()
        return ext in self.EXTENSIONS

    def parse(self, file_path: Union[str, Path]) -> ParsedDocument:
        path = Path(file_path)
        try:
            # Read text with fallback encodings
            raw_content = ""
            for enc in ["utf-8", "utf-8-sig", "latin-1", "cp1252"]:
                try:
                    with open(path, "r", encoding=enc) as f:
                        raw_content = f.read()
                    break
                except UnicodeDecodeError:
                    continue

            if not raw_content:
                # If file is empty
                return ParsedDocument(raw_text="", sections=[], page_count=1)

            # Segment into sections by markdown headings or blank line paragraphs
            sections: List[ParsedSection] = []
            paragraphs = re.split(r"\n\s*\n", raw_content)
            current_offset = 0
            current_heading: str = "General"

            for para in paragraphs:
                cleaned = para.strip()
                if not cleaned:
                    current_offset += len(para) + 2
                    continue

                # Check if paragraph begins with a markdown header (# Heading)
                lines = cleaned.split("\n")
                first_line = lines[0].strip()
                if first_line.startswith("#"):
                    current_heading = first_line.lstrip("#").strip()

                sec_len = len(cleaned)
                sections.append(ParsedSection(
                    text=cleaned,
                    page_number=1,
                    section_title=current_heading,
                    start_offset=current_offset,
                    end_offset=current_offset + sec_len,
                ))
                current_offset += len(para) + 2

            return ParsedDocument(
                raw_text=raw_content,
                sections=sections,
                page_count=1,
                format_metadata={"line_count": len(raw_content.splitlines()), "char_count": len(raw_content)},
            )

        except Exception as e:
            return ParsedDocument(
                raw_text="",
                sections=[],
                error=f"Failed to parse text document: {str(e)}",
            )
