from __future__ import annotations

import json
import re
from pathlib import Path

from app.models.pinned_surveys import PinnedSurveys

_DATA_DIR = Path(__file__).resolve().parents[2] / "data" / "pinned_surveys"


def _safe_username(username: str) -> str:
    safe = re.sub(r"[^A-Za-z0-9_-]+", "_", username.strip())
    if not safe:
        raise ValueError("Invalid username")
    return safe


def _path(username: str) -> Path:
    _DATA_DIR.mkdir(parents=True, exist_ok=True)
    return _DATA_DIR / f"{_safe_username(username)}.json"


def get_pinned_survey_ids(username: str) -> list[int]:
    path = _path(username)
    if not path.is_file():
        return []
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    payload = PinnedSurveys.model_validate(raw if isinstance(raw, dict) else {"survey_ids": raw})
    seen: set[int] = set()
    ordered: list[int] = []
    for sid in payload.survey_ids:
        try:
            value = int(sid)
        except (TypeError, ValueError):
            continue
        if value in seen:
            continue
        seen.add(value)
        ordered.append(value)
    return ordered


def set_pinned_survey_ids(username: str, survey_ids: list[int]) -> list[int]:
    seen: set[int] = set()
    ordered: list[int] = []
    for sid in survey_ids:
        try:
            value = int(sid)
        except (TypeError, ValueError):
            continue
        if value in seen:
            continue
        seen.add(value)
        ordered.append(value)
    payload = PinnedSurveys(survey_ids=ordered)
    _path(username).write_text(json.dumps(payload.model_dump(), indent=2), encoding="utf-8")
    return ordered
