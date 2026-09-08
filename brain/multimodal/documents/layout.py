"""
Multimodal Layout Assembler
Structures raw OCR and vision regions into coherent reading order, sections, tables, and drawing annotations.
"""

from typing import List, Optional
from brain.multimodal.models import (
    MultimodalPage,
    TextRegion,
    TableRegion,
    DrawingRegion,
    RegionType,
)


class LayoutAssembler:
    """
    Assembles extracted visual and text elements into structured document text while preserving
    reading order and layout semantics.
    """

    @classmethod
    def assemble_page_text(cls, page: MultimodalPage) -> str:
        """
        Assemble all textual and structured components of a page into readable Markdown format.
        """
        blocks: List[str] = []

        # Sort text regions primarily top-to-bottom, secondarily left-to-right if bounding boxes exist
        sorted_regions = sorted(
            page.text_regions,
            key=lambda r: (r.bounding_box.y0 if r.bounding_box else 0.0, r.bounding_box.x0 if r.bounding_box else 0.0)
        )

        for region in sorted_regions:
            text = region.text.strip()
            if not text:
                continue

            if region.region_type == RegionType.HEADING:
                blocks.append(f"### {text}")
            elif region.region_type == RegionType.METADATA_HEADER:
                blocks.append(f"**[Header: {text}]**")
            elif region.region_type == RegionType.CAPTION:
                blocks.append(f"*[Caption: {text}]*")
            elif region.region_type == RegionType.HANDWRITING:
                conf_pct = int(region.confidence * 100)
                blocks.append(f"*[Handwritten Note ({conf_pct}% conf): {text}]*")
            else:
                blocks.append(text)

        # Append structured tables if present
        for table in page.table_regions:
            table_md = table.to_markdown()
            if table_md:
                blocks.append(f"\n{table_md}\n")

        # Append engineering drawing text / labels if present
        for drawing in page.drawing_regions:
            parts = [f"**[Engineering Drawing: {drawing.drawing_id}]**"]
            if drawing.labels:
                parts.append(f"Labels: {', '.join(drawing.labels)}")
            if drawing.associated_text:
                parts.append(f"Details: {drawing.associated_text}")
            blocks.append("\n".join(parts))

        # Fallback to page.raw_text if no regions were extracted but raw text exists
        if not blocks and page.raw_text:
            blocks.append(page.raw_text.strip())

        return "\n\n".join(blocks).strip()
