from __future__ import annotations

import io
from typing import Any

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.hyperlink import Hyperlink

DATA_SHEET_NAME = "Crosstab"
INDEX_SHEET_NAME = "Index"
TABLE_GAP_ROWS = 3


def banner_result_to_excel(result: dict[str, Any]) -> bytes:
    wb = Workbook()
    index_ws = wb.active
    index_ws.title = INDEX_SHEET_NAME
    data_ws = wb.create_sheet(title=DATA_SHEET_NAME)

    tables = _tables_from_result(result)
    if not tables:
        data_ws["A1"] = result.get("error", "No data")
        _write_index_header(index_ws)
        index_ws.cell(2, 1, "No tables exported")
        buf = io.BytesIO()
        wb.save(buf)
        return buf.getvalue()

    _write_index_header(index_ws)
    row = 1
    index_row = 2

    for i, table in enumerate(tables, start=1):
        title = _table_display_title(table, i)
        anchor_row = row

        index_cell = index_ws.cell(index_row, 1, title)
        index_cell.hyperlink = Hyperlink(
            ref=index_cell.coordinate,
            location=f"'{DATA_SHEET_NAME}'!A{anchor_row}",
            display=title,
        )
        index_cell.font = Font(color="0563C1", underline="single")
        index_ws.cell(index_row, 2, f"A{anchor_row}")
        index_row += 1

        row = _write_table(data_ws, table, result, start_row=row)
        row += TABLE_GAP_ROWS

    index_ws.column_dimensions["A"].width = 56
    index_ws.column_dimensions["B"].width = 10

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _tables_from_result(result: dict[str, Any]) -> list[dict[str, Any]]:
    if result.get("table_type") == "multi" and result.get("tables"):
        return [t for t in result["tables"] if not t.get("error")]
    if result.get("error"):
        return []
    return [result]


def _write_index_header(ws) -> None:
    ws.cell(1, 1, "Table of contents").font = Font(bold=True, size=14)
    ws.cell(1, 2, "Go to").font = Font(bold=True, size=14)


def _table_display_title(table: dict[str, Any], index: int) -> str:
    row = table.get("row_variable") or {}
    text = str(row.get("text") or table.get("row_header") or "").strip()
    code = str(row.get("code") or "").strip()
    if text and code:
        return f"{code}: {text}"[:120]
    if text:
        return text[:120]
    if code:
        return code[:120]
    return f"Table {index}"


def _write_table(
    ws,
    table: dict[str, Any],
    meta: dict[str, Any],
    *,
    start_row: int = 1,
) -> int:
    row = start_row
    row_var = table.get("row_variable") or {}
    ws.cell(row, 1, row_var.get("text") or table.get("row_header") or "Crosstab").font = Font(bold=True)
    row += 1

    banners = table.get("banner_variables") or []
    if banners:
        ws.cell(row, 1, "Banners: " + ", ".join(b.get("text", b.get("code", "")) for b in banners))
        row += 1

    conf = meta.get("confidence_level") or table.get("confidence_level")
    if conf and meta.get("show_significance"):
        ws.cell(row, 1, f"Significance vs Total at {int(conf * 100)}%")
        row += 1

    row += 1

    if table.get("table_type") == "array" and table.get("sections"):
        for section in table["sections"]:
            row = _write_distribution_sheet_section(ws, section, meta, start_row=row)
            row += 2
        return row

    return _write_distribution_sheet_section(ws, table, meta, start_row=row)


def _write_distribution_sheet_section(
    ws,
    table: dict[str, Any],
    meta: dict[str, Any],
    *,
    start_row: int,
) -> int:
    row = start_row
    if table.get("subquestion"):
        ws.cell(row, 1, table["subquestion"]).font = Font(bold=True, italic=True)
        row += 1

    headers = table.get("headers") or []
    show_counts = meta.get("show_counts", True)
    show_col_pct = meta.get("show_col_pct", True)
    show_row_pct = meta.get("show_row_pct", False)

    col = 1
    ws.cell(row, col, table.get("row_header") or "Answer").font = Font(bold=True)
    col += 1
    for h in headers:
        label = h.get("label", "")
        if show_counts and show_col_pct:
            ws.cell(row, col, f"{label} (n)").font = Font(bold=True)
            ws.cell(row, col + 1, f"{label} (%)").font = Font(bold=True)
            col += 2
        elif show_col_pct:
            ws.cell(row, col, f"{label} (%)").font = Font(bold=True)
            col += 1
        else:
            ws.cell(row, col, label).font = Font(bold=True)
            col += 1
        if show_row_pct and h.get("key") == "total":
            ws.cell(row, col, "Row %").font = Font(bold=True)
            col += 1
    row += 1

    header_fill = PatternFill(start_color="F1F5F9", end_color="F1F5F9", fill_type="solid")
    for r in range(start_row, row):
        for c in range(1, col):
            ws.cell(r, c).fill = header_fill

    for data_row in table.get("rows") or []:
        col = 1
        ws.cell(row, col, data_row.get("label", ""))
        col += 1
        for i, cell in enumerate(data_row.get("cells") or []):
            h = headers[i] if i < len(headers) else {}
            parts = []
            if show_counts:
                parts.append(str(cell.get("count", "")))
            if show_col_pct:
                parts.append(f"{cell.get('col_pct', '')}%")
            sig = cell.get("sig")
            if sig:
                parts.append(sig)
            if show_counts and show_col_pct:
                ws.cell(row, col, cell.get("count", ""))
                ws.cell(row, col + 1, f"{cell.get('col_pct', '')}%{(' ' + sig) if sig else ''}")
                col += 2
            else:
                ws.cell(row, col, " ".join(parts) if parts else "")
                col += 1
            if show_row_pct and h.get("key") == "total" and cell.get("row_pct") is not None:
                ws.cell(row, col, f"{cell.get('row_pct')}%")
                col += 1
        row += 1

    for c in range(1, min(col, 20)):
        ws.column_dimensions[get_column_letter(c)].width = 16

    return row
