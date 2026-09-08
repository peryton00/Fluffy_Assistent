"""
Multimodal Runtime Facade
Central orchestration facade for local OCR, vision models, image ingestion, and health diagnostics.
"""

import time
from pathlib import Path
from typing import Optional, Union, List, Dict, Any
from PIL import Image

from brain.multimodal.definitions import (
    MultimodalHealthStatus,
    MultimodalMediaType,
    ExtractionMethod,
    ExtractionQuality,
)
from brain.multimodal.config import MultimodalConfig
from brain.multimodal.health import MultimodalHealth
from brain.multimodal.models import (
    OCRRequest,
    OCRResult,
    VisionRequest,
    VisionResult,
    MultimodalDocument,
    MultimodalPage,
    ExtractionMetadata,
)
from brain.multimodal.ocr.interface import OCRProvider
from brain.multimodal.ocr.provider import OCRProviderRegistry, get_ocr_registry
from brain.multimodal.vision.interface import VisionProvider
from brain.multimodal.vision.provider import VisionProviderRegistry, get_vision_registry
from brain.multimodal.documents.page import PDFPageExtractor
from brain.multimodal.documents.layout import LayoutAssembler
from brain.multimodal.adapters.knowledge import MultimodalKnowledgeAdapter
from brain.knowledge.documents import ParsedDocument


class MultimodalRuntime:
    """
    Central local-first Multimodal Runtime for Fluffy Assistant.
    Provides local OCR, vision understanding, and seamless ingestion into Knowledge & RAG.
    """

    def __init__(
        self,
        config: Optional[MultimodalConfig] = None,
        ocr_registry: Optional[OCRProviderRegistry] = None,
        vision_registry: Optional[VisionProviderRegistry] = None,
    ):
        self.config = config or MultimodalConfig()
        self.ocr_registry = ocr_registry or get_ocr_registry()
        self.vision_registry = vision_registry or get_vision_registry()

    def get_active_ocr_provider(self) -> Optional[OCRProvider]:
        """Return the active local OCR provider."""
        return self.ocr_registry.get_active_provider()

    def get_active_vision_provider(self) -> Optional[VisionProvider]:
        """Return the active local vision provider."""
        return self.vision_registry.get_active_provider()

    def extract_ocr(
        self,
        file_path: Union[str, Path],
        language: Optional[str] = None,
        timeout_seconds: Optional[float] = None,
    ) -> OCRResult:
        """Execute local OCR extraction on an image file."""
        provider = self.get_active_ocr_provider()
        if not provider or not provider.is_available:
            return OCRResult(
                success=False,
                error="Local OCR engine unavailable (Tesseract binary not installed/found)",
                provider_name="none",
                method=ExtractionMethod.UNAVAILABLE,
                quality=ExtractionQuality.UNAVAILABLE,
            )

        req = OCRRequest(
            file_path=str(file_path),
            language=language or self.config.default_language,
            timeout_seconds=timeout_seconds or self.config.ocr_timeout_seconds,
        )
        return provider.extract(req)

    def analyze_image(
        self,
        image_path: Union[str, Path],
        prompt: Optional[str] = None,
        task: str = "describe",
    ) -> VisionResult:
        """Execute local vision analysis using on-device vision model."""
        provider = self.get_active_vision_provider()
        if not provider or not provider.is_available:
            return VisionResult(
                success=False,
                error="Local vision model unavailable (no vision model loaded in AI Runtime)",
                provider_name="none",
            )

        req = VisionRequest(
            image_path=str(image_path),
            prompt=prompt,
            task=task,
            timeout_seconds=self.config.vision_timeout_seconds,
        )
        return provider.analyze(req)

    def process_scanned_pdf(self, pdf_path: Union[str, Path]) -> ParsedDocument:
        """
        Process a scanned PDF file with 0 extractable text:
        1. Extracts page images from PDF streams.
        2. Executes local OCR per page.
        3. Structures into ParsedDocument with page provenance.
        """
        path = Path(pdf_path).resolve()
        provider = self.get_active_ocr_provider()

        if not provider or not provider.is_available:
            return ParsedDocument(
                raw_text="",
                sections=[],
                ocr_required=True,
                error="Local OCR provider unavailable for scanned PDF processing",
            )

        # Extract raster page images
        page_images = PDFPageExtractor.extract_images_from_pdf(path, max_pages=self.config.max_pages)
        if not page_images:
            return ParsedDocument(
                raw_text="",
                sections=[],
                ocr_required=True,
                error="No extractable page image streams found in scanned PDF",
            )

        m_pages: List[MultimodalPage] = []
        import tempfile

        with tempfile.TemporaryDirectory() as tmpdir:
            for page_num, img in page_images:
                tmp_page_path = Path(tmpdir) / f"page_{page_num}.png"
                img.save(tmp_page_path, format="PNG")

                req = OCRRequest(
                    file_path=str(tmp_page_path),
                    language=self.config.default_language,
                    timeout_seconds=self.config.ocr_timeout_seconds,
                )
                res = provider.extract(req)
                if res.success and res.document and res.document.pages:
                    for p in res.document.pages:
                        p.page_number = page_num
                        m_pages.append(p)
                else:
                    # Page OCR failed / empty
                    m_pages.append(MultimodalPage(page_number=page_num, raw_text=""))

        m_doc = MultimodalDocument(
            document_id=f"scanned_pdf_{path.stem}",
            source_path=str(path),
            media_type=MultimodalMediaType.PDF_SCANNED,
            pages=m_pages,
            page_count=len(m_pages),
        )

        return MultimodalKnowledgeAdapter.to_parsed_document(m_doc)

    def check_health(self) -> MultimodalHealth:
        """Perform diagnostic health check across OCR and Vision subsystems."""
        ocr_prov = self.get_active_ocr_provider()
        vision_prov = self.get_active_vision_provider()

        ocr_avail = ocr_prov.is_available if ocr_prov else False
        ocr_name = ocr_prov.name if ocr_prov else "none"

        vision_avail = vision_prov.is_available if vision_prov else False
        vision_name = vision_prov.name if vision_prov else "none"

        if ocr_avail and vision_avail:
            status = MultimodalHealthStatus.AVAILABLE
        elif ocr_avail or vision_avail:
            status = MultimodalHealthStatus.DEGRADED
        else:
            status = MultimodalHealthStatus.UNAVAILABLE

        return MultimodalHealth(
            status=status,
            ocr_available=ocr_avail,
            ocr_provider_name=ocr_name,
            vision_available=vision_avail,
            vision_provider_name=vision_name,
            supported_formats=self.config.allowed_extensions,
            is_offline_compliant=True,
            last_checked=time.time(),
            diagnostics={
                "max_image_dimension": self.config.max_image_dimension,
                "max_pages": self.config.max_pages,
                "ocr_timeout_seconds": self.config.ocr_timeout_seconds,
            },
        )


# Global singleton
_global_multimodal_runtime: Optional[MultimodalRuntime] = None


def get_multimodal_runtime() -> MultimodalRuntime:
    """Retrieve global MultimodalRuntime singleton."""
    global _global_multimodal_runtime
    if _global_multimodal_runtime is None:
        _global_multimodal_runtime = MultimodalRuntime()
    return _global_multimodal_runtime
