"""
Pure-Python DOCX Document Parser
Extracts paragraphs, headings, and table contents from Microsoft Word (.docx) files
using standard library zipfile and XML parsing without external dependencies.
"""

from pathlib import Path
from typing import Union, List, Optional, Dict, Any
import zipfile
import xml.etree.ElementTree as ET

from brain.knowledge.definitions import DocumentMimeType
from brain.knowledge.documents import ParsedDocument, ParsedSection
from brain.knowledge.ingestion.interface import DocumentParser


class DOCXDocumentParser(DocumentParser):
    """
    Parses .docx files by reading the internal OpenXML 'word/document.xml' structure.
    Preserves headings, paragraphs, and table text.
    """

    WORD_NS = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"

    @property
    def name(self) -> str:
        return "docx_parser"

    @property
    def supported_mime_types(self) -> List[DocumentMimeType]:
        return [DocumentMimeType.DOCX]

    @property
    def supported_extensions(self) -> List[str]:
        return [".docx"]

    def supports(self, file_path: Union[str, Path]) -> bool:
        return Path(file_path).suffix.lower() == ".docx"

    def parse(self, file_path: Union[str, Path]) -> ParsedDocument:
        path = Path(file_path)
        try:
            if not zipfile.is_zipfile(path):
                return ParsedDocument(
                    raw_text="",
                    sections=[],
                    error="File is not a valid DOCX zip archive",
                )

            with zipfile.ZipFile(path, "r") as docx_zip:
                if "word/document.xml" not in docx_zip.namelist():
                    return ParsedDocument(
                        raw_text="",
                        sections=[],
                        error="Missing 'word/document.xml' in DOCX archive",
                    )

                xml_content = docx_zip.read("word/document.xml")

            tree = ET.fromstring(xml_content)
            body = tree.find(f"{self.WORD_NS}body")
            if body is None:
                return ParsedDocument(raw_text="", sections=[], page_count=1)

            sections: List[ParsedSection] = []
            full_text_pieces: List[str] = []
            current_heading = "General"
            current_offset = 0

            for child in body:
                tag = child.tag

                # 1. Paragraphs
                if tag == f"{self.WORD_NS}p":
                    # Check for style / heading
                    p_style = child.find(f"{self.WORD_NS}pPr/{self.WORD_NS}pStyle")
                    if p_style is not None:
                        val = p_style.attrib.get(f"{self.WORD_NS}val", "")
                        if "heading" in val.lower():
                            current_heading = val

                    # Extract all text in paragraph runs
                    text_runs = [node.text for node in child.iter(f"{self.WORD_NS}t") if node.text]
                    para_text = "".join(text_runs).strip()

                    if para_text:
                        full_text_pieces.append(para_text)
                        sec_len = len(para_text)
                        sections.append(ParsedSection(
                            text=para_text,
                            page_number=1,
                            section_title=current_heading,
                            start_offset=current_offset,
                            end_offset=current_offset + sec_len,
                        ))
                        current_offset += sec_len + 2

                # 2. Tables
                elif tag == f"{self.WORD_NS}tbl":
                    table_rows: List[str] = []
                    for row in child.findall(f"{self.WORD_NS}tr"):
                        row_cells: List[str] = []
                        for cell in row.findall(f"{self.WORD_NS}tc"):
                            cell_text = "".join(node.text for node in cell.iter(f"{self.WORD_NS}t") if node.text).strip()
                            row_cells.append(cell_text)
                        table_rows.append(" | ".join(row_cells))

                    table_text = "\n".join(table_rows).strip()
                    if table_text:
                        full_text_pieces.append(table_text)
                        sec_len = len(table_text)
                        sections.append(ParsedSection(
                            text=table_text,
                            page_number=1,
                            section_title=f"{current_heading} (Table)",
                            start_offset=current_offset,
                            end_offset=current_offset + sec_len,
                        ))
                        current_offset += sec_len + 2

            raw_text = "\n\n".join(full_text_pieces)

            return ParsedDocument(
                raw_text=raw_text,
                sections=sections,
                page_count=1,
                ocr_required=False,
                format_metadata={"paragraphs": len(sections), "char_count": len(raw_text)},
            )

        except Exception as e:
            return ParsedDocument(
                raw_text="",
                sections=[],
                error=f"Failed to parse DOCX document: {str(e)}",
            )
