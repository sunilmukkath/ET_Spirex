from __future__ import annotations

import json
import re
import time
import uuid
from pathlib import Path
from typing import Any

from app.models.workspace_prefs import AnalysisBookmark, AnalysisBookmarkCreate

_DATA_DIR = Path(__file__).resolve().parents[2] / "data" / "analysis_bookmarks"
_CACHE: dict[tuple[int, str | None], tuple[float, list[AnalysisBookmark]]] = {}
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


def _invalidate(survey_id: int) -> None:
    keys = [k for k in _CACHE if k[0] == survey_id]
    for key in keys:
        del _CACHE[key]


def list_analysis_bookmarks(survey_id: int, username: str | None = None) -> list[AnalysisBookmark]:
    cache_key = (survey_id, _safe_username(username))
    now = time.time()
    cached = _CACHE.get(cache_key)
    if cached and now - cached[0] < _CACHE_TTL:
        return list(cached[1])

    user_rows = _load_raw(survey_id, username) if username else []
    shared_rows = _load_raw(survey_id, None)
    rows = _merge_rows(user_rows, shared_rows) if user_rows else shared_rows
    bookmarks = [AnalysisBookmark.model_validate(row) for row in rows]
    _CACHE[cache_key] = (now, bookmarks)
    return bookmarks


def create_analysis_bookmark(
    survey_id: int,
    body: AnalysisBookmarkCreate,
    username: str | None = None,
) -> AnalysisBookmark:
    now = time.time()
    bookmark = AnalysisBookmark(
        id=f"bm_{uuid.uuid4().hex[:12]}",
        name=body.name.strip(),
        kind=body.kind,
        config=body.config,
        created_at=now,
        updated_at=now,
    )
    rows = _load_raw(survey_id, username)
    rows.append(bookmark.model_dump())
    _save_raw(survey_id, rows, username)
    if username:
        _save_raw(survey_id, rows, None)
    _invalidate(survey_id)
    return bookmark


def delete_analysis_bookmark(survey_id: int, bookmark_id: str, username: str | None = None) -> bool:
    changed = False
    for store_user in ([username, None] if username else [None]):
        rows = _load_raw(survey_id, store_user)
        next_rows = [r for r in rows if r.get("id") != bookmark_id]
        if len(next_rows) != len(rows):
            _save_raw(survey_id, next_rows, store_user)
            changed = True
    if changed:
        _invalidate(survey_id)
    return changed
