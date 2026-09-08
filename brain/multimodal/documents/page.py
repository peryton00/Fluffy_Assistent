"""
PDF Page and Image Extractor
Extracts raster page images and embedded image XObjects from scanned PDF streams without external dependencies.
"""

import io
import re
import zlib
from pathlib import Path
from typing import List, Tuple, Optional
from PIL import Image


class PDFPageExtractor:
    """
    Extracts raster page image streams from PDF documents for local OCR processing.
    """

    @classmethod
    def extract_images_from_pdf(cls, pdf_path: Path, max_pages: int = 100) -> List[Tuple[int, Image.Image]]:
        """
        Extract embedded raster images from PDF file.
        Returns list of (page_number, PIL.Image).
        """
        if not pdf_path.exists():
            return []

        images: List[Tuple[int, Image.Image]] = []
        try:
            with open(pdf_path, "rb") as f:
                data = f.read()

            # Find all image streams in the PDF: /Subtype /Image ... stream ... endstream
            # Or JPEG streams marked with /DCTDecode
            dct_matches = re.finditer(rb"/DCTDecode.*?stream[\r\n]+(.*?)[\r\n]+endstream", data, re.DOTALL)
            page_idx = 1
            for m in dct_matches:
                if page_idx > max_pages:
                    break
                raw_stream = m.group(1)
                try:
                    img = Image.open(io.BytesIO(raw_stream))
                    img.load()
                    images.append((page_idx, img))
                    page_idx += 1
                except Exception:
                    pass

            # If no DCTDecode images found, look for general image streams with FlateDecode
            if not images:
                image_obj_matches = re.finditer(
                    rb"<<.*?/Type\s*/XObject.*?/Subtype\s*/Image.*?/Width\s*(\d+).*?/Height\s*(\d+).*?>>\s*stream[\r\n]+(.*?)[\r\n]+endstream",
                    data,
                    re.DOTALL,
                )
                for m in image_obj_matches:
                    if page_idx > max_pages:
                        break
                    w = int(m.group(1).decode("ascii", errors="ignore"))
                    h = int(m.group(2).decode("ascii", errors="ignore"))
                    stream_raw = m.group(3)
                    try:
                        decompressed = zlib.decompress(stream_raw)
                        # Attempt to construct image
                        mode = "RGB" if len(decompressed) == w * h * 3 else "L"
                        img = Image.frombytes(mode, (w, h), decompressed)
                        images.append((page_idx, img))
                        page_idx += 1
                    except Exception:
                        pass

        except Exception:
            pass

        return images
