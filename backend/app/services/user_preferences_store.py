"""Per-user preferences — JSON file per username."""

from __future__ import annotations

import json
import re
from pathlib import Path

from app.models.user_preferences import UserPreferences, UserPreferencesUpdate

_DATA_DIR = Path(__file__).resolve().parents[2] / "data" / "user_preferences"


def _safe_username(username: str) -> str:
    safe = re.sub(r"[^A-Za-z0-9_-]+", "_", username.strip())
    if not safe:
        raise ValueError("Invalid username")
    return safe


def _path(username: str) -> Path:
    _DATA_DIR.mkdir(parents=True, exist_ok=True)
    return _DATA_DIR / f"{_safe_username(username)}.json"


def get_user_preferences(username: str) -> UserPreferences:
    path = _path(username)
    if not path.is_file():
        return UserPreferences()
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return UserPreferences()
    if not isinstance(raw, dict):
        return UserPreferences()
    return UserPreferences.model_validate(raw)


def set_user_preferences(username: str, patch: UserPreferencesUpdate) -> UserPreferences:
    current = get_user_preferences(username)
    data = current.model_dump()
    for key, value in patch.model_dump(exclude_unset=True).items():
        data[key] = value
    saved = UserPreferences.model_validate(data)
    _path(username).write_text(json.dumps(saved.model_dump(), indent=2), encoding="utf-8")
    return saved
