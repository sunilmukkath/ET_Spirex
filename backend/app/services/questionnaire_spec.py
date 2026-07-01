"""Questionnaire programming spec export (Excel / Word) for field programmers."""

from __future__ import annotations

import io
from typing import Any

from docx import Document
from docx.shared import Inches
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill
from openpyxl.utils import get_column_letter


def _spec_rows(schema: dict[str, Any]) -> list[dict[str, str]]:
    groups = {g["id"]: g.get("title", "") for g in schema.get("groups") or []}
    rows: list[dict[str, str]] = []
    for var in schema.get("variables") or []:
        gid = var.get("group_id")
        options = var.get("answer_options") or []
        option_text = "; ".join(
            f"{o.get('code', '')}={o.get('label', '')}" for o in options[:40]
        )
        subs = var.get("subquestions") or []
        sub_text = "; ".join(f"{s.get('code', '')}={s.get('label', '')}" for s in subs[:20])
        rows.append(
            {
                "group": str(groups.get(gid) or var.get("group_title") or ""),
                "code": str(var.get("code") or ""),
                "variable_id": str(var.get("id") or ""),
                "question": str(var.get("text") or ""),
                "type": str(var.get("type_label") or var.get("ls_type") or ""),
                "kind": str(var.get("kind") or ""),
                "answers": option_text or sub_text,
                "columns": ", ".join(str(c) for c in (var.get("columns") or [])[:8]),
            }
        )
    return rows


def questionnaire_spec_excel(schema: dict[str, Any], *, title: str = "Questionnaire") -> bytes:
    rows = _spec_rows(schema)
    wb = Workbook()
    ws = wb.active
    ws.title = "Questionnaire"
    headers = ["Group", "Code", "Variable ID", "Question text", "Type", "Kind", "Answers / items", "Columns"]
    header_fill = PatternFill("solid", fgColor="00796B")
    header_font = Font(bold=True, color="FFFFFF")
    for col, label in enumerate(headers, 1):
        cell = ws.cell(row=1, column=col, value=label)
        cell.fill = header_fill
        cell.font = header_font

    for r, row in enumerate(rows, 2):
        ws.cell(row=r, column=1, value=row["group"])
        ws.cell(row=r, column=2, value=row["code"])
        ws.cell(row=r, column=3, value=row["variable_id"])
        ws.cell(row=r, column=4, value=row["question"])
        ws.cell(row=r, column=5, value=row["type"])
        ws.cell(row=r, column=6, value=row["kind"])
        ws.cell(row=r, column=7, value=row["answers"])
        ws.cell(row=r, column=8, value=row["columns"])

    ws.freeze_panes = "A2"
    widths = [22, 12, 14, 48, 16, 12, 40, 24]
    for i, w in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(i)].width = w

    meta = wb.create_sheet("Meta")
    meta["A1"] = "Survey"
    meta["B1"] = title
    meta["A2"] = "Questions"
    meta["B2"] = len(rows)

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def questionnaire_spec_docx(schema: dict[str, Any], *, title: str = "Questionnaire") -> bytes:
    rows = _spec_rows(schema)
    doc = Document()
    doc.add_heading(title, 0)
    doc.add_paragraph(f"{len(rows)} questions — programming specification for LimeSurvey / field team.")

    table = doc.add_table(rows=1, cols=5)
    table.style = "Table Grid"
    hdr = table.rows[0].cells
    for i, label in enumerate(["Code", "Type", "Question", "Answers / items", "Group"]):
        hdr[i].text = label
        for p in hdr[i].paragraphs:
            for run in p.runs:
                run.font.bold = True

    for row in rows:
        cells = table.add_row().cells
        cells[0].text = row["code"]
        cells[1].text = row["type"]
        cells[2].text = row["question"][:500]
        cells[3].text = row["answers"][:800]
        cells[4].text = row["group"]

    for section in doc.sections:
        section.left_margin = Inches(0.7)
        section.right_margin = Inches(0.7)

    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()
