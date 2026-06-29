from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

import pandas as pd

from app.models.quota_config import (
    QuotaCellTarget,
    QuotaConfig,
    QuotaFieldConfig,
    QuotaLayerCellTarget,
    QuotaLayerConfig,
)
from app.services.answer_labels import canonical_answer_code, label_for_answer
from app.services.analysis_context import load_analysis_context
from app.services.question_schema import get_variable
from app.services.quota_config_store import get_quota_config
from app.services.variable_columns import find_variable_column


def _eligible_for_quota(var: dict[str, Any]) -> bool:
    if var.get("kind") not in ("single", "rank"):
        return False
    return bool(var.get("answer_options"))


def _canonical_series(var: dict[str, Any], df: pd.DataFrame) -> pd.Series | None:
    col = find_variable_column(var, df)
    if not col or col not in df.columns:
        return None
    raw = df[col]
    valid_mask = raw.notna() & (raw.astype(str).str.strip() != "")
    canonical = (
        raw[valid_mask]
        .astype(str)
        .str.strip()
        .map(lambda v: canonical_answer_code(var, v))
    )
    canonical = canonical[canonical != ""]
    if canonical.empty:
        return pd.Series(dtype=str)
    return canonical


def _counts_for_variable(var: dict[str, Any], df: pd.DataFrame) -> dict[str, int]:
    canonical = _canonical_series(var, df)
    if canonical is None or canonical.empty:
        return {}
    counts = canonical.value_counts()
    return {str(code): int(count) for code, count in counts.items()}


def _layer_cell_key(variable_ids: list[str], codes: dict[str, str]) -> str:
    return "|".join(f"{vid}:{codes.get(vid, '')}" for vid in variable_ids)


def _layer_cell_label(schema: dict[str, Any], variable_ids: list[str], codes: dict[str, str]) -> str:
    parts: list[str] = []
    for vid in variable_ids:
        var = get_variable(schema, vid)
        code = str(codes.get(vid, ""))
        if var:
            parts.append(label_for_answer(var, code) or code)
        else:
            parts.append(code)
    return " · ".join(parts)


def _counts_for_layer(
    variable_ids: list[str],
    schema: dict[str, Any],
    df: pd.DataFrame,
) -> dict[str, int]:
    if len(variable_ids) < 2:
        return {}

    columns: dict[str, pd.Series] = {}
    for vid in variable_ids:
        var = get_variable(schema, vid)
        if not var:
            return {}
        series = _canonical_series(var, df)
        if series is None:
            return {}
        columns[vid] = series

    if not columns:
        return {}

    data = pd.DataFrame(columns)
    data = data.dropna(how="any")
    if data.empty:
        return {}

    grouped = data.groupby(variable_ids, observed=True).size()
    result: dict[str, int] = {}
    for keys, count in grouped.items():
        key_tuple = keys if isinstance(keys, tuple) else (keys,)
        codes = {vid: str(key_tuple[i]) for i, vid in enumerate(variable_ids)}
        result[_layer_cell_key(variable_ids, codes)] = int(count)
    return result


def _cell_status(
    *,
    actual: int,
    target: float,
    min_value: float | None,
    max_value: float | None,
    quota_type: str,
    total: int,
    tolerance_count: int,
    tolerance_pct: float,
) -> tuple[str, float]:
    if quota_type == "percent":
        actual_pct = round((actual / total) * 100, 1) if total else 0.0
        gap = round(actual_pct - target, 1)
        if min_value is not None and actual_pct < min_value:
            return "under", gap
        if max_value is not None and actual_pct > max_value:
            return "over", gap
        if target <= 0:
            return "empty", gap
        if abs(gap) <= tolerance_pct:
            return "met", gap
        return ("under", gap) if gap < 0 else ("over", gap)

    gap = float(actual - target)
    if min_value is not None and actual < min_value:
        return "under", gap
    if max_value is not None and actual > max_value:
        return "over", gap
    if target <= 0:
        return "empty", gap
    tol = tolerance_count
    if actual < target - tol:
        return "under", gap
    if actual > target + tol:
        return "over", gap
    return "met", gap


def _field_status(cells: list[dict[str, Any]]) -> str:
    statuses = {c["status"] for c in cells if c["status"] != "empty"}
    if not statuses:
        return "empty"
    if "under" in statuses or "over" in statuses:
        if "under" in statuses and "over" in statuses:
            return "mixed"
        return "under" if "under" in statuses else "over"
    return "met"


def _check_field(
    field: QuotaFieldConfig,
    schema: dict[str, Any],
    df: pd.DataFrame,
    total: int,
    config: QuotaConfig,
) -> dict[str, Any]:
    var = get_variable(schema, field.variable_id)
    if not var:
        return {
            "variable_id": field.variable_id,
            "error": "Variable not found",
            "cells": [],
            "status": "error",
        }

    actual_counts = _counts_for_variable(var, df)
    targets_by_code = {c.code: c for c in field.cells}
    codes = list(dict.fromkeys([*targets_by_code.keys(), *actual_counts.keys()]))

    cells: list[dict[str, Any]] = []
    for code in codes:
        target_row: QuotaCellTarget | None = targets_by_code.get(code)
        actual = actual_counts.get(code, 0)
        target = float(target_row.target) if target_row else 0.0
        min_value = target_row.min_value if target_row else None
        max_value = target_row.max_value if target_row else None
        status, gap = _cell_status(
            actual=actual,
            target=target,
            min_value=min_value,
            max_value=max_value,
            quota_type=field.quota_type,
            total=total,
            tolerance_count=config.tolerance_count,
            tolerance_pct=config.tolerance_pct,
        )
        actual_pct = round((actual / total) * 100, 1) if total else 0.0
        cells.append(
            {
                "code": code,
                "label": label_for_answer(var, code),
                "target": target,
                "min_value": min_value,
                "max_value": max_value,
                "actual": actual,
                "actual_pct": actual_pct,
                "gap": gap,
                "status": status,
            }
        )

    return {
        "variable_id": field.variable_id,
        "code": var.get("code", ""),
        "label": var.get("text", ""),
        "quota_type": field.quota_type,
        "cells": cells,
        "status": _field_status(cells),
    }


