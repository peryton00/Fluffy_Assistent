"""
Unit Tests for Multimodal OCR Subsystem
Tests data models, preprocessor operations, provider interface contracts, error states, and health diagnostics.
"""

import unittest
from pathlib import Path
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
    VisionRequest,
)
from brain.multimodal.ocr.preprocessing import ImagePreprocessorPipeline
from brain.multimodal.ocr.local import LocalOCRProvider, DeterministicTestOCRProvider
from brain.multimodal.ocr.provider import OCRProviderRegistry
from brain.multimodal.vision.local import LocalVisionProvider
from brain.multimodal.documents.layout import LayoutAssembler
from brain.multimodal.runtime import MultimodalRuntime


class TestMultimodalDataModels(unittest.TestCase):
    """Test data model validations and serialization."""

    def test_bounding_box_validation(self):
        valid_box = BoundingBox(x0=10, y0=20, x1=100, y1=200)
        self.assertTrue(valid_box.validate())

        invalid_box = BoundingBox(x0=100, y0=20, x1=10, y1=200)
        self.assertFalse(invalid_box.validate())

        d = valid_box.to_dict()
        self.assertEqual(d["x0"], 10)
        self.assertEqual(d["y1"], 200)

    def test_table_region_to_markdown(self):
        table = TableRegion(
            headers=["Part ID", "Name", "Quantity"],
            rows=[
                ["P-101", "Bearing", "4"],
                ["P-102", "Seal", "12"],
            ],
            page_number=1,
        )
        md = table.to_markdown()
        self.assertIn("| Part ID | Name | Quantity |", md)
        self.assertIn("| P-101 | Bearing | 4 |", md)
        self.assertIn("| P-102 | Seal | 12 |", md)

    def test_drawing_region_serialization(self):
        drawing = DrawingRegion(
            drawing_id="DWG-001-A",
            page_number=1,
            labels=["Shaft", "Flange"],
            associated_text="Tolerance +/- 0.05mm",
            extraction_method=ExtractionMethod.TEXT_STREAM,
        )
        d = drawing.to_dict()
        self.assertEqual(d["drawing_id"], "DWG-001-A")
        self.assertIn("Shaft", d["labels"])
        self.assertEqual(d["extraction_method"], "text_stream")


class TestImagePreprocessing(unittest.TestCase):
    """Test local Pillow image preprocessing pipeline."""

    def test_preprocessing_transforms(self):
        pipeline = ImagePreprocessorPipeline(max_dimension=200, enhance_contrast=True)
        # Create an oversized test image
        img = Image.new("RGB", (500, 300), color=(100, 150, 200))
        proc = pipeline.preprocess(img)

        # Mode converted to grayscale
        self.assertEqual(proc.mode, "L")
        # Scaled down within max_dimension
        self.assertLessEqual(proc.size[0], 200)
        self.assertLessEqual(proc.size[1], 200)

    def test_safe_crop(self):
        pipeline = ImagePreprocessorPipeline()
        img = Image.new("RGB", (400, 400), color=(255, 255, 255))
        box = BoundingBox(x0=50, y0=50, x1=150, y1=150, is_normalized=False)
        cropped = pipeline.safe_crop(img, box)
        self.assertIsNotNone(cropped)
        self.assertEqual(cropped.size, (100, 100))

        invalid_box = BoundingBox(x0=200, y0=50, x1=100, y1=150)
        self.assertIsNone(pipeline.safe_crop(img, invalid_box))


class TestLayoutAssembler(unittest.TestCase):
    """Test document layout composition from structured regions."""

    def test_assemble_page_text(self):
        page = MultimodalPage(
            page_number=1,
            text_regions=[
                TextRegion(text="Main Specification", region_type=RegionType.HEADING, bounding_box=BoundingBox(0, 10, 100, 30)),
                TextRegion(text="This is paragraph one.", region_type=RegionType.PARAGRAPH, bounding_box=BoundingBox(0, 40, 100, 80)),
                TextRegion(text="Field verified by QA", region_type=RegionType.HANDWRITING, confidence=0.88, bounding_box=BoundingBox(0, 90, 100, 110)),
            ],
            table_regions=[
                TableRegion(headers=["Item", "Value"], rows=[["Torque", "50 Nm"]], page_number=1)
            ],
            drawing_regions=[
                DrawingRegion(drawing_id="SCH-99", labels=["Valve-1", "Pump-2"], associated_text="Primary loop")
            ],
        )

        assembled = LayoutAssembler.assemble_page_text(page)
        self.assertIn("### Main Specification", assembled)
        self.assertIn("This is paragraph one.", assembled)
        self.assertIn("[Handwritten Note (88% conf): Field verified by QA]", assembled)
        self.assertIn("| Item | Value |", assembled)
        self.assertIn("[Engineering Drawing: SCH-99]", assembled)


class TestProvidersAndRegistry(unittest.TestCase):
    """Test provider contracts, registry, and offline fallback isolation."""

    def test_local_ocr_provider_unavailable_behavior(self):
        # Point to non-existent custom path to test explicit UNAVAILABLE behavior
        provider = LocalOCRProvider(custom_binary_path="C:\\nonexistent_tesseract.exe")
        self.assertFalse(provider.is_available)
        self.assertEqual(provider.check_health(), MultimodalHealthStatus.UNAVAILABLE)

        req = OCRRequest(file_path="sample.png")
        res = provider.extract(req)
        self.assertFalse(res.success)
        self.assertEqual(res.method, ExtractionMethod.UNAVAILABLE)
        self.assertEqual(res.quality, ExtractionQuality.UNAVAILABLE)
        self.assertIn("Local OCR engine unavailable", res.error)

    def test_local_vision_provider_unavailable_behavior(self):
        provider = LocalVisionProvider(ai_runtime=None)
        self.assertFalse(provider.is_available)
        self.assertEqual(provider.check_health(), MultimodalHealthStatus.UNAVAILABLE)

        req = VisionRequest(image_path="sample.png")
        res = provider.analyze(req)
        self.assertFalse(res.success)
        self.assertIn("unavailable", res.error.lower())

    def test_ocr_provider_registry(self):
        registry = OCRProviderRegistry(populate_defaults=False)
        self.assertEqual(len(registry.list_providers()), 0)

        test_prov = DeterministicTestOCRProvider(mock_text="test text")
        registry.register_provider(test_prov)
        self.assertEqual(len(registry.list_providers()), 1)
        self.assertEqual(registry.get_provider("deterministic_test_ocr"), test_prov)
        self.assertEqual(registry.get_active_provider(), test_prov)

    def test_runtime_health(self):
        runtime = MultimodalRuntime()
        health = runtime.check_health()
        self.assertTrue(health.is_offline_compliant)
        self.assertIn(health.status, [MultimodalHealthStatus.AVAILABLE, MultimodalHealthStatus.DEGRADED, MultimodalHealthStatus.UNAVAILABLE])


if __name__ == "__main__":
    unittest.main()
