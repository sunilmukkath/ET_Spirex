from __future__ import annotations

import io
from typing import Any

from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill
from openpyxl.utils import get_column_letter


def banner_result_to_excel(result: dict[str, Any]) -> bytes:
    wb = Workbook()
    wb.remove(wb.active)

    if result.get("table_type") == "multi" and result.get("tables"):
        for i, table in enumerate(result["tables"], start=1):
            if table.get("error"):
                continue
            title = _sheet_title(table, i)
            ws = wb.create_sheet(title=title[:31])
            _write_table(ws, table, result)
    else:
        ws = wb.create_sheet(title="Crosstab")
        _write_table(ws, result, result)

    if not wb.sheetnames:
        ws = wb.create_sheet(title="Crosstab")
        ws["A1"] = result.get("error", "No data")

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _sheet_title(table: dict[str, Any], index: int) -> str:
    row = table.get("row_variable") or {}
    code = row.get("code") or f"Table{index}"
    return str(code)[:31]


def _write_table(ws, table: dict[str, Any], meta: dict[str, Any]) -> None:
    row = 1
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
        return

    row = _write_distribution_sheet_section(ws, table, meta, start_row=row)


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