def _check_layer(
    layer: QuotaLayerConfig,
    schema: dict[str, Any],
    df: pd.DataFrame,
    total: int,
    config: QuotaConfig,
) -> dict[str, Any]:
    variable_ids = [str(v) for v in layer.variable_ids if str(v).strip()]
    if len(variable_ids) < 2:
        return {
            "id": layer.id,
            "name": layer.name,
            "variable_ids": variable_ids,
            "labels": {},
            "error": "Layer needs at least two quota fields",
            "cells": [],
            "status": "error",
        }

    vars_by_id: dict[str, dict[str, Any]] = {}
    labels: dict[str, str] = {}
    for vid in variable_ids:
        var = get_variable(schema, vid)
        if not var:
            return {
                "id": layer.id,
                "name": layer.name,
                "variable_ids": variable_ids,
                "labels": {},
                "error": f"Variable '{vid}' not found",
                "cells": [],
                "status": "error",
            }
        vars_by_id[vid] = var
        labels[vid] = str(var.get("text") or var.get("code") or vid)

    actual_counts = _counts_for_layer(variable_ids, schema, df)
    targets_by_key: dict[str, QuotaLayerCellTarget] = {}
    for cell in layer.cells:
        targets_by_key[_layer_cell_key(variable_ids, cell.codes)] = cell

    all_keys = list(dict.fromkeys([*targets_by_key.keys(), *actual_counts.keys()]))
    cells: list[dict[str, Any]] = []
    for key in all_keys:
        target_row = targets_by_key.get(key)
        codes = dict(target_row.codes) if target_row else {}
        if not codes and key in actual_counts:
            for part in key.split("|"):
                if ":" in part:
                    vid, code = part.split(":", 1)
                    codes[vid] = code
        actual = actual_counts.get(key, 0)
        target = float(target_row.target) if target_row else 0.0
        min_value = target_row.min_value if target_row else None
        max_value = target_row.max_value if target_row else None
        status, gap = _cell_status(
            actual=actual,
            target=target,
            min_value=min_value,
            max_value=max_value,
            quota_type=layer.quota_type,
            total=total,
            tolerance_count=config.tolerance_count,
            tolerance_pct=config.tolerance_pct,
        )
        actual_pct = round((actual / total) * 100, 1) if total else 0.0
        cells.append(
            {
                "codes": codes,
                "label": _layer_cell_label(schema, variable_ids, codes),
                "target": target,
                "min_value": min_value,
                "max_value": max_value,
                "actual": actual,
                "actual_pct": actual_pct,
                "gap": gap,
                "status": status,
            }
        )

    return {
        "id": layer.id,
        "name": layer.name or " · ".join(labels.values()),
        "variable_ids": variable_ids,
        "labels": labels,
        "quota_type": layer.quota_type,
        "cells": cells,
        "status": _field_status(cells),
    }


def _bump_summary(summary: dict[str, int], prefix: str, status: str) -> None:
    if status == "met":
        summary[f"{prefix}_ok"] += 1
    elif status == "under":
        summary[f"{prefix}_under"] += 1
    elif status == "over":
        summary[f"{prefix}_over"] += 1
    elif status == "mixed":
        summary[f"{prefix}_mixed"] += 1
    else:
        summary[f"{prefix}_empty"] += 1


def check_quotas(
    survey_id: int,
    *,
    completion_status: str | None = None,
) -> dict[str, Any]:
    config = get_quota_config(survey_id)
    basis = completion_status or config.basis
    if basis not in ("complete", "qc_approved"):
        basis = "complete"

    schema, df = load_analysis_context(survey_id, completion_status=basis)
    total = len(df)

    fields_out: list[dict[str, Any]] = []
    layers_out: list[dict[str, Any]] = []
    summary = {
        "fields_ok": 0,
        "fields_under": 0,
        "fields_over": 0,
        "fields_mixed": 0,
        "fields_empty": 0,
        "layers_ok": 0,
        "layers_under": 0,
        "layers_over": 0,
        "layers_mixed": 0,
        "layers_empty": 0,
    }

    for field in config.fields:
        result = _check_field(field, schema, df, total, config)
        fields_out.append(result)
        _bump_summary(summary, "fields", result.get("status", "empty"))

    for layer in config.layers:
        result = _check_layer(layer, schema, df, total, config)
        layers_out.append(result)
        _bump_summary(summary, "layers", result.get("status", "empty"))

    return {
        "basis": basis,
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "total_completes": total,
        "tolerance_count": config.tolerance_count,
        "tolerance_pct": config.tolerance_pct,
        "fields": fields_out,
        "layers": layers_out,
        "summary": summary,
    }


def quota_eligible_variables(schema: dict[str, Any]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for var in schema.get("variables") or []:
        if not _eligible_for_quota(var):
            continue
        out.append(
            {
                "id": var["id"],
                "code": var.get("code", ""),
                "text": var.get("text", ""),
                "answer_options": var.get("answer_options") or [],
            }
        )
    return out
