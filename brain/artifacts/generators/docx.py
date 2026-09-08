"""
Office Open XML DOCX Generator
Generates valid Microsoft Word (.docx) documents from structured content using pure-Python packaging.
Supports titles, headings, paragraphs, bullet lists, tables, and metadata properties.
"""

import io
import zipfile
import html
import time
from typing import List, Dict, Any, Union
from pathlib import Path

from brain.artifacts.definitions import ArtifactType
from brain.artifacts.requests import ArtifactRequest
from brain.artifacts.models import DocumentSectionData, TableData
from brain.artifacts.generators.interface import ArtifactGenerator


class DOCXArtifactGenerator(ArtifactGenerator):
    """
    Generates genuine Office Open XML Word (.docx) deliverables.
    Constructs well-formed OPC ZIP packaging without external native dependencies.
    """

    @property
    def name(self) -> str:
        return "docx_generator"

    @property
    def supported_types(self) -> List[ArtifactType]:
        return [ArtifactType.DOCX]

    @property
    def is_available(self) -> bool:
        return True

    def supports(self, artifact_type: ArtifactType) -> bool:
        return artifact_type == ArtifactType.DOCX

    def generate_to_path(self, request: ArtifactRequest, target_path: Path) -> None:
        title = (request.metadata.title if request.metadata else None) or request.name.replace(".docx", "").replace("_", " ").title()
        author = request.metadata.author if request.metadata else "Fluffy Assistant"
        description = request.metadata.description if request.metadata else ""

        # Normalize content to list of sections or raw text
        sections: List[DocumentSectionData] = []
        raw_text_paragraphs: List[str] = []

        content = request.content
        if isinstance(content, list):
            for item in content:
                if isinstance(item, DocumentSectionData):
                    sections.append(item)
                elif isinstance(item, dict):
                    t_data = None
                    if item.get("table") and isinstance(item["table"], dict):
                        t_data = TableData(headers=item["table"].get("headers", []), rows=item["table"].get("rows", []))
                    sections.append(DocumentSectionData(
                        heading=item.get("heading", ""),
                        level=item.get("level", 1),
                        text=item.get("text", ""),
                        bullet_points=item.get("bullet_points", []),
                        table=t_data,
                    ))
                elif isinstance(item, str):
                    raw_text_paragraphs.append(item)
        elif isinstance(content, dict):
            for sec in content.get("sections", []):
                t_data = None
                if sec.get("table") and isinstance(sec["table"], dict):
                    t_data = TableData(headers=sec["table"].get("headers", []), rows=sec["table"].get("rows", []))
                sections.append(DocumentSectionData(
                    heading=sec.get("heading", ""),
                    level=sec.get("level", 1),
                    text=sec.get("text", ""),
                    bullet_points=sec.get("bullet_points", []),
                    table=t_data,
                ))
            if "text" in content and not sections:
                raw_text_paragraphs.append(content["text"])
        elif isinstance(content, str):
            for p in content.split("\n\n"):
                if p.strip():
                    raw_text_paragraphs.append(p.strip())

        # Build document.xml body XML parts
        body_xml_parts: List[str] = []

        # 1. Document Title
        body_xml_parts.append(f"""
            <w:p>
                <w:pPr>
                    <w:pStyle w:val="Title"/>
                    <w:jc w:val="center"/>
                </w:pPr>
                <w:r>
                    <w:rPr>
                        <w:b/>
                        <w:sz w:val="48"/>
                    </w:rPr>
                    <w:t>{html.escape(title)}</w:t>
                </w:r>
            </w:p>
        """)

        # 2. Subtitle / description if present
        if description:
            body_xml_parts.append(f"""
                <w:p>
                    <w:pPr><w:jc w:val="center"/></w:pPr>
                    <w:r>
                        <w:rPr><w:i/><w:color w:val="666666"/></w:rPr>
                        <w:t>{html.escape(description)}</w:t>
                    </w:r>
                </w:p>
            """)

        body_xml_parts.append("<w:p/>")

        # 3. Render Sections
        for sec in sections:
            if sec.heading:
                style_val = f"Heading{min(max(sec.level, 1), 3)}"
                sz_val = "36" if sec.level == 1 else ("28" if sec.level == 2 else "24")
                body_xml_parts.append(f"""
                    <w:p>
                        <w:pPr><w:pStyle w:val="{style_val}"/></w:pPr>
                        <w:r>
                            <w:rPr><w:b/><w:sz w:val="{sz_val}"/></w:rPr>
                            <w:t>{html.escape(sec.heading)}</w:t>
                        </w:r>
                    </w:p>
                """)

            if sec.text:
                for line in sec.text.split("\n"):
                    if line.strip():
                        body_xml_parts.append(f"""
                            <w:p>
                                <w:r><w:t>{html.escape(line.strip())}</w:t></w:r>
                            </w:p>
                        """)

            if sec.bullet_points:
                for bp in sec.bullet_points:
                    body_xml_parts.append(f"""
                        <w:p>
                            <w:pPr><w:pStyle w:val="ListBullet"/></w:pPr>
                            <w:r><w:t>• {html.escape(bp.strip())}</w:t></w:r>
                        </w:p>
                    """)

            if sec.table:
                body_xml_parts.append(self._build_table_xml(sec.table))

        # 4. Render raw paragraphs if no structured sections
        for p in raw_text_paragraphs:
            body_xml_parts.append(f"""
                <w:p>
                    <w:r><w:t>{html.escape(p)}</w:t></w:r>
                </w:p>
            """)

        # 5. Append Provenance / Citations footer if present
        if request.sources:
            body_xml_parts.append("""
                <w:p/>
                <w:p>
                    <w:pPr><w:pStyle w:val="Heading2"/></w:pPr>
                    <w:r><w:rPr><w:b/><w:sz w:val="28"/></w:rPr><w:t>Sources &amp; Citations</w:t></w:r>
                </w:p>
            """)
            for s in request.sources:
                body_xml_parts.append(f"""
                    <w:p>
                        <w:r><w:rPr><w:i/><w:color w:val="555555"/></w:rPr><w:t>- {html.escape(s)}</w:t></w:r>
                    </w:p>
                """)

        # Assemble full document.xml
        document_xml = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
                    xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
            <w:body>
                {''.join(body_xml_parts)}
                <w:sectPr>
                    <w:pgSz w:w="12240" w:h="15840"/>
                    <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>
                </w:sectPr>
            </w:body>
        </w:document>
        """

        content_types_xml = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
            <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
            <Default Extension="xml" ContentType="application/xml"/>
            <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
            <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
            <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
        </Types>"""

        rels_xml = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
            <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
            <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
            <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
        </Relationships>"""

        now_iso = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        core_xml = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
                           xmlns:dc="http://purl.org/dc/elements/1.1/"
                           xmlns:dcterms="http://purl.org/dc/terms/"
                           xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
            <dc:title>{html.escape(title)}</dc:title>
            <dc:creator>{html.escape(author)}</dc:creator>
            <cp:lastModifiedBy>Fluffy Assistant</cp:lastModifiedBy>
            <dc:description>{html.escape(description)}</dc:description>
            <dcterms:created xsi:type="dcterms:W3CDTF">{now_iso}</dcterms:created>
        </cp:coreProperties>"""

        app_xml = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
        <Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">
            <Application>Fluffy Assistant</Application>
        </Properties>"""

        # Package into ZIP archive
        with zipfile.ZipFile(target_path, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("[Content_Types].xml", content_types_xml)
            zf.writestr("_rels/.rels", rels_xml)
            zf.writestr("word/document.xml", document_xml)
            zf.writestr("docProps/core.xml", core_xml)
            zf.writestr("docProps/app.xml", app_xml)

    def _build_table_xml(self, table: TableData) -> str:
        if not table.headers and not table.rows:
            return ""

        rows_xml: List[str] = []

        # Headers
        if table.headers:
            cells_xml = []
            for h in table.headers:
                cells_xml.append(f"""
                    <w:tc>
                        <w:tcPr>
                            <w:shd w:val="clear" w:color="auto" w:fill="E0E0E0"/>
                        </w:tcPr>
                        <w:p>
                            <w:r><w:rPr><w:b/></w:rPr><w:t>{html.escape(str(h))}</w:t></w:r>
                        </w:p>
                    </w:tc>
                """)
            rows_xml.append(f"<w:tr>{''.join(cells_xml)}</w:tr>")

        # Data rows
        for row in table.rows:
            cells_xml = []
            for cell in row:
                cells_xml.append(f"""
                    <w:tc>
                        <w:p>
                            <w:r><w:t>{html.escape(str(cell))}</w:t></w:r>
                        </w:p>
                    </w:tc>
                """)
            rows_xml.append(f"<w:tr>{''.join(cells_xml)}</w:tr>")

        return f"""
            <w:tbl>
                <w:tblPr>
                    <w:tblW w:w="0" w:type="auto"/>
                    <w:tblBorders>
                        <w:top w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>
                        <w:bottom w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>
                        <w:left w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>
                        <w:right w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>
                        <w:insideH w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>
                        <w:insideV w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>
                    </w:tblBorders>
                </w:tblPr>
                {''.join(rows_xml)}
            </w:tbl>
        """
