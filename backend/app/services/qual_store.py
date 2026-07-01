from __future__ import annotations

import json
import re
import time
import uuid
from pathlib import Path
from typing import Any

from app.models.qual_asset import QualAsset, QualAssetCreate, QualAssetUpdate, QualSearchHit

_DATA_DIR = Path(__file__).resolve().parents[2] / "data" / "qual"
_SNIPPET_RADIUS = 80
_MAX_CONTENT_CHARS = 500_000


def _path(survey_id: int) -> Path:
    _DATA_DIR.mkdir(parents=True, exist_ok=True)
    return _DATA_DIR / f"{survey_id}.json"


def _load_raw(survey_id: int) -> list[dict[str, Any]]:
    path = _path(survey_id)
    if not path.is_file():
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except (json.JSONDecodeError, OSError):
        return []


def _save_raw(survey_id: int, rows: list[dict[str, Any]]) -> None:
    _path(survey_id).write_text(json.dumps(rows, indent=2), encoding="utf-8")


def _word_count(text: str) -> int:
    return len(re.findall(r"\b\w+\b", text))


def _normalize_asset(row: dict[str, Any], survey_id: int) -> QualAsset:
    content = str(row.get("content") or "")
    if len(content) > _MAX_CONTENT_CHARS:
        content = content[:_MAX_CONTENT_CHARS]
    tags = row.get("tags")
    if not isinstance(tags, list):
        tags = []
    tags = [str(t).strip() for t in tags if str(t).strip()][:20]
    asset_type = str(row.get("asset_type") or "transcript")
    if asset_type not in {"transcript", "session_note"}:
        asset_type = "transcript"
    status = str(row.get("status") or "draft")
    if status not in {"draft", "reviewed", "coded"}:
        status = "draft"
    return QualAsset(
        id=str(row.get("id") or f"qa_{uuid.uuid4().hex[:12]}"),
        survey_id=survey_id,
        title=str(row.get("title") or "Untitled").strip() or "Untitled",
        asset_type=asset_type,  # type: ignore[arg-type]
        content=content,
        respondent_id=str(row.get("respondent_id") or "").strip(),
        session_date=row.get("session_date"),
        moderator=str(row.get("moderator") or "").strip(),
        tags=tags,
        status=status,  # type: ignore[arg-type]
        word_count=int(row.get("word_count") or _word_count(content)),
        created_by=row.get("created_by"),
        created_at=float(row.get("created_at") or time.time()),
        updated_at=float(row.get("updated_at") or time.time()),
    )


def list_qual_assets(survey_id: int) -> list[QualAsset]:
    return [_normalize_asset(row, survey_id) for row in _load_raw(survey_id)]


def get_qual_asset(survey_id: int, asset_id: str) -> QualAsset | None:
    for row in _load_raw(survey_id):
        if str(row.get("id")) == asset_id:
            return _normalize_asset(row, survey_id)
    return None


def create_qual_asset(
    survey_id: int,
    body: QualAssetCreate,
    *,
    username: str | None = None,
) -> QualAsset:
    now = time.time()
    content = body.content.strip()
    if not content:
        raise ValueError("Content is required")
    asset = QualAsset(
        id=f"qa_{uuid.uuid4().hex[:12]}",
        survey_id=survey_id,
        title=body.title.strip() or "Untitled",
        asset_type=body.asset_type,
        content=content[:_MAX_CONTENT_CHARS],
        respondent_id=body.respondent_id.strip(),
        session_date=body.session_date,
        moderator=body.moderator.strip(),
        tags=[t.strip() for t in body.tags if t.strip()][:20],
        status=body.status,
        word_count=_word_count(content),
        created_by=username,
        created_at=now,
        updated_at=now,
    )
    rows = _load_raw(survey_id)
    rows.append(asset.model_dump())
    _save_raw(survey_id, rows)
    return asset


def update_qual_asset(
    survey_id: int,
    asset_id: str,
    body: QualAssetUpdate,
) -> QualAsset | None:
    rows = _load_raw(survey_id)
    updated: QualAsset | None = None
    for i, row in enumerate(rows):
        if str(row.get("id")) != asset_id:
            continue
        asset = _normalize_asset(row, survey_id)
        data = asset.model_dump()
        if body.title is not None:
            data["title"] = body.title.strip() or asset.title
        if body.asset_type is not None:
            data["asset_type"] = body.asset_type
        if body.content is not None:
            data["content"] = body.content.strip()[:_MAX_CONTENT_CHARS]
            data["word_count"] = _word_count(data["content"])
        if body.respondent_id is not None:
            data["respondent_id"] = body.respondent_id.strip()
        if body.session_date is not None:
            data["session_date"] = body.session_date
        if body.moderator is not None:
            data["moderator"] = body.moderator.strip()
        if body.tags is not None:
            data["tags"] = [t.strip() for t in body.tags if t.strip()][:20]
        if body.status is not None:
            data["status"] = body.status
        data["updated_at"] = time.time()
        updated = QualAsset.model_validate(data)
        rows[i] = updated.model_dump()
        break
    if updated is None:
        return None
    _save_raw(survey_id, rows)
    return updated


def delete_qual_asset(survey_id: int, asset_id: str) -> bool:
    rows = _load_raw(survey_id)
    next_rows = [r for r in rows if str(r.get("id")) != asset_id]
    if len(next_rows) == len(rows):
        return False
    _save_raw(survey_id, next_rows)
    return True


def _snippet(text: str, query: str) -> tuple[str, int]:
    lower = text.lower()
    q = query.lower().strip()
    if not q:
        return text[:160] + ("…" if len(text) > 160 else ""), 0
    matches = list(re.finditer(re.escape(q), lower))
    if not matches:
        return text[:160] + ("…" if len(text) > 160 else ""), 0
    m = matches[0]
    start = max(0, m.start() - _SNIPPET_RADIUS)
    end = min(len(text), m.end() + _SNIPPET_RADIUS)
    snippet = text[start:end]
    if start > 0:
        snippet = "…" + snippet
    if end < len(text):
        snippet = snippet + "…"
    return snippet, len(matches)


def search_qual_assets(survey_id: int, query: str) -> list[QualSearchHit]:
    q = query.strip()
    if not q:
        return []
    hits: list[QualSearchHit] = []
    for asset in list_qual_assets(survey_id):
        snippet, count = _snippet(asset.content, q)
        title_hit = q.lower() in asset.title.lower()
        tag_hit = any(q.lower() in t.lower() for t in asset.tags)
        respondent_hit = q.lower() in asset.respondent_id.lower() if asset.respondent_id else False
        if count > 0 or title_hit or tag_hit or respondent_hit:
            hits.append(
                QualSearchHit(
                    asset_id=asset.id,
                    title=asset.title,
                    asset_type=asset.asset_type,
                    snippet=snippet if count > 0 else (asset.title if title_hit else snippet),
                    match_count=max(count, 1 if (title_hit or tag_hit or respondent_hit) else 0),
                )
            )
    hits.sort(key=lambda h: (-h.match_count, h.title.lower()))
    return hits
