from __future__ import annotations

import re
from typing import Any

import pandas as pd

from app.services.question_schema import build_survey_schema
from app.services.response_store import get_responses

_GIBBERISH_RE = re.compile(
    r"^(.)\1{4,}$|^[asdfghjklqwertyuiopzxcvbnm]{6,}$|^(ha|lol|test|none|na|n/a|xxx|\.|-)+$",
    re.IGNORECASE,
)
_MIN_TEXT_LEN = 3
_SPEEDER_FRACTION = 0.25  # flag if duration < 25% of median
_MIN_ARRAY_ITEMS = 4


def run_data_quality(
    survey_id: int,
    *,
    completion_status: str = "complete",
) -> dict[str, Any]:
    schema = build_survey_schema(survey_id, completion_status=completion_status)
    dataset = get_responses(survey_id, completion_status=completion_status)
    df = dataset.dataframe

    speeders = _detect_speeders(df)
    straight_liners = _detect_straight_liners(df, schema)
    gibberish = _detect_gibberish(df, schema)

    flagged_ids: set[str] = set()
    for section in (speeders, straight_liners, gibberish):
        for item in section.get("flags", []):
            rid = item.get("response_id")
            if rid is not None:
                flagged_ids.add(str(rid))

    return {
        "total_responses": len(df),
        "flagged_count": len(flagged_ids),
        "speeders": speeders,
        "straight_liners": straight_liners,
        "gibberish": gibberish,
    }


def _response_id_column(df: pd.DataFrame) -> str | None:
    for col in df.columns:
        if str(col).lower() in {"id", "response id", "responseid"}:
            return col
    return None


def _find_time_columns(df: pd.DataFrame) -> tuple[str | None, str | None]:
    cols = {str(c).lower().replace(" ", ""): c for c in df.columns}
    start = cols.get("startdate") or cols.get("datestamp")
    end = cols.get("submitdate") or cols.get("completedate")
    return (
        str(start) if start is not None else None,
        str(end) if end is not None else None,
    )


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
        flags.append(
            {
                "response_id": df.at[idx, id_col] if id_col else idx,
                "seconds": round(float(secs), 1),
                "median_seconds": round(median, 1),
            }
        )

    flags.sort(key=lambda x: x["seconds"])
    return {
        "available": True,
        "count": len(flags),
        "median_seconds": round(median, 1),
        "threshold_seconds": round(threshold, 1),
        "flags": flags[:100],
    }


def _detect_straight_liners(df: pd.DataFrame, schema: dict[str, Any]) -> dict[str, Any]:
    id_col = _response_id_column(df)
    flags: list[dict[str, Any]] = []

    for var in schema.get("variables", []):
        if var.get("kind") != "array":
            continue
        cols = [c for c in var.get("columns") or [] if c in df.columns]
        if len(cols) < _MIN_ARRAY_ITEMS:
            continue

        subset = df[cols].astype(str)
        for idx, row in subset.iterrows():
            values = [
                s for v in row
                if (s := str(v).strip()) and s.lower() not in ("nan", "", "none")
            ]
            if len(values) < _MIN_ARRAY_ITEMS:
                continue
            if len(set(values)) == 1:
                flags.append(
                    {
                        "response_id": df.at[idx, id_col] if id_col else idx,
                        "variable_id": var["id"],
                        "question": var.get("text") or var.get("code"),
                        "value": values[0],
                        "items": len(values),
                    }
                )

    return {
        "count": len(flags),
        "flags": flags[:100],
    }


def _detect_gibberish(df: pd.DataFrame, schema: dict[str, Any]) -> dict[str, Any]:
    id_col = _response_id_column(df)
    flags: list[dict[str, Any]] = []

    for var in schema.get("variables", []):
        if var.get("kind") != "text":
            continue
        col = (var.get("columns") or [var.get("code")])[0]
        if col not in df.columns:
            continue

        for idx, raw in df[col].dropna().items():
            text = str(raw).strip()
            if len(text) < _MIN_TEXT_LEN:
                continue
            if _GIBBERISH_RE.match(text) or _is_keyboard_mash(text):
                flags.append(
                    {
                        "response_id": df.at[idx, id_col] if id_col else idx,
                        "variable_id": var["id"],
                        "question": var.get("text") or var.get("code"),
                        "text": text[:120],
                    }
                )

    return {
        "count": len(flags),
        "flags": flags[:100],
    }


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
