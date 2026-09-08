"""
Image Document Parser
Processes standalone image files into MultimodalDocuments via OCR and Vision pipelines.
"""

from pathlib import Path
from typing import Optional, Union
from PIL import Image

from brain.multimodal.definitions import MultimodalMediaType, ExtractionMethod, ExtractionQuality
from brain.multimodal.models import MultimodalDocument, OCRRequest
from brain.multimodal.ocr.interface import OCRProvider
from brain.multimodal.ocr.provider import get_ocr_registry
from brain.multimodal.documents.layout import LayoutAssembler


class ImageDocumentParser:
    """
    Parses standalone image documents (.png, .jpg, .webp, .bmp, .tiff) using available OCR engines.
    """

    def __init__(self, ocr_provider: Optional[OCRProvider] = None):
        self._ocr_provider = ocr_provider

    def _get_provider(self) -> Optional[OCRProvider]:
        if self._ocr_provider:
            return self._ocr_provider
        return get_ocr_registry().get_active_provider()

    def parse_image(self, file_path: Union[str, Path]) -> MultimodalDocument:
        p = Path(file_path).resolve()
        ext = p.suffix.lower()

        media_type = MultimodalMediaType.UNKNOWN
        if ext == ".png":
            media_type = MultimodalMediaType.IMAGE_PNG
        elif ext in [".jpg", ".jpeg"]:
            media_type = MultimodalMediaType.IMAGE_JPEG
        elif ext == ".webp":
            media_type = MultimodalMediaType.IMAGE_WEBP
        elif ext == ".bmp":
            media_type = MultimodalMediaType.IMAGE_BMP
        elif ext == ".tiff":
            media_type = MultimodalMediaType.IMAGE_TIFF

        provider = self._get_provider()
        if not provider or not provider.is_available:
            return MultimodalDocument(
                document_id=f"img_{p.stem}",
                source_path=str(p),
                media_type=media_type,
                pages=[],
                page_count=1,
                full_text="",
                error="Local OCR engine unavailable (Tesseract not installed/found)",
            )

        req = OCRRequest(file_path=str(p))
        ocr_res = provider.extract(req)

        if not ocr_res.success or not ocr_res.document:
            return MultimodalDocument(
                document_id=f"img_{p.stem}",
                source_path=str(p),
                media_type=media_type,
                pages=[],
                page_count=1,
                full_text="",
                error=ocr_res.error or "Failed to extract text from image",
            )

        doc = ocr_res.document
        doc.media_type = media_type

        # Re-assemble text via LayoutAssembler across all pages
        full_pieces = []
        for page in doc.pages:
            assembled = LayoutAssembler.assemble_page_text(page)
            if assembled:
                page.raw_text = assembled
                full_pieces.append(assembled)

        doc.full_text = "\n\n".join(full_pieces)
        return doc
