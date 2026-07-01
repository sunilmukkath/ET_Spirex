"""Elastic Tree branded PowerPoint template for report exports."""

from __future__ import annotations

import io
from pathlib import Path

from pptx import Presentation

TEMPLATE_PATH = (
    Path(__file__).resolve().parents[2] / "assets" / "templates" / "elastic_tree_report.pptx"
)

# Standard python-pptx layout indices (Office theme)
LAYOUT_TITLE = 0
LAYOUT_CONTENT = 1
LAYOUT_SECTION = 2
LAYOUT_BLANK = 6


def ensure_template() -> Path:
    """Create the deck template on disk if missing."""
    if TEMPLATE_PATH.is_file():
        return TEMPLATE_PATH
    TEMPLATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    TEMPLATE_PATH.write_bytes(build_template_bytes())
    return TEMPLATE_PATH


def load_template() -> Presentation:
    return Presentation(str(ensure_template()))


def template_info() -> dict[str, object]:
    path = ensure_template()
    stat = path.stat()
    return {
        "path": str(path.name),
        "exists": path.is_file(),
        "size_bytes": stat.st_size if path.is_file() else 0,
        "updated_at": stat.st_mtime if path.is_file() else None,
    }


def save_template_bytes(data: bytes) -> None:
    if not data or len(data) < 1000:
        raise ValueError("File does not look like a valid PowerPoint template")
    if not data[:2] == b"PK":
        raise ValueError("Upload must be a .pptx file")
    TEMPLATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    TEMPLATE_PATH.write_bytes(data)


def build_template_bytes() -> bytes:
    """Widescreen 16:9 presentation used as the merge-deck base."""
    prs = Presentation()
    from pptx.util import Inches

    prs.slide_width = Inches(13.333)
    prs.slide_height = Inches(7.5)
    buf = io.BytesIO()
    prs.save(buf)
    return buf.getvalue()
