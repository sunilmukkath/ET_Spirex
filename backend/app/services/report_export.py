from __future__ import annotations

import io
from typing import Any

from fpdf import FPDF
from pptx import Presentation
from pptx.util import Inches, Pt


def _safe_text(text: str, max_len: int = 120) -> str:
    cleaned = (text or "").replace("\n", " ").strip()
    if len(cleaned) > max_len:
        return cleaned[: max_len - 1] + "…"
    return cleaned.encode("latin-1", errors="replace").decode("latin-1")


def profile_to_pdf(result: dict[str, Any], title: str, *, narrative: str | None = None) -> bytes:
    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 16)
    pdf.cell(0, 10, _safe_text(title, 80), ln=True)
    pdf.set_font("Helvetica", "", 11)
    pdf.ln(4)

    if result.get("error"):
        pdf.multi_cell(0, 8, _safe_text(result["error"]))
        return bytes(pdf.output())

    var = result.get("variable") or {}
    pdf.cell(0, 8, _safe_text(var.get("text") or var.get("code") or "Question"), ln=True)
    pdf.ln(2)

    scale = result.get("scale_metrics") or {}
    if scale:
        pdf.set_font("Helvetica", "B", 12)
        pdf.cell(0, 8, "Scale summary", ln=True)
        pdf.set_font("Helvetica", "", 10)
        for key, label in [
            ("top2box_pct", "Top 2 box"),
            ("bottom2box_pct", "Bottom 2 box"),
            ("net_pct", "Net (top - bottom)"),
            ("nps", "NPS"),
            ("mean", "Mean"),
        ]:
            if scale.get(key) is not None:
                val = scale[key]
                suffix = "%" if key != "mean" and key != "nps" else ("%" if key == "nps" else "")
                pdf.cell(0, 6, f"{label}: {val}{suffix}", ln=True)
        pdf.ln(4)

    if result.get("analysis_type") == "distribution" and result.get("values"):
        pdf.set_font("Helvetica", "B", 12)
        pdf.cell(0, 8, f"Distribution (n={result.get('base_n', 0)})", ln=True)
        pdf.set_font("Helvetica", "B", 10)
        pdf.cell(90, 7, "Answer", border=1)
        pdf.cell(30, 7, "Count", border=1)
        pdf.cell(30, 7, "%", border=1, ln=True)
        pdf.set_font("Helvetica", "", 10)
        for row in result["values"][:30]:
            pdf.cell(90, 6, _safe_text(str(row.get("label") or row.get("code")), 50), border=1)
            pdf.cell(30, 6, str(row.get("count", 0)), border=1)
            pdf.cell(30, 6, str(row.get("percentage", 0)), border=1, ln=True)
    elif result.get("analysis_type") == "numeric":
        pdf.set_font("Helvetica", "", 10)
        for label, key in [
            ("N", "count"),
            ("Mean", "mean"),
            ("Median", "median"),
            ("Std dev", "std"),
            ("Min", "min"),
            ("Max", "max"),
        ]:
            if result.get(key) is not None:
                pdf.cell(0, 6, f"{label}: {result[key]}", ln=True)

    if narrative and narrative.strip():
        pdf.ln(4)
        pdf.set_font("Helvetica", "B", 12)
        pdf.cell(0, 8, "Key insights", ln=True)
        pdf.set_font("Helvetica", "", 10)
        for line in narrative.strip().splitlines():
            line = line.strip()
            if line:
                pdf.multi_cell(0, 6, _safe_text(line, 200))

    return bytes(pdf.output())


