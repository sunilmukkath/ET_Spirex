from __future__ import annotations

import json
import re
import time
from pathlib import Path
from typing import Any

from app.models.variable_setup import VariableSetupConfig, VariableSetupEntry, VariableSetupUpdate

_DATA_DIR = Path(__file__).resolve().parents[2] / "data" / "variable_setup"
_CACHE: dict[int, tuple[float, VariableSetupConfig]] = {}
_CACHE_TTL = 60


def _path(survey_id: int) -> Path:
    _DATA_DIR.mkdir(parents=True, exist_ok=True)
    return _DATA_DIR / f"{survey_id}.json"


def _load_raw(survey_id: int) -> dict[str, Any]:
    path = _path(survey_id)
    if not path.is_file():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (json.JSONDecodeError, OSError):
        return {}


def _save_raw(survey_id: int, data: dict[str, Any]) -> None:
    path = _path(survey_id)
    path.write_text(json.dumps(data, indent=2), encoding="utf-8")


def _invalidate(survey_id: int) -> None:
    from app.services.analysis_context import invalidate_analysis_context
    from app.services.question_schema import invalidate_schema_cache

    _CACHE.pop(survey_id, None)
    invalidate_schema_cache(survey_id)
    invalidate_analysis_context(survey_id)


def get_variable_setup_config(survey_id: int) -> VariableSetupConfig:
    now = time.time()
    cached = _CACHE.get(survey_id)
    if cached and now - cached[0] < _CACHE_TTL:
        return cached[1]

    config = VariableSetupConfig.model_validate(_load_raw(survey_id))
    _CACHE[survey_id] = (now, config)
    return config


def set_variable_setup_entry(
    survey_id: int,
    variable_id: str,
    update: VariableSetupUpdate,
) -> VariableSetupEntry:
    config = get_variable_setup_config(survey_id)
    variables = dict(config.variables)
    current = variables.get(variable_id, VariableSetupEntry())

    kind_override = update.kind_override if update.kind_override is not None else current.kind_override
    if kind_override == "":
        kind_override = None

    value_weights = current.value_weights
    if update.value_weights is not None:
        cleaned: dict[str, float] = {}
        for code, weight in update.value_weights.items():
            key = str(code).strip()
            if not key:
                continue
            try:
                cleaned[key] = float(weight)
            except (TypeError, ValueError):
                continue
        value_weights = cleaned

    entry = VariableSetupEntry(kind_override=kind_override, value_weights=value_weights)
    if not entry.kind_override and not entry.value_weights:
        variables.pop(variable_id, None)
    else:
        variables[variable_id] = entry

    next_config = VariableSetupConfig(variables=variables)
    _save_raw(survey_id, next_config.model_dump())
    _invalidate(survey_id)
    _CACHE[survey_id] = (time.time(), next_config)
    return entry


def clear_variable_setup_entry(survey_id: int, variable_id: str) -> None:
    config = get_variable_setup_config(survey_id)
    variables = dict(config.variables)
    if variable_id not in variables:
        return
    variables.pop(variable_id)
    next_config = VariableSetupConfig(variables=variables)
    _save_raw(survey_id, next_config.model_dump())
    _invalidate(survey_id)
    _CACHE[survey_id] = (time.time(), next_config)
