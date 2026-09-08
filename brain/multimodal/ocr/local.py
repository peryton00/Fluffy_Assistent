"""
Local OCR Providers
Production-grade local OCR engine integration (Tesseract CLI discovery, layout extraction) and test-only deterministic provider.
"""

import os
import shutil
import subprocess
import tempfile
import time
from pathlib import Path
from typing import Optional, List, Dict, Any
from PIL import Image

from brain.multimodal.definitions import (
    MultimodalMediaType,
    ExtractionMethod,
    ExtractionQuality,
    RegionType,
    MultimodalHealthStatus,
)
from brain.multimodal.models import (
    BoundingBox,
    TextRegion,
    TableRegion,
    DrawingRegion,
    ExtractionMetadata,
    MultimodalPage,
    MultimodalDocument,
    OCRRequest,
    OCRResult,
)
from brain.multimodal.ocr.interface import OCRProvider
from brain.multimodal.ocr.preprocessing import ImagePreprocessorPipeline


class LocalOCRProvider(OCRProvider):
    """
    Production-grade local OCR provider that interfaces with locally installed OCR runtimes (e.g., Tesseract).
    Strictly offline: never makes network requests or cloud calls.
    Returns explicit UNAVAILABLE status when no local engine is found.
    """

    KNOWN_TESSERACT_PATHS = [
        r"C:\Program Files\Tesseract-OCR\tesseract.exe",
        r"C:\Program Files (x86)\Tesseract-OCR\tesseract.exe",
        r"/usr/bin/tesseract",
        r"/usr/local/bin/tesseract",
        r"/opt/homebrew/bin/tesseract",
    ]

    def __init__(
        self,
        custom_binary_path: Optional[str] = None,
        preprocessor: Optional[ImagePreprocessorPipeline] = None,
    ):
        self._custom_binary_path = custom_binary_path
        self._preprocessor = preprocessor or ImagePreprocessorPipeline()
        self._cached_binary: Optional[str] = None
        self._resolve_binary()

    @property
    def name(self) -> str:
        return "local_ocr_tesseract"

    def _resolve_binary(self) -> Optional[str]:
        if self._custom_binary_path and Path(self._custom_binary_path).is_file():
            self._cached_binary = self._custom_binary_path
            return self._cached_binary

        # Check PATH
        path_binary = shutil.which("tesseract")
        if path_binary:
            self._cached_binary = path_binary
            return self._cached_binary

        # Check standard installation locations
        for candidate in self.KNOWN_TESSERACT_PATHS:
            if Path(candidate).is_file():
                self._cached_binary = candidate
                return self._cached_binary

        self._cached_binary = None
        return None

    @property
    def is_available(self) -> bool:
        return self._resolve_binary() is not None

    def check_health(self) -> MultimodalHealthStatus:
        if self.is_available:
            return MultimodalHealthStatus.AVAILABLE
        return MultimodalHealthStatus.UNAVAILABLE

    def supports(self, request: OCRRequest) -> bool:
        ext = Path(request.file_path).suffix.lower()
        return ext in [".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tiff", ".pdf"]

    def extract(self, request: OCRRequest) -> OCRResult:
        start_time = time.time()
        binary = self._resolve_binary()

        if not binary:
            return OCRResult(
                success=False,
                error="Local OCR engine unavailable (Tesseract binary not found on PATH or standard directories)",
                execution_time_ms=(time.time() - start_time) * 1000,
                provider_name=self.name,
                method=ExtractionMethod.UNAVAILABLE,
                quality=ExtractionQuality.UNAVAILABLE,
            )

        target_path = Path(request.file_path)
        if not target_path.exists():
            return OCRResult(
                success=False,
                error=f"File not found: {request.file_path}",
                execution_time_ms=(time.time() - start_time) * 1000,
                provider_name=self.name,
                method=ExtractionMethod.TESSERACT_OCR,
                quality=ExtractionQuality.FAILED,
            )

        try:
            # 1. Load image and preprocess
            with Image.open(target_path) as raw_img:
                proc_img = self._preprocessor.preprocess(raw_img)
                w, h = proc_img.size

                # 2. Write temp image for Tesseract execution
                with tempfile.TemporaryDirectory() as tmpdir:
                    tmp_img_path = Path(tmpdir) / "preprocessed.png"
                    proc_img.save(tmp_img_path, format="PNG")

                    out_base = str(Path(tmpdir) / "ocr_out")
                    # Run tesseract with TSV layout output to extract words, coordinates, and confidences
                    cmd = [
                        binary,
                        str(tmp_img_path),
                        out_base,
                        "-l", request.language,
                        "tsv",
                    ]

                    res = subprocess.run(
                        cmd,
                        stdout=subprocess.PIPE,
                        stderr=subprocess.PIPE,
                        timeout=request.timeout_seconds,
                        check=False,
                    )

                    tsv_file = Path(f"{out_base}.tsv")
                    if not tsv_file.exists():
                        err_text = res.stderr.decode("utf-8", errors="ignore")
                        return OCRResult(
                            success=False,
                            error=f"OCR execution failed: {err_text}",
                            execution_time_ms=(time.time() - start_time) * 1000,
                            provider_name=self.name,
                            method=ExtractionMethod.TESSERACT_OCR,
                            quality=ExtractionQuality.FAILED,
                        )

                    # 3. Parse TSV results
                    tsv_content = tsv_file.read_text(encoding="utf-8", errors="ignore")
                    text_regions, full_text, avg_conf = self._parse_tsv(tsv_content, w, h)

            quality = ExtractionQuality.HIGH_CONFIDENCE if avg_conf >= 75.0 else (
                ExtractionQuality.MEDIUM_CONFIDENCE if avg_conf >= 40.0 else ExtractionQuality.LOW_CONFIDENCE
            )

            meta = ExtractionMetadata(
                method=ExtractionMethod.TESSERACT_OCR,
                quality=quality,
                engine_name=self.name,
                processing_time_ms=(time.time() - start_time) * 1000,
                average_confidence=avg_conf / 100.0,
            )

            page = MultimodalPage(
                page_number=1,
                raw_text=full_text,
                text_regions=text_regions,
                width=w,
                height=h,
                extraction_metadata=meta,
            )

            doc = MultimodalDocument(
                document_id=f"ocr_{target_path.stem}",
                source_path=str(target_path),
                media_type=MultimodalMediaType.IMAGE_PNG,
                pages=[page],
                page_count=1,
                full_text=full_text,
                metadata=meta,
            )

            return OCRResult(
                success=True,
                document=doc,
                execution_time_ms=meta.processing_time_ms,
                provider_name=self.name,
                method=ExtractionMethod.TESSERACT_OCR,
                quality=quality,
            )

        except subprocess.TimeoutExpired:
            return OCRResult(
                success=False,
                error=f"OCR extraction timed out after {request.timeout_seconds}s",
                execution_time_ms=(time.time() - start_time) * 1000,
                provider_name=self.name,
                method=ExtractionMethod.TESSERACT_OCR,
                quality=ExtractionQuality.FAILED,
            )
        except Exception as e:
            return OCRResult(
                success=False,
                error=f"OCR processing exception: {str(e)}",
                execution_time_ms=(time.time() - start_time) * 1000,
                provider_name=self.name,
                method=ExtractionMethod.TESSERACT_OCR,
                quality=ExtractionQuality.FAILED,
            )

    def _parse_tsv(self, tsv_content: str, width: int, height: int) -> tuple[List[TextRegion], str, float]:
        lines = tsv_content.strip().splitlines()
        if len(lines) <= 1:
            return [], "", 0.0

        header = lines[0].split("\t")
        col_idx = {name: i for i, name in enumerate(header)}

        text_regions: List[TextRegion] = []
        words: List[str] = []
        confidences: List[float] = []

        current_line_words: List[str] = []
        current_line_box: Optional[BoundingBox] = None
        current_line_confs: List[float] = []

        for line in lines[1:]:
            parts = line.split("\t")
            if len(parts) < len(header):
                continue

            text = parts[col_idx.get("text", 11)].strip()
            conf_str = parts[col_idx.get("conf", 10)].strip()

            try:
                conf = float(conf_str)
            except ValueError:
                conf = -1.0

            if not text or conf < 0:
                # End of line / paragraph marker
                if current_line_words:
                    line_text = " ".join(current_line_words)
                    avg_c = sum(current_line_confs) / max(len(current_line_confs), 1)
                    text_regions.append(TextRegion(
                        text=line_text,
                        region_type=RegionType.PARAGRAPH,
                        bounding_box=current_line_box,
                        confidence=avg_c / 100.0,
                    ))
                    current_line_words = []
                    current_line_box = None
                    current_line_confs = []
                continue

            left = int(parts[col_idx.get("left", 6)])
            top = int(parts[col_idx.get("top", 7)])
            w = int(parts[col_idx.get("width", 8)])
            h = int(parts[col_idx.get("height", 9)])

            box = BoundingBox(x0=left, y0=top, x1=left + w, y1=top + h, is_normalized=False)

            current_line_words.append(text)
            current_line_confs.append(conf)
            words.append(text)
            confidences.append(conf)

            if current_line_box is None:
                current_line_box = box
            else:
                current_line_box.x0 = min(current_line_box.x0, box.x0)
                current_line_box.y0 = min(current_line_box.y0, box.y0)
                current_line_box.x1 = max(current_line_box.x1, box.x1)
                current_line_box.y1 = max(current_line_box.y1, box.y1)

        if current_line_words:
            line_text = " ".join(current_line_words)
            avg_c = sum(current_line_confs) / max(len(current_line_confs), 1)
            text_regions.append(TextRegion(
                text=line_text,
                region_type=RegionType.PARAGRAPH,
                bounding_box=current_line_box,
                confidence=avg_c / 100.0,
            ))

        full_text = " ".join(words)
        overall_avg_conf = sum(confidences) / max(len(confidences), 1) if confidences else 0.0
        return text_regions, full_text, overall_avg_conf


