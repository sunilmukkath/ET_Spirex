from __future__ import annotations

import math
import re
from typing import Any

import numpy as np
import pandas as pd

from app.services.question_schema import build_survey_schema
from app.services.response_store import get_responses
from app.services.survey_text import clean_survey_text

_GIBBERISH_RE = re.compile(
    r"^(.)\1{4,}$|^[asdfghjklqwertyuiopzxcvbnm]{6,}$|^(ha|lol|test|none|na|n/a|xxx|\.|-)+$",
    re.IGNORECASE,
)
_MIN_TEXT_LEN = 3
_SPEEDER_FRACTION = 0.25  # flag if duration < 25% of median
_MIN_ARRAY_ITEMS = 4
_EMPTY_VALUES = {"", "nan", "none", "null", "na", "n/a"}


def run_data_quality(
    survey_id: int,
    *,
    completion_status: str = "complete",
) -> dict[str, Any]:
    dataset = get_responses(survey_id, completion_status=completion_status)
    df = dataset.dataframe
    if df.empty:
        return {
            "total_responses": 0,
            "flagged_count": 0,
            "speeders": {
                "available": False,
                "message": "No responses to scan",
                "count": 0,
                "flags": [],
            },
            "straight_liners": {"count": 0, "flags": []},
            "gibberish": {"count": 0, "flags": []},
        }

    df_columns = [str(c).strip() for c in df.columns]
    col_index = {c: c for c in df_columns}

    schema = build_survey_schema(
        survey_id,
        completion_status=completion_status,
        light=True,
    )
    _attach_export_columns(schema, df_columns)

    speeders = _detect_speeders(df)
    straight_liners = _detect_straight_liners(df, schema, col_index)
    gibberish = _detect_gibberish(df, schema, col_index)

    flagged_ids: set[str] = set()
    for section in (speeders, straight_liners, gibberish):
        for item in section.get("flags", []):
            rid = item.get("response_id")
            if rid is not None:
                flagged_ids.add(str(rid))

    return {
        "total_responses": int(len(df)),
        "flagged_count": len(flagged_ids),
        "speeders": speeders,
        "straight_liners": straight_liners,
        "gibberish": gibberish,
    }


def _attach_export_columns(schema: dict[str, Any], df_columns: list[str]) -> None:
    for var in schema.get("variables", []):
        kind = var.get("kind")
        if kind == "array":
            var["columns"] = _resolve_array_columns(var, df_columns)
        elif kind == "text":
            col = _resolve_text_column(var, df_columns)
            if col:
                var["columns"] = [col]


def _resolve_array_columns(var: dict[str, Any], df_columns: list[str]) -> list[str]:
    code = str(var.get("code") or "").strip()
    schema_cols = [str(c) for c in var.get("columns") or []]
    matched = [c for c in schema_cols if c in df_columns]
    if len(matched) >= _MIN_ARRAY_ITEMS:
        return matched

    if not code:
        return matched

    inferred: list[str] = []
    for col in df_columns:
        if col == code:
            continue
        if col.startswith(f"{code}_") or col.startswith(f"{code}#"):
            inferred.append(col)
        elif col.startswith(code) and len(col) > len(code):
            inferred.append(col)

    return inferred if len(inferred) >= _MIN_ARRAY_ITEMS else matched


def _resolve_text_column(var: dict[str, Any], df_columns: list[str]) -> str | None:
    for candidate in var.get("columns") or []:
        col = str(candidate).strip()
        if col in df_columns:
            return col
    code = str(var.get("code") or "").strip()
    if code in df_columns:
        return code
    for col in df_columns:
        if col == code or col.startswith(f"{code}_"):
            return col
    return None


def _response_id_column(df: pd.DataFrame) -> str | None:
    for col in df.columns:
        if str(col).lower() in {"id", "response id", "responseid"}:
            return str(col)
    return None


def _find_time_columns(df: pd.DataFrame) -> tuple[str | None, str | None]:
    cols = {str(c).lower().replace(" ", ""): str(c) for c in df.columns}
    start = cols.get("startdate") or cols.get("datestamp")
    end = cols.get("submitdate") or cols.get("completedate")
    return start, end


def _safe_id(value: Any, fallback: Any) -> int | str:
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return _safe_id(fallback, "unknown")
    if isinstance(value, (np.integer, int)):
        return int(value)
    if isinstance(value, (np.floating, float)):
        f = float(value)
        if math.isnan(f) or math.isinf(f):
            return _safe_id(fallback, "unknown")
        if f.is_integer():
            return int(f)
        return f
    text = str(value).strip()
    return text or str(fallback)


def _safe_float(value: Any) -> float:
    try:
        f = float(value)
    except (TypeError, ValueError):
        return 0.0
    if math.isnan(f) or math.isinf(f):
        return 0.0
    return round(f, 1)


