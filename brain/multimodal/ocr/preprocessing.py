"""
Image Preprocessing Pipeline for Local OCR
Provides deterministic local image enhancement, orientation correction, resizing, and normalization using Pillow.
"""

from typing import Optional, Tuple
from PIL import Image, ImageOps, ImageEnhance, ImageFilter

from brain.multimodal.models import BoundingBox


class ImagePreprocessorPipeline:
    """
    Standard preprocessing pipeline to enhance readability for local OCR engines.
    Produces derived images without altering the original source files.
    """

    def __init__(
        self,
        max_dimension: int = 4096,
        enhance_contrast: bool = True,
        contrast_factor: float = 1.5,
        sharpen: bool = True,
        auto_rotate: bool = True,
    ):
        self.max_dimension = max_dimension
        self.enhance_contrast = enhance_contrast
        self.contrast_factor = contrast_factor
        self.sharpen = sharpen
        self.auto_rotate = auto_rotate

    def preprocess(self, image: Image.Image) -> Image.Image:
        """
        Apply standard pre-processing sequence:
        1. EXIF orientation correction
        2. Dimension bounding / downscale if larger than max_dimension
        3. Convert to Grayscale (L)
        4. Enhance contrast
        5. Gentle sharpen
        """
        # Create an independent copy
        working = image.copy()

        # 1. Orientation correction
        if self.auto_rotate:
            try:
                working = ImageOps.exif_transpose(working) or working
            except Exception:
                pass

        # 2. Resizing within bounds
        w, h = working.size
        if w > self.max_dimension or h > self.max_dimension:
            scale = min(self.max_dimension / w, self.max_dimension / h)
            new_w = max(1, int(w * scale))
            new_h = max(1, int(h * scale))
            working = working.resize((new_w, new_h), Image.Resampling.LANCZOS)

        # 3. Grayscale conversion
        if working.mode != "L":
            working = working.convert("L")

        # 4. Contrast enhancement
        if self.enhance_contrast:
            try:
                enhancer = ImageEnhance.Contrast(working)
                working = enhancer.enhance(self.contrast_factor)
            except Exception:
                pass

        # 5. Sharpen
        if self.sharpen:
            try:
                working = working.filter(ImageFilter.SHARPEN)
            except Exception:
                pass

        return working

    def safe_crop(self, image: Image.Image, box: BoundingBox) -> Optional[Image.Image]:
        """
        Safely crop image with coordinate validation and boundary clamping.
        """
        if not box.validate():
            return None

        w, h = image.size
        if box.is_normalized:
            x0 = max(0, int(box.x0 * w))
            y0 = max(0, int(box.y0 * h))
            x1 = min(w, int(box.x1 * w))
            y1 = min(h, int(box.y1 * h))
        else:
            x0 = max(0, int(box.x0))
            y0 = max(0, int(box.y0))
            x1 = min(w, int(box.x1))
            y1 = min(h, int(box.y1))

        if x1 <= x0 or y1 <= y0:
            return None

        return image.crop((x0, y0, x1, y1))
