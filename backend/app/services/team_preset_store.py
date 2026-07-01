from __future__ import annotations

import json
import time
import uuid
from pathlib import Path
from typing import Any

from app.models.quota_config import QuotaConfig
from app.models.qc_config import QcConfig
from app.models.team_preset import TeamPreset, TeamPresetCreate
from app.services.quota_config_store import set_quota_config
from app.services.qc_config_store import set_qc_config

_DATA_DIR = Path(__file__).resolve().parents[2] / "data" / "team_presets"
_CACHE: dict[int, tuple[float, list[TeamPreset]]] = {}
_CACHE_TTL = 60

VALID_KINDS = frozenset({"banner", "quota", "qc", "filter"})


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


def _invalidate(survey_id: int) -> None:
    _CACHE.pop(survey_id, None)


def list_team_presets(survey_id: int, kind: str | None = None) -> list[TeamPreset]:
    now = time.time()
    cached = _CACHE.get(survey_id)
    if cached and now - cached[0] < _CACHE_TTL:
        presets = list(cached[1])
    else:
        presets = [TeamPreset.model_validate(row) for row in _load_raw(survey_id)]
        _CACHE[survey_id] = (now, presets)

    if kind:
        key = kind.strip().lower()
        return [p for p in presets if p.kind == key]
    return list(presets)


def create_team_preset(
    survey_id: int,
    body: TeamPresetCreate,
    *,
    username: str | None = None,
) -> TeamPreset:
    kind = body.kind.strip().lower()
    if kind not in VALID_KINDS:
        raise ValueError(f"Invalid preset kind: {body.kind}")

    now = time.time()
    preset = TeamPreset(
        id=f"tp_{uuid.uuid4().hex[:12]}",
        name=body.name.strip(),
        kind=kind,  # type: ignore[arg-type]
        config=body.config,
        created_by=username,
        created_at=now,
        updated_at=now,
    )
    rows = _load_raw(survey_id)
    rows.append(preset.model_dump())
    _save_raw(survey_id, rows)
    _invalidate(survey_id)
    return preset


def delete_team_preset(survey_id: int, preset_id: str) -> bool:
    rows = _load_raw(survey_id)
    next_rows = [r for r in rows if r.get("id") != preset_id]
    if len(next_rows) == len(rows):
        return False
    _save_raw(survey_id, next_rows)
    _invalidate(survey_id)
    return True


def get_team_preset(survey_id: int, preset_id: str) -> TeamPreset | None:
    for preset in list_team_presets(survey_id):
        if preset.id == preset_id:
            return preset
    return None


def apply_team_preset(survey_id: int, preset_id: str) -> TeamPreset:
    preset = get_team_preset(survey_id, preset_id)
    if not preset:
        raise KeyError("Preset not found")

    if preset.kind == "quota":
        set_quota_config(survey_id, QuotaConfig.model_validate(preset.config))
    elif preset.kind == "qc":
        set_qc_config(survey_id, QcConfig.model_validate(preset.config))

    return preset
