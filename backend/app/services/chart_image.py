"""Render simple chart PNGs for report slides (no browser required)."""

from __future__ import annotations

import io
from typing import Any

from PIL import Image, ImageDraw, ImageFont


ET_TEAL = (0, 121, 107)
ET_SLATE = (51, 65, 85)
ET_MUTED = (148, 163, 184)


def profile_distribution_png(result: dict[str, Any], *, width: int = 960, height: int = 540) -> bytes | None:
    values = result.get("values") or []
    if not values:
        return None

    rows = values[:12]
    img = Image.new("RGB", (width, height), "white")
    draw = ImageDraw.Draw(img)
    font = ImageFont.load_default()
    title_font = ImageFont.load_default()

    var = result.get("variable") or {}
    title = str(var.get("text") or var.get("code") or "Distribution")[:80]
    draw.text((40, 24), title, fill=ET_SLATE, font=title_font)

    base_n = result.get("base_n")
    if base_n is not None:
        draw.text((40, 48), f"n = {base_n}", fill=ET_MUTED, font=font)

    margin_left = 180
    margin_top = 90
    margin_bottom = 50
    chart_h = height - margin_top - margin_bottom
    bar_gap = 8
    bar_h = max(12, (chart_h - bar_gap * (len(rows) - 1)) // max(len(rows), 1))
    max_pct = max(float(r.get("percentage") or 0) for r in rows) or 1.0
    chart_w = width - margin_left - 60

    for i, row in enumerate(rows):
        label = str(row.get("label") or row.get("code") or "")[:28]
        pct = float(row.get("percentage") or 0)
        y = margin_top + i * (bar_h + bar_gap)
        draw.text((24, y + bar_h // 2 - 6), label, fill=ET_SLATE, font=font)
        bar_w = int((pct / max_pct) * chart_w) if max_pct else 0
        draw.rectangle(
            [margin_left, y, margin_left + bar_w, y + bar_h],
            fill=ET_TEAL,
        )
        draw.text(
            (margin_left + bar_w + 8, y + bar_h // 2 - 6),
            f"{pct:.1f}%",
            fill=ET_SLATE,
            font=font,
        )

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()
