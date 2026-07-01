"""Reusable survey asset library — question banks, label sets, blocks."""

from __future__ import annotations

import json
import time
import uuid
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, Field

from app.models.et_survey import EtBlock, EtQuestion

AssetKind = Literal["question", "block", "label_set"]

_DATA_DIR = Path(__file__).resolve().parents[2] / "data" / "survey_assets"


class LabelSetAsset(BaseModel):
    id: str
    name: str
    options: list[dict[str, str]] = Field(default_factory=list)


class SurveyAssetRecord(BaseModel):
    asset_id: str
    kind: AssetKind
    name: str
    payload: dict[str, Any]
    created_by: str
    created_at: float
    updated_at: float


def _path() -> Path:
    _DATA_DIR.mkdir(parents=True, exist_ok=True)
    return _DATA_DIR / "library.json"


def _load() -> list[dict[str, Any]]:
    path = _path()
    if not path.is_file():
        return []
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
        return raw if isinstance(raw, list) else []
    except (OSError, json.JSONDecodeError):
        return []


def _save(rows: list[dict[str, Any]]) -> None:
    _path().write_text(json.dumps(rows, indent=2), encoding="utf-8")


def list_assets(*, kind: AssetKind | None = None) -> list[SurveyAssetRecord]:
    rows = _load()
    out: list[SurveyAssetRecord] = []
    for raw in rows:
        try:
            rec = SurveyAssetRecord.model_validate(raw)
        except Exception:
            continue
        if kind and rec.kind != kind:
            continue
        out.append(rec)
    return out


def save_asset(
    *,
    kind: AssetKind,
    name: str,
    payload: EtQuestion | EtBlock | LabelSetAsset | dict[str, Any],
    created_by: str,
) -> SurveyAssetRecord:
    if hasattr(payload, "model_dump"):
        body = payload.model_dump()
    else:
        body = dict(payload)
    now = time.time()
    rec = SurveyAssetRecord(
        asset_id=uuid.uuid4().hex[:12],
        kind=kind,
        name=name.strip(),
        payload=body,
        created_by=created_by,
        created_at=now,
        updated_at=now,
    )
    rows = _load()
    rows.append(rec.model_dump())
    _save(rows)
    return rec


def get_asset(asset_id: str) -> SurveyAssetRecord | None:
    for raw in _load():
        if str(raw.get("asset_id")) == asset_id:
            try:
                return SurveyAssetRecord.model_validate(raw)
            except Exception:
                return None
    return None
