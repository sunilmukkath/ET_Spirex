"""Persist custom project import column mapping from a master sheet upload."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

_CONFIG_DIR = Path(__file__).resolve().parents[2] / "assets" / "import"
_MAPPING_PATH = _CONFIG_DIR / "project_import_mapping.json"
_TEMPLATE_PATH = _CONFIG_DIR / "project_import_master.xlsx"


def _ensure_dir() -> None:
    _CONFIG_DIR.mkdir(parents=True, exist_ok=True)


def load_column_mapping() -> dict[str, str]:
    """Map original spreadsheet header text → internal field name."""
    if not _MAPPING_PATH.exists():
        return {}
    try:
        data = json.loads(_MAPPING_PATH.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}
    raw = data.get("column_map") if isinstance(data, dict) else None
    if not isinstance(raw, dict):
        return {}
    return {str(k): str(v) for k, v in raw.items() if k and v}


def save_column_mapping(column_map: dict[str, str], *, source_filename: str = "") -> dict[str, Any]:
    _ensure_dir()
    payload = {
        "column_map": column_map,
        "source_filename": source_filename,
    }
    _MAPPING_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return import_config_info()


def save_master_template(data: bytes) -> Path:
    _ensure_dir()
    _TEMPLATE_PATH.write_bytes(data)
    return _TEMPLATE_PATH


def import_config_info() -> dict[str, Any]:
    mapping = load_column_mapping()
    return {
        "configured": bool(mapping),
        "column_count": len(mapping),
        "column_map": mapping,
        "template_exists": _TEMPLATE_PATH.exists(),
        "template_size_bytes": _TEMPLATE_PATH.stat().st_size if _TEMPLATE_PATH.exists() else 0,
    }
