from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field

_DATA_DIR = Path(__file__).resolve().parents[2] / "data" / "qc_config"

ALL_CHECK_IDS = frozenset({
    "speeders",
    "test_responses",
    "duplicate_phones",
    "straight_liners",
    "gibberish",
})


class QcConfig(BaseModel):
    disabled_checks: list[str] = Field(default_factory=list)
    kept_response_ids: list[str] = Field(default_factory=list)
    excluded_response_ids: list[str] = Field(default_factory=list)


def _path(survey_id: int) -> Path:
    _DATA_DIR.mkdir(parents=True, exist_ok=True)
    return _DATA_DIR / f"{survey_id}.json"


def get_qc_config(survey_id: int) -> QcConfig:
    path = _path(survey_id)
    if not path.is_file():
        return QcConfig()
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        disabled = [c for c in data.get("disabled_checks", []) if c in ALL_CHECK_IDS]
        kept = [str(x) for x in data.get("kept_response_ids", []) if str(x).strip()]
        excluded = [str(x) for x in data.get("excluded_response_ids", []) if str(x).strip()]
        return QcConfig(
            disabled_checks=disabled,
            kept_response_ids=kept,
            excluded_response_ids=excluded,
        )
    except (json.JSONDecodeError, OSError):
        return QcConfig()


def set_qc_config(survey_id: int, config: QcConfig) -> QcConfig:
    disabled = [c for c in config.disabled_checks if c in ALL_CHECK_IDS]
    kept = [str(x) for x in config.kept_response_ids if str(x).strip()]
    excluded = [str(x) for x in config.excluded_response_ids if str(x).strip()]
    normalized = QcConfig(
        disabled_checks=disabled,
        kept_response_ids=kept,
        excluded_response_ids=excluded,
    )
    _path(survey_id).write_text(json.dumps(normalized.model_dump(), indent=2), encoding="utf-8")
    from app.services.qc_filter import invalidate_flagged_cache

    invalidate_flagged_cache(survey_id)
    from app.services.response_store import invalidate_survey_cache

    invalidate_survey_cache(survey_id)
    return normalized


def enabled_check_ids(survey_id: int) -> frozenset[str]:
    disabled = set(get_qc_config(survey_id).disabled_checks)
    return ALL_CHECK_IDS - disabled
