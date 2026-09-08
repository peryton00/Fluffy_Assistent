"""
Knowledge Subsystem Adapter
Converts Multimodal extracted structures into Phase 2F ParsedDocument entities and provides DocumentParser for images.
"""

from pathlib import Path
from typing import Union, List, Optional

from brain.knowledge.definitions import DocumentMimeType
from brain.knowledge.documents import ParsedDocument, ParsedSection
from brain.knowledge.ingestion.interface import DocumentParser
from brain.multimodal.models import MultimodalDocument, MultimodalPage
from brain.multimodal.documents.image import ImageDocumentParser
from brain.multimodal.ocr.interface import OCRProvider


class MultimodalKnowledgeAdapter:
    """
    Translates MultimodalDocument representations into standard Phase 2F ParsedDocument structures.
    """

    @classmethod
    def to_parsed_document(cls, m_doc: MultimodalDocument) -> ParsedDocument:
        if m_doc.error:
            # If error is due to OCR unavailability, indicate OCR_REQUIRED or error
            return ParsedDocument(
                raw_text="",
                sections=[],
                page_count=m_doc.page_count,
                ocr_required=True,
                error=m_doc.error,
                format_metadata={
                    "media_type": m_doc.media_type.value,
                    "engine": m_doc.metadata.engine_name if m_doc.metadata else "none",
                },
            )

        sections: List[ParsedSection] = []
        full_text_pieces: List[str] = []
        current_offset = 0

        for page in m_doc.pages:
            p_text = page.raw_text.strip()
            if not p_text:
                continue

            full_text_pieces.append(p_text)
            sec_len = len(p_text)
            sections.append(
                ParsedSection(
                    text=p_text,
                    page_number=page.page_number,
                    section_title=f"Page {page.page_number}",
                    start_offset=current_offset,
                    end_offset=current_offset + sec_len,
                )
            )
            current_offset += sec_len + 2

        raw_text = "\n\n".join(full_text_pieces)

        if not raw_text:
            return ParsedDocument(
                raw_text="",
                sections=[],
                page_count=m_doc.page_count,
                ocr_required=True,
                format_metadata={"media_type": m_doc.media_type.value, "extractable_text_found": False},
            )

        return ParsedDocument(
            raw_text=raw_text,
            sections=sections,
            page_count=max(m_doc.page_count, len(sections), 1),
            ocr_required=False,
            format_metadata={
                "media_type": m_doc.media_type.value,
                "extractable_text_found": True,
                "engine": m_doc.metadata.engine_name if m_doc.metadata else "unknown",
            },
        )


class MultimodalImageDocumentParser(DocumentParser):
    """
    DocumentParser plugin for Phase 2F IngestionManager supporting image files.
    """

    def __init__(self, ocr_provider: Optional[OCRProvider] = None):
        self._image_parser = ImageDocumentParser(ocr_provider=ocr_provider)

    @property
    def name(self) -> str:
        return "multimodal_image_parser"

    @property
    def supported_mime_types(self) -> List[DocumentMimeType]:
        return [DocumentMimeType.UNKNOWN]

    @property
    def supported_extensions(self) -> List[str]:
        return [".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tiff"]

    def supports(self, file_path: Union[str, Path]) -> bool:
        return Path(file_path).suffix.lower() in self.supported_extensions

    def parse(self, file_path: Union[str, Path]) -> ParsedDocument:
        m_doc = self._image_parser.parse_image(file_path)
        return MultimodalKnowledgeAdapter.to_parsed_document(m_doc)
