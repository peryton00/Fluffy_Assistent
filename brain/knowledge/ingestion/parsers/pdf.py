"""
Pure-Python Text PDF Document Parser
Extracts text streams and page metadata from PDF files without cloud APIs or heavy C dependencies.
Explicitly detects when a PDF has 0 text layer and flags it as OCR_REQUIRED.
"""

from pathlib import Path
from typing import Union, List, Optional
import re
import zlib

from brain.knowledge.definitions import DocumentMimeType
from brain.knowledge.documents import ParsedDocument, ParsedSection
from brain.knowledge.ingestion.interface import DocumentParser


class PDFDocumentParser(DocumentParser):
    """
    Parses text-bearing PDF documents using pure-Python stream decompression and operator parsing.
    Reports OCR_REQUIRED when scanned/raster images with no text layer are detected.
    """

    @property
    def name(self) -> str:
        return "pdf_parser"

    @property
    def supported_mime_types(self) -> List[DocumentMimeType]:
        return [DocumentMimeType.PDF]

    @property
    def supported_extensions(self) -> List[str]:
        return [".pdf"]

    def supports(self, file_path: Union[str, Path]) -> bool:
        return Path(file_path).suffix.lower() == ".pdf"

    def _extract_stream_text(self, stream_bytes: bytes) -> str:
        """Extract readable text from a decompressed PDF content stream."""
        text_fragments: List[str] = []

        # Find all BT ... ET (Begin Text ... End Text) blocks
        bt_blocks = re.findall(rb"BT\s*(.*?)\s*ET", stream_bytes, re.DOTALL)
        for block in bt_blocks:
            # 1. Match Tj operators: (some text) Tj
            tj_matches = re.findall(rb"\((.*?)\)\s*Tj", block, re.DOTALL)
            for m in tj_matches:
                try:
                    text_fragments.append(m.decode("latin-1", errors="ignore"))
                except Exception:
                    pass

            # 2. Match TJ array operators: [(some) 20 (text)] TJ
            tj_array_matches = re.findall(rb"\[(.*?)\]\s*TJ", block, re.DOTALL)
            for arr in tj_array_matches:
                inner_strings = re.findall(rb"\((.*?)\)", arr, re.DOTALL)
                for s in inner_strings:
                    try:
                        text_fragments.append(s.decode("latin-1", errors="ignore"))
                    except Exception:
                        pass

            # 3. Match hex strings: <48656c6c6f> Tj
            hex_matches = re.findall(rb"<([0-9a-fA-F]+)>\s*Tj", block)
            for h in hex_matches:
                try:
                    text_fragments.append(bytes.fromhex(h.decode("ascii")).decode("latin-1", errors="ignore"))
                except Exception:
                    pass

        raw = " ".join(text_fragments)
        # Normalize whitespace and unescape PDF escapes \( \) \\
        cleaned = raw.replace(r"\(", "(").replace(r"\)", ")").replace(r"\\", "\\")
        cleaned = re.sub(r"\s+", " ", cleaned).strip()
        return cleaned

    def parse(self, file_path: Union[str, Path]) -> ParsedDocument:
        path = Path(file_path)
        try:
            with open(path, "rb") as f:
                data = f.read()

            if not data.startswith(b"%PDF"):
                return ParsedDocument(
                    raw_text="",
                    sections=[],
                    error="Invalid PDF header: missing %PDF identifier",
                )

            # Locate all streams and attempt decompression
            # Streams are bounded by `stream\r?\n` and `endstream`
            stream_pattern = re.compile(rb"stream[\r\n]+(.*?)[\r\n]+endstream", re.DOTALL)
            stream_matches = stream_pattern.findall(data)

            extracted_page_texts: List[str] = []
            for stream_raw in stream_matches:
                decompressed = None
                # Try raw or zlib decompress
                try:
                    decompressed = zlib.decompress(stream_raw)
                except Exception:
                    try:
                        decompressed = zlib.decompress(stream_raw, -15)
                    except Exception:
                        decompressed = stream_raw

                if decompressed and b"BT" in decompressed and b"ET" in decompressed:
                    page_text = self._extract_stream_text(decompressed)
                    if page_text:
                        extracted_page_texts.append(page_text)

            # Also check for uncompressed text blocks in entire data as fallback
            if not extracted_page_texts and b"BT" in data and b"ET" in data:
                fallback_text = self._extract_stream_text(data)
                if fallback_text:
                    extracted_page_texts.append(fallback_text)

            # Approximate page count from /Type /Page objects
            page_obj_matches = re.findall(rb"/Type\s*/Page\b", data)
            detected_page_count = max(len(page_obj_matches), len(extracted_page_texts), 1)

            total_chars = sum(len(t) for t in extracted_page_texts)

            # If 0 text characters found, attempt local multimodal OCR before falling back to OCR_REQUIRED
            if total_chars == 0:
                try:
                    from brain.multimodal.runtime import get_multimodal_runtime
                    ocr_parsed = get_multimodal_runtime().process_scanned_pdf(path)
                    if not ocr_parsed.ocr_required and ocr_parsed.raw_text.strip():
                        return ocr_parsed
                except Exception:
                    pass

                return ParsedDocument(
                    raw_text="",
                    sections=[],
                    page_count=detected_page_count,
                    ocr_required=True,
                    format_metadata={"pages": detected_page_count, "extractable_text_found": False},
                )

            # Build parsed sections per page
            sections: List[ParsedSection] = []
            full_text_pieces: List[str] = []
            current_offset = 0

            for i, p_text in enumerate(extracted_page_texts):
                page_num = i + 1
                full_text_pieces.append(p_text)
                sec_len = len(p_text)
                sections.append(ParsedSection(
                    text=p_text,
                    page_number=page_num,
                    section_title=f"Page {page_num}",
                    start_offset=current_offset,
                    end_offset=current_offset + sec_len,
                ))
                current_offset += sec_len + 2

            raw_text = "\n\n".join(full_text_pieces)

            return ParsedDocument(
                raw_text=raw_text,
                sections=sections,
                page_count=detected_page_count,
                ocr_required=False,
                format_metadata={"pages": detected_page_count, "extractable_text_found": True},
            )

        except Exception as e:
            return ParsedDocument(
                raw_text="",
                sections=[],
                error=f"Failed to parse PDF document: {str(e)}",
            )
