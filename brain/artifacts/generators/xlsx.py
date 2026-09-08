"""
Excel XLSX Deliverable Generator
Generates real Microsoft Excel (.xlsx) workbooks using xlsxwriter.
Supports multiple sheets, headers, numeric/date cells, formulas, formatting, and auto-column widths.
"""

from typing import List, Dict, Any, Union
from pathlib import Path

from brain.artifacts.definitions import ArtifactType
from brain.artifacts.requests import ArtifactRequest
from brain.artifacts.models import SpreadsheetSheetData, TableData
from brain.artifacts.generators.interface import ArtifactGenerator


class XLSXArtifactGenerator(ArtifactGenerator):
    """
    Generates genuine Office Open XML Excel (.xlsx) workbooks.
    """

    @property
    def name(self) -> str:
        return "xlsx_generator"

    @property
    def supported_types(self) -> List[ArtifactType]:
        return [ArtifactType.XLSX]

    @property
    def is_available(self) -> bool:
        try:
            import xlsxwriter
            return True
        except ImportError:
            return False

    def supports(self, artifact_type: ArtifactType) -> bool:
        return artifact_type == ArtifactType.XLSX

    def generate_to_path(self, request: ArtifactRequest, target_path: Path) -> None:
        if not self.is_available:
            raise RuntimeError("xlsxwriter library is not installed in the local environment.")

        import xlsxwriter

        # Parse request content into list of sheets
        sheets: List[SpreadsheetSheetData] = []
        content = request.content

        if isinstance(content, SpreadsheetSheetData):
            sheets.append(content)
        elif isinstance(content, TableData):
            sheets.append(SpreadsheetSheetData(sheet_name="Data", headers=content.headers, rows=content.rows))
        elif isinstance(content, list):
            if content and isinstance(content[0], SpreadsheetSheetData):
                sheets.extend(content)
            elif content and isinstance(content[0], dict):
                headers = list(content[0].keys())
                rows = [[item.get(k, "") for k in headers] for item in content]
                sheets.append(SpreadsheetSheetData(sheet_name="Data", headers=headers, rows=rows))
            elif content and isinstance(content[0], list):
                headers = [str(c) for c in content[0]]
                rows = content[1:]
                sheets.append(SpreadsheetSheetData(sheet_name="Data", headers=headers, rows=rows))
        elif isinstance(content, dict):
            if "sheets" in content and isinstance(content["sheets"], list):
                for s in content["sheets"]:
                    sheets.append(SpreadsheetSheetData(
                        sheet_name=s.get("sheet_name", "Sheet"),
                        headers=s.get("headers", []),
                        rows=s.get("rows", []),
                        formulas=s.get("formulas", {}),
                    ))
            elif "headers" in content and "rows" in content:
                sheets.append(SpreadsheetSheetData(
                    sheet_name=content.get("sheet_name", "Data"),
                    headers=content.get("headers", []),
                    rows=content.get("rows", []),
                    formulas=content.get("formulas", {}),
                ))

        if not sheets:
            sheets.append(SpreadsheetSheetData(sheet_name="Sheet1", headers=["Item", "Value"], rows=[["Status", "Initialized"]]))

        # Create workbook
        workbook = xlsxwriter.Workbook(str(target_path))

        # Format definitions
        header_format = workbook.add_format({
            "bold": True,
            "font_color": "white",
            "bg_color": "#2B579A",
            "border": 1,
            "align": "center",
            "valign": "vcenter",
        })
        cell_format = workbook.add_format({
            "border": 1,
            "valign": "vcenter",
        })
        num_format = workbook.add_format({
            "border": 1,
            "num_format": "#,##0.00",
            "align": "right",
            "valign": "vcenter",
        })
        formula_format = workbook.add_format({
            "bold": True,
            "border": 1,
            "bg_color": "#F2F2F2",
            "align": "right",
            "valign": "vcenter",
        })

        for sheet_data in sheets:
            worksheet = workbook.add_worksheet(sheet_data.sheet_name[:31])
            worksheet.freeze_panes(1, 0)  # Freeze header row

            col_widths = {}

            # Write headers
            for col_idx, h in enumerate(sheet_data.headers):
                worksheet.write(0, col_idx, str(h), header_format)
                col_widths[col_idx] = max(col_widths.get(col_idx, 0), len(str(h)) + 4)

            # Write data rows
            for row_idx, row in enumerate(sheet_data.rows, start=1):
                for col_idx, val in enumerate(row):
                    if isinstance(val, (int, float)):
                        worksheet.write_number(row_idx, col_idx, val, num_format)
                    else:
                        worksheet.write(row_idx, col_idx, str(val), cell_format)
                    col_widths[col_idx] = max(col_widths.get(col_idx, 0), len(str(val)) + 2)

            # Write formulas
            for cell_ref, formula in sheet_data.formulas.items():
                worksheet.write_formula(cell_ref, formula, formula_format)

            # Set column widths
            for col_idx, width in col_widths.items():
                worksheet.set_column(col_idx, col_idx, max(min(width, 50), 10))

        # If provenance citations present, create a Sources worksheet
        if request.sources:
            sources_sheet = workbook.add_worksheet("Sources")
            sources_sheet.write(0, 0, "Source Reference / Citation", header_format)
            for idx, src in enumerate(request.sources, start=1):
                sources_sheet.write(idx, 0, src, cell_format)
            sources_sheet.set_column(0, 0, 60)

        workbook.close()
