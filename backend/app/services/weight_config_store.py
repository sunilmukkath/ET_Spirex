from __future__ import annotations

import json
import re
import time
from pathlib import Path
from typing import Any

from app.models.workspace_prefs import WeightConfig

_DATA_DIR = Path(__file__).resolve().parents[2] / "data" / "weight_configs"
_CACHE: dict[tuple[int, str | None], tuple[float, WeightConfig]] = {}
_CACHE_TTL = 60


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


def _invalidate(survey_id: int) -> None:
    from app.services.analysis_context import invalidate_analysis_context

    keys = [k for k in _CACHE if k[0] == survey_id]
    for key in keys:
        del _CACHE[key]
    invalidate_analysis_context(survey_id)


def get_weight_config(survey_id: int, username: str | None = None) -> WeightConfig:
    cache_key = (survey_id, _safe_username(username))
    now = time.time()
    cached = _CACHE.get(cache_key)
    if cached and now - cached[0] < _CACHE_TTL:
        return cached[1]

    user_data = _load_raw(survey_id, username) if username else {}
    shared_data = _load_raw(survey_id, None)
    merged = {**shared_data, **user_data}
    config = WeightConfig.model_validate(merged)
    _CACHE[cache_key] = (now, config)
    return config


def set_weight_config(
    survey_id: int,
    config: WeightConfig,
    username: str | None = None,
) -> WeightConfig:
    payload = config.model_dump()
    _save_raw(survey_id, payload, username)
    if username:
        _save_raw(survey_id, payload, None)
    _invalidate(survey_id)
    return config
