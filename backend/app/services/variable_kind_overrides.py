from __future__ import annotations

from typing import Any

import pandas as pd

from app.services.answer_labels import builtin_scale_options
from app.services.question_types import get_type_info
from app.services.variable_columns import find_variable_column as _find_column
from app.services.variable_kind_override_store import list_kind_overrides


_OVERRIDABLE_KINDS = frozenset({"numeric", "rank"})


def apply_kind_overrides(
    survey_id: int,
    schema: dict[str, Any],
    df: pd.DataFrame | None = None,
) -> dict[str, Any]:
    overrides = list_kind_overrides(survey_id)
    if not overrides:
        return schema

    schema = dict(schema)
    variables = []
    for var in schema.get("variables") or []:
        if var.get("id") in overrides and overrides[var["id"]]:
            variables.append(_as_categorical(var, df))
        else:
            variables.append(_strip_override_meta(var))
    schema["variables"] = variables
    return schema


def _strip_override_meta(var: dict[str, Any]) -> dict[str, Any]:
    if not var.get("treat_as_categorical"):
        return var
    out = dict(var)
    out.pop("treat_as_categorical", None)
    out.pop("original_kind", None)
    info = get_type_info(str(var.get("ls_type") or ""))
    out["kind"] = info.kind
    out["type_label"] = info.label
    out["metrics"] = list(info.metrics)
    return out


def _as_categorical(var: dict[str, Any], df: pd.DataFrame | None) -> dict[str, Any]:
    original_kind = var.get("original_kind") or var.get("kind")
    if original_kind not in _OVERRIDABLE_KINDS:
        return var

    out = dict(var)
    out["original_kind"] = original_kind
    out["treat_as_categorical"] = True
    out["kind"] = "single"
    info = get_type_info(str(var.get("ls_type") or ""))
    out["type_label"] = f"{info.label} · as categorical"
    out["metrics"] = ["distribution"]
    out["can_banner"] = True
    out["can_filter"] = True

    options = list(out.get("answer_options") or [])
    if not options:
        options = _builtin_options(var)
    if not options and df is not None:
        options = _options_from_data(var, df)
    out["answer_options"] = options
    return out


def _builtin_options(var: dict[str, Any]) -> list[dict[str, Any]]:
    ls_type = str(var.get("ls_type") or "")
    raw = builtin_scale_options(ls_type)
    if raw:
        return [{"code": code, "label": label, "sort_order": i} for i, (code, label) in enumerate(raw)]
    presets = get_type_info(ls_type)
    if presets.kind == "single" and var.get("answer_options"):
        return list(var["answer_options"])
    return []


def _options_from_data(var: dict[str, Any], df: pd.DataFrame) -> list[dict[str, Any]]:
    col = _find_column(var, df)
    if not col or col not in df.columns:
        return []

    series = df[col].dropna().astype(str).str.strip()
    series = series[~series.str.lower().isin(["nan", "none", ""])]
    if series.empty:
        return []

    def sort_key(val: str) -> tuple[int, float | str]:
        try:
            return (0, float(val))
        except ValueError:
            return (1, val.lower())

    unique = sorted(set(series.tolist()), key=sort_key)
    return [{"code": v, "label": v, "sort_order": i} for i, v in enumerate(unique)]


def eligible_for_categorical_override(var: dict[str, Any]) -> bool:
    if var.get("custom"):
        return False
    kind = var.get("original_kind") or var.get("kind")
    if kind not in _OVERRIDABLE_KINDS:
        return False
    if kind == "numeric" and var.get("ls_type") == "K" and len(var.get("subquestions") or []) > 1:
        return False
    return True