def banner_to_pdf(result: dict[str, Any], title: str, *, narrative: str | None = None) -> bytes:
    pdf = FPDF(orientation="L")
    pdf.set_auto_page_break(auto=True, margin=10)
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 14)
    pdf.cell(0, 10, _safe_text(title, 80), ln=True)

    if result.get("error"):
        pdf.set_font("Helvetica", "", 11)
        pdf.multi_cell(0, 8, _safe_text(result["error"]))
        return bytes(pdf.output())

    tables = result.get("tables") or [result]
    for table in tables:
        if table.get("error"):
            continue
        pdf.set_font("Helvetica", "B", 11)
        pdf.cell(0, 8, _safe_text(table.get("row_variable", {}).get("text", "Crosstab")), ln=True)
        headers = table.get("headers") or []
        rows = table.get("rows") or []
        if not headers or not rows:
            continue
        pdf.set_font("Helvetica", "B", 8)
        col_w = max(25, min(45, 250 / max(len(headers), 1)))
        for h in headers[:12]:
            pdf.cell(col_w, 6, _safe_text(str(h.get("label", "")), 20), border=1)
        pdf.ln()
        pdf.set_font("Helvetica", "", 8)
        for row in rows[:40]:
            if row.get("is_total"):
                pdf.set_font("Helvetica", "B", 8)
            cells = row.get("cells") or []
            for cell in cells[:12]:
                val = cell.get("col_pct")
                if val is None:
                    val = cell.get("count")
                pdf.cell(col_w, 5, str(val if val is not None else ""), border=1)
            pdf.ln()
            pdf.set_font("Helvetica", "", 8)
        pdf.ln(4)

    if narrative and narrative.strip():
        pdf.set_font("Helvetica", "B", 11)
        pdf.cell(0, 8, "Key insights", ln=True)
        pdf.set_font("Helvetica", "", 9)
        for line in narrative.strip().splitlines():
            line = line.strip()
            if line:
                pdf.multi_cell(0, 6, _safe_text(line, 200))
        pdf.ln(2)

    return bytes(pdf.output())


def _append_narrative_block(tf, narrative: str | None) -> None:
    if not narrative or not narrative.strip():
        return
    sep = tf.add_paragraph()
    sep.text = ""
    heading = tf.add_paragraph()
    heading.text = "Key insights"
    heading.font.size = Pt(14)
    heading.font.bold = True
    for line in narrative.strip().splitlines():
        line = line.strip()
        if not line:
            continue
        if not line.startswith("•"):
            line = f"• {line.lstrip('-* ')}"
        para = tf.add_paragraph()
        para.text = line
        para.font.size = Pt(12)
        para.level = 0


def profile_to_pptx(result: dict[str, Any], title: str, *, narrative: str | None = None) -> bytes:
    prs = Presentation()
    slide = prs.slides.add_slide(prs.slide_layouts[5])
    slide.shapes.title.text = _safe_text(title, 80)

    tf = slide.placeholders[1].text_frame
    tf.clear()
    if result.get("error"):
        tf.text = _safe_text(result["error"])
    else:
        var = result.get("variable") or {}
        p = tf.paragraphs[0]
        p.text = _safe_text(var.get("text") or "Question")
        p.font.size = Pt(18)

        scale = result.get("scale_metrics") or {}
        if scale:
            for key, label in [
                ("top2box_pct", "Top 2 box"),
                ("bottom2box_pct", "Bottom 2 box"),
                ("net_pct", "Net"),
                ("nps", "NPS"),
            ]:
                if scale.get(key) is not None:
                    para = tf.add_paragraph()
                    para.text = f"{label}: {scale[key]}%"
                    para.font.size = Pt(14)

        if result.get("values"):
            for row in result["values"][:12]:
                para = tf.add_paragraph()
                para.text = f"{row.get('label')}: {row.get('percentage')}% (n={row.get('count')})"
                para.font.size = Pt(12)

        _append_narrative_block(tf, narrative)

    buf = io.BytesIO()
    prs.save(buf)
    return buf.getvalue()


def banner_to_pptx(result: dict[str, Any], title: str, *, narrative: str | None = None) -> bytes:
    prs = Presentation()
    slide = prs.slides.add_slide(prs.slide_layouts[5])
    slide.shapes.title.text = _safe_text(title, 80)
    tf = slide.placeholders[1].text_frame
    tf.clear()

    if result.get("error"):
        tf.text = _safe_text(result["error"])
    else:
        tables = result.get("tables") or [result]
        for table in tables[:3]:
            if table.get("error"):
                continue
            p = tf.add_paragraph()
            p.text = _safe_text(table.get("row_variable", {}).get("text", "Crosstab"))
            p.font.size = Pt(16)
            for row in (table.get("rows") or [])[:8]:
                para = tf.add_paragraph()
                label = row.get("label") or row.get("code") or ""
                cells = row.get("cells") or []
                pct = cells[1].get("col_pct") if len(cells) > 1 else None
                para.text = f"{label}: {pct}%" if pct is not None else str(label)
                para.font.size = Pt(11)

        _append_narrative_block(tf, narrative)

    buf = io.BytesIO()
    prs.save(buf)
    return buf.getvalue()