def _question_label(var: dict[str, Any]) -> str:
    raw = var.get("text") or var.get("code") or var.get("id") or "Question"
    return clean_survey_text(str(raw)) or str(var.get("code") or var.get("id") or "Question")


def _detect_speeders(df: pd.DataFrame) -> dict[str, Any]:
    start_col, end_col = _find_time_columns(df)
    id_col = _response_id_column(df)

    if not start_col or not end_col:
        return {
            "available": False,
            "message": "Start/submit date columns not found in export",
            "count": 0,
            "flags": [],
        }

    start = pd.to_datetime(df[start_col], errors="coerce")
    end = pd.to_datetime(df[end_col], errors="coerce")
    seconds = (end - start).dt.total_seconds()
    valid = seconds[(seconds > 0) & (seconds < 86400 * 7)]

    if valid.empty:
        return {
            "available": False,
            "message": "Could not compute completion times",
            "count": 0,
            "flags": [],
        }

    median = float(valid.median())
    threshold = max(30.0, median * _SPEEDER_FRACTION)
    flags = []
    for idx, secs in seconds.items():
        if pd.isna(secs) or secs <= 0 or secs >= threshold:
            continue
        response_id = _safe_id(df.at[idx, id_col] if id_col else None, idx)
        flags.append(
            {
                "response_id": response_id,
                "seconds": _safe_float(secs),
                "median_seconds": _safe_float(median),
            }
        )

    flags.sort(key=lambda x: x["seconds"])
    return {
        "available": True,
        "count": len(flags),
        "median_seconds": _safe_float(median),
        "threshold_seconds": _safe_float(threshold),
        "flags": flags[:100],
    }


def _detect_straight_liners(
    df: pd.DataFrame,
    schema: dict[str, Any],
    col_index: dict[str, str],
) -> dict[str, Any]:
    id_col = _response_id_column(df)
    flags: list[dict[str, Any]] = []

    for var in schema.get("variables", []):
        if var.get("kind") != "array":
            continue
        cols = [col_index[c] for c in var.get("columns") or [] if c in col_index]
        if len(cols) < _MIN_ARRAY_ITEMS:
            continue

        subset = df[cols].copy()
        for col in cols:
            subset[col] = subset[col].map(_normalize_cell)

        non_empty = subset.apply(
            lambda row: sum(1 for v in row if v is not None),
            axis=1,
        )
        unique_counts = subset.apply(
            lambda row: len({v for v in row if v is not None}),
            axis=1,
        )
        straight_rows = (non_empty >= _MIN_ARRAY_ITEMS) & (unique_counts == 1)

        for idx in subset.index[straight_rows]:
            values = [v for v in subset.loc[idx] if v is not None]
            if len(values) < _MIN_ARRAY_ITEMS:
                continue
            flags.append(
                {
                    "response_id": _safe_id(
                        df.at[idx, id_col] if id_col else None,
                        idx,
                    ),
                    "variable_id": str(var.get("id") or ""),
                    "question": _question_label(var),
                    "value": values[0],
                    "items": len(values),
                }
            )

    return {
        "count": len(flags),
        "flags": flags[:100],
    }


def _detect_gibberish(
    df: pd.DataFrame,
    schema: dict[str, Any],
    col_index: dict[str, str],
) -> dict[str, Any]:
    id_col = _response_id_column(df)
    flags: list[dict[str, Any]] = []

    for var in schema.get("variables", []):
        if var.get("kind") != "text":
            continue
        col = next((col_index[c] for c in var.get("columns") or [] if c in col_index), None)
        if not col:
            continue

        for idx, raw in df[col].dropna().items():
            text = str(raw).strip()
            if len(text) < _MIN_TEXT_LEN:
                continue
            if _GIBBERISH_RE.match(text) or _is_keyboard_mash(text):
                flags.append(
                    {
                        "response_id": _safe_id(
                            df.at[idx, id_col] if id_col else None,
                            idx,
                        ),
                        "variable_id": str(var.get("id") or ""),
                        "question": _question_label(var),
                        "text": text[:120],
                    }
                )

    return {
        "count": len(flags),
        "flags": flags[:100],
    }


def _normalize_cell(value: Any) -> str | None:
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return None
    text = str(value).strip()
    if not text or text.lower() in _EMPTY_VALUES:
        return None
    return text


def _is_keyboard_mash(text: str) -> bool:
    letters = re.sub(r"[^a-zA-Z]", "", text.lower())
    if len(letters) < 5:
        return False
    vowels = sum(1 for c in letters if c in "aeiou")
    if vowels == 0:
        return True
    if len(letters) >= 8 and vowels / len(letters) < 0.08:
        return True
    return False