class DeterministicTestOCRProvider(OCRProvider):
    """
    TEST-ONLY deterministic OCR provider used for integration and unit test fixtures.
    Must NEVER be registered as a default production fallback.
    """

    def __init__(
        self,
        mock_text: str = "Extracted text content from local test OCR.",
        confidence: float = 0.95,
        region_type: RegionType = RegionType.PARAGRAPH,
    ):
        self._mock_text = mock_text
        self._confidence = confidence
        self._region_type = region_type

    @property
    def name(self) -> str:
        return "deterministic_test_ocr"

    @property
    def is_available(self) -> bool:
        return True

    def check_health(self) -> MultimodalHealthStatus:
        return MultimodalHealthStatus.AVAILABLE

    def supports(self, request: OCRRequest) -> bool:
        return True

    def extract(self, request: OCRRequest) -> OCRResult:
        p = Path(request.file_path)
        meta = ExtractionMetadata(
            method=ExtractionMethod.TEST_SYNTHETIC,
            quality=ExtractionQuality.HIGH_CONFIDENCE,
            engine_name=self.name,
            average_confidence=self._confidence,
            processing_time_ms=5.0,
        )

        region = TextRegion(
            text=self._mock_text,
            region_type=self._region_type,
            bounding_box=BoundingBox(x0=10, y0=10, x1=500, y1=200, is_normalized=False),
            confidence=self._confidence,
            page_number=1,
        )

        page = MultimodalPage(
            page_number=1,
            raw_text=self._mock_text,
            text_regions=[region],
            width=800,
            height=600,
            extraction_metadata=meta,
        )

        doc = MultimodalDocument(
            document_id=f"test_doc_{p.stem}",
            source_path=str(p),
            media_type=MultimodalMediaType.IMAGE_PNG,
            pages=[page],
            page_count=1,
            full_text=self._mock_text,
            metadata=meta,
        )

        return OCRResult(
            success=True,
            document=doc,
            execution_time_ms=5.0,
            provider_name=self.name,
            method=ExtractionMethod.TEST_SYNTHETIC,
            quality=ExtractionQuality.HIGH_CONFIDENCE,
        )
