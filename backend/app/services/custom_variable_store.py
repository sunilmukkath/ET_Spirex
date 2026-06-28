from __future__ import annotations

import json
import re
import time
import uuid
from pathlib import Path
from typing import Any

from app.models.custom_variable import (
    CustomVariable,
    CustomVariableCreate,
    CustomVariableUpdate,
)

_DATA_DIR = Path(__file__).resolve().parents[2] / "data" / "custom_variables"
_LIST_CACHE: dict[tuple[int, str | None], tuple[float, list[CustomVariable]]] = {}
_LIST_TTL = 60


def invalidate_custom_variable_cache(survey_id: int | None = None) -> None:
    if survey_id is None:
        _LIST_CACHE.clear()
        return
    keys = [k for k in _LIST_CACHE if k[0] == survey_id]
    for key in keys:
        del _LIST_CACHE[key]


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


def _load_raw(survey_id: int, username: str | None = None) -> list[dict[str, Any]]:
    path = _path(survey_id, username)
    if not path.is_file():
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except (json.JSONDecodeError, OSError):
        return []


def _save_raw(survey_id: int, rows: list[dict[str, Any]], username: str | None = None) -> None:
    path = _path(survey_id, username)
    path.write_text(json.dumps(rows, indent=2), encoding="utf-8")


def _merge_rows(primary: list[dict[str, Any]], fallback: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_id = {row.get("id"): row for row in fallback if row.get("id")}
    by_id.update({row.get("id"): row for row in primary if row.get("id")})
    merged = list(by_id.values())
    merged.sort(key=lambda row: float(row.get("updated_at") or row.get("created_at") or 0))
    return merged


def list_custom_variables(survey_id: int, username: str | None = None) -> list[CustomVariable]:
    cache_key = (survey_id, _safe_username(username))
    now = time.time()
    cached = _LIST_CACHE.get(cache_key)
    if cached and now - cached[0] < _LIST_TTL:
        return list(cached[1])

    user_rows = _load_raw(survey_id, username) if username else []
    shared_rows = _load_raw(survey_id, None)
    rows = _merge_rows(user_rows, shared_rows) if user_rows else shared_rows
    variables = [CustomVariable.model_validate(row) for row in rows]
    _LIST_CACHE[cache_key] = (now, variables)
    return variables


def get_custom_variable(
    survey_id: int,
    variable_id: str,
    username: str | None = None,
) -> CustomVariable | None:
    for row in _load_raw(survey_id, username):
        if row.get("id") == variable_id:
            return CustomVariable.model_validate(row)
    if username:
        for row in _load_raw(survey_id, None):
            if row.get("id") == variable_id:
                return CustomVariable.model_validate(row)
    return None


def create_custom_variable(
    survey_id: int,
    body: CustomVariableCreate,
    username: str | None = None,
) -> CustomVariable:
    now = time.time()
    var = CustomVariable(
        id=f"cv_{uuid.uuid4().hex[:12]}",
        survey_id=survey_id,
        created_at=now,
        updated_at=now,
        **body.model_dump(),
    )
    rows = _load_raw(survey_id, username)
    rows.append(var.model_dump())
    _save_raw(survey_id, rows, username)
    if username:
        _save_raw(survey_id, rows, None)
    invalidate_custom_variable_cache(survey_id)
    return var


def update_custom_variable(
    survey_id: int,
    variable_id: str,
    body: CustomVariableUpdate,
    username: str | None = None,
) -> CustomVariable | None:
    rows = _load_raw(survey_id, username)
    if not rows and username:
        rows = _load_raw(survey_id, None)
    for i, row in enumerate(rows):
        if row.get("id") != variable_id:
            continue
        updates = body.model_dump(exclude_unset=True)
        row.update(updates)
        row["updated_at"] = time.time()
        rows[i] = row
        _save_raw(survey_id, rows, username)
        if username:
            _save_raw(survey_id, rows, None)
        invalidate_custom_variable_cache(survey_id)
        return CustomVariable.model_validate(row)
    return None


def delete_custom_variable(
    survey_id: int,
    variable_id: str,
    username: str | None = None,
) -> bool:
    rows = _load_raw(survey_id, username)
    if not rows and username:
        rows = _load_raw(survey_id, None)
    new_rows = [r for r in rows if r.get("id") != variable_id]
    if len(new_rows) == len(rows):
        return False
    _save_raw(survey_id, new_rows, username)
    if username:
        _save_raw(survey_id, new_rows, None)
    invalidate_custom_variable_cache(survey_id)
    return True


def sync_custom_variables(
    survey_id: int,
    variables: list[dict[str, Any]],
    username: str | None = None,
) -> list[CustomVariable]:
    now = time.time()
    normalized: list[dict[str, Any]] = []
    for row in variables:
        payload = dict(row)
        payload["survey_id"] = survey_id
        payload.setdefault("id", f"cv_{uuid.uuid4().hex[:12]}")
        payload.setdefault("created_at", now)
        payload["updated_at"] = now
        normalized.append(payload)

    _save_raw(survey_id, normalized, username)
    if username:
        _save_raw(survey_id, normalized, None)
    invalidate_custom_variable_cache(survey_id)
    return [CustomVariable.model_validate(row) for row in normalized]
