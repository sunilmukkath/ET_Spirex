from __future__ import annotations

import json
import re
import time
from pathlib import Path
from typing import Any

_DATA_DIR = Path(__file__).resolve().parents[2] / "data" / "variable_kind_overrides"
_CACHE: dict[tuple[int, str | None], tuple[float, dict[str, bool]]] = {}
_CACHE_TTL = 60


def invalidate_kind_override_cache(survey_id: int | None = None) -> None:
    from app.services.analysis_context import invalidate_analysis_context
    from app.services.question_schema import invalidate_schema_cache

    if survey_id is None:
        _CACHE.clear()
        invalidate_schema_cache(None)
        invalidate_analysis_context(None)
        return
    keys = [k for k in _CACHE if k[0] == survey_id]
    for key in keys:
        del _CACHE[key]
    invalidate_schema_cache(survey_id)
    invalidate_analysis_context(survey_id)


def _safe_username(username: str | None) -> str | None:
    if not username:
        return None
    safe = re.sub(r"[^A-Za-z0-9_-]+", "_", username.strip())
    return safe or None


def _path(survey_id: int, username: str | None = None) -> Path:
    _DATA_DIR.mkdir(parents=True, exist_ok=True)
    safe_user = _safe_username(username)
    if safe_user:
        user_dir = _DATA_DIR / safe_user
        user_dir.mkdir(parents=True, exist_ok=True)
        return user_dir / f"{survey_id}.json"
    return _DATA_DIR / f"{survey_id}.json"


def _load_raw(survey_id: int, username: str | None = None) -> dict[str, Any]:
    path = _path(survey_id, username)
    if not path.is_file():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (json.JSONDecodeError, OSError):
        return {}


def _save_raw(survey_id: int, data: dict[str, Any], username: str | None = None) -> None:
    path = _path(survey_id, username)
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")


def _merge_maps(primary: dict[str, Any], fallback: dict[str, Any]) -> dict[str, bool]:
    merged: dict[str, bool] = {}
    for source in (fallback, primary):
        for key, value in source.items():
            if isinstance(value, bool):
                merged[str(key)] = value
            elif isinstance(value, dict) and "treat_as_categorical" in value:
                merged[str(key)] = bool(value["treat_as_categorical"])
    return merged


def list_kind_overrides(survey_id: int, username: str | None = None) -> dict[str, bool]:
    cache_key = (survey_id, _safe_username(username))
    now = time.time()
    cached = _CACHE.get(cache_key)
    if cached and now - cached[0] < _CACHE_TTL:
        return dict(cached[1])

    user_rows = _load_raw(survey_id, username) if username else {}
    shared_rows = _load_raw(survey_id, None)
    merged = _merge_maps(user_rows, shared_rows)
    active = {vid: True for vid, enabled in merged.items() if enabled}
    _CACHE[cache_key] = (now, active)
    return active


def sync_kind_overrides(
    survey_id: int,
    overrides: dict[str, bool],
    username: str | None = None,
) -> dict[str, bool]:
    normalized = {str(k): bool(v) for k, v in overrides.items() if v}
    _save_raw(survey_id, normalized, username)
    if username:
        _save_raw(survey_id, normalized, None)
    invalidate_kind_override_cache(survey_id)
    return normalized


def set_kind_override(
    survey_id: int,
    variable_id: str,
    treat_as_categorical: bool,
    username: str | None = None,
) -> dict[str, bool]:
    current = list_kind_overrides(survey_id, username)
    if treat_as_categorical:
        current[variable_id] = True
    else:
        current.pop(variable_id, None)
    return sync_kind_overrides(survey_id, current, username=username)
