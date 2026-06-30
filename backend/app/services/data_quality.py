from __future__ import annotations

import math
import re
import time
from collections import defaultdict
from typing import Any

import numpy as np
import pandas as pd

from app.services.question_schema import build_survey_schema
from app.services.response_store import get_responses
from app.services.survey_text import clean_survey_text

_QUALITY_CACHE: dict[int, tuple[float, dict[str, Any]]] = {}
_QUALITY_TTL_SECONDS = 300

_GIBBERISH_EXACT = {
    "na", "n/a", "none", "lol", "xxx", "test", "ha", ".", "-", "asdf", "qwerty",
}
_NAME_HINTS = (
    "name",
    "firstname",
    "first name",
    "lastname",
    "last name",
    "surname",
    "fullname",
    "full name",
    "respondent",
    "participant",
    "contact name",
    "your name",
    "fname",
    "lname",
    "middle name",
    "middlename",
)
_TEST_RE = re.compile(
    r"\b(test(ing)?|dummy|fake|sample|null|delete|asdf|qwerty|xxx+|placeholder|not real|no answer)\b",
    re.IGNORECASE,
)
_TEST_EXACT = {
    "test", "testing", "test123", "test test", "dummy", "fake", "sample",
    "asdf", "asdfgh", "qwerty", "xxx", "na", "n/a", "none", "null",
    "123", "1234", "12345", "111", "000", "aaa", "abc",
}
_PHONE_HINTS = ("phone", "mobile", "cell", "tel", "contact", "whatsapp", "number")
_MIN_TEXT_LEN = 3
_SPEEDER_FRACTION = 0.25
_MIN_ARRAY_ITEMS = 4
_EMPTY_VALUES = {"", "nan", "none", "null", "na", "n/a"}
_MAX_FLAGS = 150


def _sanitize_for_json(value: Any) -> Any:
    """Convert numpy/pandas scalars and non-JSON floats for API responses."""
    if isinstance(value, dict):
        return {k: _sanitize_for_json(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_sanitize_for_json(v) for v in value]
    if isinstance(value, tuple):
        return [_sanitize_for_json(v) for v in value]
    if isinstance(value, (np.integer,)):
        return int(value)
    if isinstance(value, (np.floating, float)):
        f = float(value)
        if math.isnan(f) or math.isinf(f):
            return None
        return f
    if isinstance(value, (np.bool_,)):
        return bool(value)
    try:
        if pd.isna(value):
            return None
    except (TypeError, ValueError):
        pass
    return value


def invalidate_quality_cache(survey_id: int) -> None:
    _QUALITY_CACHE.pop(survey_id, None)


def run_data_quality(
    survey_id: int,
    *,
    completion_status: str = "complete",
    refresh: bool = False,
) -> dict[str, Any]:
    from app.services.qc_filter import QC_APPROVED_STATUS

    now = time.time()
    if not refresh and survey_id in _QUALITY_CACHE:
        cached_at, cached = _QUALITY_CACHE[survey_id]
        if now - cached_at < _QUALITY_TTL_SECONDS:
            return cached

    scan_status = "complete" if completion_status == QC_APPROVED_STATUS else completion_status

    try:
        dataset = get_responses(survey_id, completion_status=scan_status)
    except Exception as exc:
        if _is_no_data_error(exc):
            result = _sanitize_for_json(_empty_result())
            result["message"] = "No response data available for this survey yet."
            _QUALITY_CACHE[survey_id] = (now, result)
            return result
        raise

    df = dataset.dataframe
    if df.empty:
        result = _sanitize_for_json(_empty_result())
        _QUALITY_CACHE[survey_id] = (now, result)
        return result

    df_columns = [str(c).strip() for c in df.columns]
    col_index = {c: c for c in df_columns}

    try:
        schema = build_survey_schema(
            survey_id,
            completion_status=scan_status,
            light=True,
        )
        _attach_export_columns(schema, df_columns)
        from app.services.custom_variables import apply_custom_variables

        schema, df = apply_custom_variables(survey_id, schema, df)
    except Exception:
        schema = {"variables": _infer_variables_from_columns(df_columns)}

    from app.services.qc_config_store import get_qc_config

    from app.services.interviewer_qc import resolve_interviewer_variable_id

    qc_cfg = get_qc_config(survey_id)
    thresholds = qc_cfg.thresholds
    custom_rule_payload = [r.model_dump() for r in qc_cfg.custom_rules]

    speeders = _detect_speeders(
        df,
        min_seconds=thresholds.speeder_min_seconds,
        median_fraction=thresholds.speeder_median_fraction,
        time_basis=thresholds.speeder_time_basis,
        custom_reference_seconds=thresholds.speeder_custom_reference_seconds,
    )
    test_responses = _detect_test_responses(df, schema, col_index)
    duplicate_phones = _detect_duplicate_phones(df, schema, col_index)
    straight_liners = _detect_straight_liners(
        df,
        schema,
        col_index,
        min_array_items=thresholds.min_array_items_straight_line,
        variable_ids=qc_cfg.straight_line_variable_ids,
    )
    gibberish = _detect_gibberish(
        df,
        schema,
        col_index,
        min_text_len=thresholds.min_text_length_gibberish,
    )
    interviewer_duplicates = _detect_interviewer_duplicate_answers(
        df,
        schema,
        col_index,
        interviewer_variable_id=resolve_interviewer_variable_id(survey_id),
        similarity_threshold=thresholds.interviewer_duplicate_similarity_pct / 100.0,
    )
    custom_rules = _detect_custom_rules(df, schema, custom_rule_payload)

    flagged_ids: set[str] = set()
    for section in (speeders, test_responses, duplicate_phones, straight_liners, gibberish, interviewer_duplicates, custom_rules):
        for item in section.get("flags", []):
            rid = item.get("response_id")
            if rid is not None:
                flagged_ids.add(str(rid))

    duplicate_exclude = duplicate_phones.get("exclude_count", 0)
    clean_estimate = max(0, len(df) - len(flagged_ids))

    checks = [
        {"id": "speeders", "title": "Speeders", "count": speeders.get("count", 0), "severity": "high"},
        {"id": "test_responses", "title": "Test / dummy responses", "count": test_responses.get("count", 0), "severity": "high"},
        {"id": "duplicate_phones", "title": "Duplicate phone numbers", "count": duplicate_phones.get("count", 0), "severity": "medium"},
        {"id": "straight_liners", "title": "Straight-lining", "count": straight_liners.get("count", 0), "severity": "medium"},
        {"id": "gibberish", "title": "Gibberish text", "count": gibberish.get("count", 0), "severity": "low"},
    ]
    if interviewer_duplicates.get("available", True):
        checks.append({
            "id": "interviewer_duplicates",
            "title": "Interviewer duplicate answers",
            "count": interviewer_duplicates.get("count", 0),
            "severity": "high",
        })

    if custom_rules.get("count", 0) > 0:
        checks.append({
            "id": "custom_rules",
            "title": "Custom variable rules",
            "count": custom_rules.get("count", 0),
            "severity": "medium",
        })

    result = _sanitize_for_json({
        "total_responses": int(len(df)),
        "flagged_count": len(flagged_ids),
        "clean_estimate": clean_estimate,
        "duplicate_exclude_count": duplicate_exclude,
        "checks": checks,
        "thresholds": thresholds.model_dump(),
        "speeders": speeders,
        "test_responses": test_responses,
        "duplicate_phones": duplicate_phones,
        "straight_liners": straight_liners,
        "gibberish": gibberish,
        "interviewer_duplicates": interviewer_duplicates,
        "custom_rules": custom_rules,
    })
    _QUALITY_CACHE[survey_id] = (now, result)
    return result


def _is_no_data_error(exc: Exception) -> bool:
    text = str(exc).lower()
    return "no data" in text or "does not exist" in text or "invalid survey" in text


def _infer_variables_from_columns(df_columns: list[str]) -> list[dict[str, Any]]:
    """Fallback when full schema build fails — enough for basic text/phone checks."""
    variables: list[dict[str, Any]] = []
    for col in df_columns:
        low = col.lower()
        if any(h in low for h in _PHONE_HINTS):
            variables.append(
                {
                    "id": col,
                    "code": col,
                    "text": col,
                    "kind": "text",
                    "columns": [col],
                }
            )
        elif low not in {"id", "responseid", "response id", "submitdate", "startdate", "datestamp", "lastpage", "seed", "token"}:
            variables.append(
                {
                    "id": col,
                    "code": col,
                    "text": col,
                    "kind": "text",
                    "columns": [col],
                }
            )
    return variables


def _empty_result() -> dict[str, Any]:
    empty_flags = {"count": 0, "flags": []}
    return {
        "total_responses": 0,
        "flagged_count": 0,
        "clean_estimate": 0,
        "duplicate_exclude_count": 0,
        "checks": [],
        "speeders": {"available": False, "message": "No responses to scan", "count": 0, "flags": []},
        "test_responses": empty_flags,
        "duplicate_phones": {"available": False, "message": "No responses", "count": 0, "exclude_count": 0, "flags": [], "groups": []},
        "straight_liners": empty_flags,
        "gibberish": empty_flags,
        "interviewer_duplicates": {
            "available": False,
            "message": "No responses",
            "count": 0,
            "flags": [],
            "by_interviewer": [],
        },
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
    inferred = [
        col for col in df_columns
        if col != code and (col.startswith(f"{code}_") or col.startswith(f"{code}#") or (col.startswith(code) and len(col) > len(code)))
    ]
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


def response_id_column(df: pd.DataFrame) -> str | None:
    for col in df.columns:
        if str(col).lower() in {"id", "response id", "responseid"}:
            return str(col)
    return None


def _find_time_columns(df: pd.DataFrame) -> tuple[str | None, str | None]:
    cols = {str(c).lower().replace(" ", ""): str(c) for c in df.columns}
    start = cols.get("startdate") or cols.get("datestamp")
    end = cols.get("submitdate") or cols.get("completedate")
    return start, end


def _find_phone_columns(df: pd.DataFrame, schema: dict[str, Any], col_index: dict[str, str]) -> list[tuple[str, str]]:
    found: list[tuple[str, str]] = []
    seen: set[str] = set()

    for col in df.columns:
        col_s = str(col)
        low = col_s.lower()
        if any(h in low for h in _PHONE_HINTS):
            if col_s not in seen:
                found.append((col_s, col_s))
                seen.add(col_s)

    for var in schema.get("variables", []):
        if var.get("kind") not in ("text", "single"):
            continue
        label = clean_survey_text(str(var.get("text") or "")).lower()
        code = str(var.get("code") or "").lower()
        if not any(h in label or h in code for h in _PHONE_HINTS):
            continue
        col = next((col_index[c] for c in var.get("columns") or [] if c in col_index), None)
        if not col and var.get("code") in col_index:
            col = col_index[str(var.get("code"))]
        if col and col not in seen:
            found.append((col, _question_label(var)))
            seen.add(col)

    return found


def _normalize_phone(value: Any) -> str | None:
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return None
    digits = re.sub(r"\D", "", str(value))
    if len(digits) < 8:
        return None
    if len(digits) > 10:
        digits = digits[-10:]
    return digits


def safe_response_id(value: Any, fallback: Any) -> int | str:
    if _is_missing(value):
        if _is_missing(fallback):
            return "unknown"
        return safe_response_id(fallback, "unknown")
    if isinstance(value, (np.integer, int)):
        return int(value)
    if isinstance(value, (np.floating, float)):
        f = float(value)
        if math.isnan(f) or math.isinf(f):
            return safe_response_id(fallback, "unknown")
        if f.is_integer():
            return int(f)
        return f
    text = str(value).strip()
    return text or str(fallback)


def _is_missing(value: Any) -> bool:
    if value is None:
        return True
    try:
        if pd.isna(value):
            return True
    except (TypeError, ValueError):
        pass
    if isinstance(value, str) and not value.strip():
        return True
    return False


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


def _is_test_text(text: str) -> bool:
    s = text.strip()
    if len(s) < 2:
        return False
    if s.lower() in _TEST_EXACT:
        return True
    if _TEST_RE.search(s):
        return True
    if re.fullmatch(r"(.)\1{3,}", s, re.IGNORECASE):
        return True
    return False


def _detect_speeders(
    df: pd.DataFrame,
    *,
    min_seconds: float = 0.0,
    median_fraction: float = 0.25,
    time_basis: str = "average",
    custom_reference_seconds: float | None = None,
) -> dict[str, Any]:
    start_col, end_col = _find_time_columns(df)
    id_col = response_id_column(df)

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

    average = float(valid.mean())
    median = float(valid.median())
    basis = time_basis if time_basis in ("average", "median") else "average"
    computed_reference = median if basis == "median" else average
    custom = float(custom_reference_seconds or 0)
    if custom > 0:
        reference = custom
        reference_basis = "custom"
    else:
        reference = computed_reference
        reference_basis = basis

    fraction = float(median_fraction)
    threshold = max(float(min_seconds), reference * fraction)

    def _ref_label() -> str:
        if reference_basis == "custom":
            return f"custom {_safe_float(reference)}s"
        if reference_basis == "median":
            return f"median {_safe_float(reference)}s"
        return f"avg {_safe_float(reference)}s"

    flags = []
    for idx, secs in seconds.items():
        if pd.isna(secs) or secs <= 0 or secs >= threshold:
            continue
        flags.append({
            "response_id": safe_response_id(df.at[idx, id_col] if id_col else None, idx),
            "seconds": _safe_float(secs),
            "average_seconds": _safe_float(average),
            "median_seconds": _safe_float(median),
            "reference_seconds": _safe_float(reference),
            "reference_basis": reference_basis,
            "reason": (
                f"Completed in {_safe_float(secs)}s "
                f"(threshold {_safe_float(threshold)}s, {_ref_label()})"
            ),
        })

    flags.sort(key=lambda x: x["seconds"])
    return {
        "available": True,
        "count": len(flags),
        "average_seconds": _safe_float(average),
        "median_seconds": _safe_float(median),
        "reference_seconds": _safe_float(reference),
        "reference_basis": reference_basis,
        "threshold_seconds": _safe_float(threshold),
        "flags": flags[:_MAX_FLAGS],
    }


def _detect_test_responses(
    df: pd.DataFrame,
    schema: dict[str, Any],
    col_index: dict[str, str],
) -> dict[str, Any]:
    id_col = response_id_column(df)
    flags: list[dict[str, Any]] = []
    seen_ids: set[str] = set()

    text_cols: list[tuple[str, str]] = []
    for var in schema.get("variables", []):
        if var.get("kind") != "text":
            continue
        col = next((col_index[c] for c in var.get("columns") or [] if c in col_index), None)
        if col:
            text_cols.append((col, _question_label(var)))

    for col, label in text_cols:
        for idx, raw in df[col].dropna().items():
            text = str(raw).strip()
            if not _is_test_text(text):
                continue
            rid = str(safe_response_id(df.at[idx, id_col] if id_col else None, idx))
            if rid in seen_ids:
                continue
            seen_ids.add(rid)
            flags.append({
                "response_id": safe_response_id(df.at[idx, id_col] if id_col else None, idx),
                "field": label,
                "text": text[:120],
                "reason": "Test or dummy response text",
            })

    return {"count": len(flags), "flags": flags[:_MAX_FLAGS]}


def _detect_duplicate_phones(
    df: pd.DataFrame,
    schema: dict[str, Any],
    col_index: dict[str, str],
) -> dict[str, Any]:
    id_col = response_id_column(df)
    phone_cols = _find_phone_columns(df, schema, col_index)

    if not phone_cols:
        return {
            "available": False,
            "message": "No phone/mobile columns detected in this survey",
            "count": 0,
            "exclude_count": 0,
            "flags": [],
            "groups": [],
        }

    _, submit_col = _find_time_columns(df)
    flags: list[dict[str, Any]] = []
    groups: list[dict[str, Any]] = []
    exclude_count = 0

    for col, field_label in phone_cols:
        phone_to_rows: dict[str, list[tuple[Any, Any]]] = {}
        for idx, raw in df[col].dropna().items():
            norm = _normalize_phone(raw)
            if not norm:
                continue
            rid = safe_response_id(df.at[idx, id_col] if id_col else None, idx)
            submitted = df.at[idx, submit_col] if submit_col else None
            phone_to_rows.setdefault(norm, []).append((idx, rid, submitted, str(raw).strip()))

        for norm, rows in phone_to_rows.items():
            if len(rows) < 2:
                continue
            rows_sorted = sorted(
                rows,
                key=lambda r: (str(r[2]) if r[2] is not None else "", str(r[1])),
            )
            keep = rows_sorted[0]
            dupes = rows_sorted[1:]
            group_ids = [safe_response_id(r[1], r[0]) for r in rows_sorted]
            groups.append({
                "phone": norm,
                "field": field_label,
                "response_ids": group_ids,
                "keep_response_id": safe_response_id(keep[1], keep[0]),
                "duplicate_count": len(dupes),
            })
            for idx, rid, _, display in dupes:
                exclude_count += 1
                flags.append({
                    "response_id": safe_response_id(rid, idx),
                    "phone": display,
                    "normalized_phone": norm,
                    "field": field_label,
                    "keep_response_id": safe_response_id(keep[1], keep[0]),
                    "reason": "Duplicate phone — keep earliest/first response only",
                })

    flags.sort(key=lambda f: (f.get("normalized_phone", ""), str(f.get("response_id", ""))))
    return {
        "available": True,
        "count": len(flags),
        "exclude_count": exclude_count,
        "flags": flags[:_MAX_FLAGS],
        "groups": groups[:50],
    }


def _detect_straight_liners(
    df: pd.DataFrame,
    schema: dict[str, Any],
    col_index: dict[str, str],
    *,
    min_array_items: int = _MIN_ARRAY_ITEMS,
    variable_ids: list[str] | None = None,
) -> dict[str, Any]:
    id_col = response_id_column(df)
    flags: list[dict[str, Any]] = []
    checked_variables: list[dict[str, Any]] = []
    allowed = None if variable_ids is None else {str(v).strip() for v in variable_ids if str(v).strip()}

    for var in schema.get("variables", []):
        if var.get("kind") != "array":
            continue
        variable_id = str(var.get("id") or "")
        if allowed is not None and variable_id not in allowed:
            continue
        cols = [col_index[c] for c in var.get("columns") or [] if c in col_index]
        if len(cols) < min_array_items:
            continue

        checked_variables.append({
            "variable_id": variable_id,
            "question": _question_label(var),
            "item_count": len(cols),
        })

        subset = df[cols].copy()
        for col in cols:
            subset[col] = subset[col].map(_normalize_cell)

        non_empty = subset.apply(lambda row: sum(1 for v in row if v is not None), axis=1)
        unique_counts = subset.apply(lambda row: len({v for v in row if v is not None}), axis=1)
        straight_rows = (non_empty >= min_array_items) & (unique_counts == 1)

        for idx in subset.index[straight_rows]:
            values = [v for v in subset.loc[idx] if not _is_missing(v)]
            if len(values) < min_array_items:
                continue
            flags.append({
                "response_id": safe_response_id(df.at[idx, id_col] if id_col else None, idx),
                "variable_id": variable_id,
                "question": _question_label(var),
                "value": str(values[0]),
                "items": len(values),
                "reason": "Same answer on all grid items",
            })

    return {
        "count": len(flags),
        "flags": flags[:_MAX_FLAGS],
        "checked_variables": checked_variables,
    }


def _detect_gibberish(
    df: pd.DataFrame,
    schema: dict[str, Any],
    col_index: dict[str, str],
    *,
    min_text_len: int = _MIN_TEXT_LEN,
) -> dict[str, Any]:
    id_col = response_id_column(df)
    flags: list[dict[str, Any]] = []

    for var in schema.get("variables", []):
        if var.get("kind") != "text":
            continue
        if _is_name_field(var):
            continue
        col = next((col_index[c] for c in var.get("columns") or [] if c in col_index), None)
        if not col:
            continue

        for idx, raw in df[col].dropna().items():
            text = str(raw).strip()
            if len(text) < min_text_len:
                continue
            if _looks_like_person_name(text):
                continue
            if _is_gibberish_text(text) or _is_keyboard_mash(text):
                flags.append({
                    "response_id": safe_response_id(df.at[idx, id_col] if id_col else None, idx),
                    "variable_id": str(var.get("id") or ""),
                    "question": _question_label(var),
                    "text": text[:120],
                    "reason": "Low-quality or gibberish text",
                })

    return {"count": len(flags), "flags": flags[:_MAX_FLAGS]}


def _detect_custom_rules(
    df: pd.DataFrame,
    schema: dict[str, Any],
    rules: list[dict[str, Any]],
) -> dict[str, Any]:
    from app.services.filter_engine import _eval_condition

    if not rules:
        return {"available": False, "count": 0, "flags": [], "rules": []}

    id_col = response_id_column(df)
    flags: list[dict[str, Any]] = []
    seen: set[str] = set()

    for rule in rules:
        variable_id = str(rule.get("variable_id", "")).strip()
        if not variable_id:
            continue
        operator = str(rule.get("operator", "in")).lower()
        values = [str(v) for v in rule.get("values", []) if str(v).strip()]
        name = str(rule.get("name", "")).strip() or variable_id
        cond = {
            "type": "condition",
            "variable_id": variable_id,
            "operator": operator,
            "values": values,
        }
        try:
            mask = _eval_condition(df, schema, cond).fillna(False)
        except Exception:
            continue
        for idx in df.index[mask]:
            rid = str(safe_response_id(df.at[idx, id_col] if id_col else None, idx))
            if rid in seen:
                continue
            seen.add(rid)
            flags.append({
                "response_id": safe_response_id(df.at[idx, id_col] if id_col else None, idx),
                "rule_name": name,
                "variable_id": variable_id,
                "reason": f"Custom rule: {name}",
            })

    return {
        "available": True,
        "count": len(flags),
        "rules": [str(r.get("name") or r.get("variable_id")) for r in rules],
        "flags": flags[:_MAX_FLAGS],
    }


_MIN_COMPARABLE_FIELDS = 8


def _comparable_fingerprint_columns(
    schema: dict[str, Any],
    col_index: dict[str, str],
    *,
    exclude_columns: set[str] | None = None,
) -> list[str]:
    skip = {c.lower() for c in (exclude_columns or set())}
    cols: list[str] = []
    for var in schema.get("variables", []):
        kind = str(var.get("kind") or "")
        if kind in ("text", "display", "date", "location", "unknown"):
            continue
        for candidate in var.get("columns") or []:
            col = col_index.get(str(candidate))
            if not col or col.lower() in skip:
                continue
            cols.append(col)
    return sorted(set(cols))


def _detect_interviewer_duplicate_answers(
    df: pd.DataFrame,
    schema: dict[str, Any],
    col_index: dict[str, str],
    *,
    interviewer_variable_id: str | None,
    similarity_threshold: float = 0.85,
) -> dict[str, Any]:
    if not interviewer_variable_id:
        return {
            "available": False,
            "message": "Select an interviewer question in QC or Field team settings.",
            "count": 0,
            "flags": [],
            "by_interviewer": [],
            "threshold_pct": round(similarity_threshold * 100, 1),
        }

    from app.services.field_reports import _interviewer_labels
    from app.services.question_schema import get_variable
    from app.services.variable_columns import find_variable_column

    var = get_variable(schema, interviewer_variable_id)
    if not var:
        return {
            "available": False,
            "message": "Interviewer question not found in this survey.",
            "count": 0,
            "flags": [],
            "by_interviewer": [],
            "threshold_pct": round(similarity_threshold * 100, 1),
        }

    interviewer_col = find_variable_column(var, df)
    exclude = {interviewer_col} if interviewer_col else set()
    compare_cols = _comparable_fingerprint_columns(schema, col_index, exclude_columns=exclude)
    if len(compare_cols) < _MIN_COMPARABLE_FIELDS:
        return {
            "available": False,
            "message": f"Need at least {_MIN_COMPARABLE_FIELDS} comparable closed-ended fields.",
            "count": 0,
            "flags": [],
            "by_interviewer": [],
            "threshold_pct": round(similarity_threshold * 100, 1),
        }

    id_col = response_id_column(df)
    interviewers = _interviewer_labels(schema, var, df)

    fingerprints: dict[Any, dict[str, str]] = {}
    for idx in df.index:
        fp: dict[str, str] = {}
        for col in compare_cols:
            if col not in df.columns:
                continue
            norm = _normalize_cell(df.at[idx, col])
            if norm is not None:
                fp[col] = norm
        fingerprints[idx] = fp

    by_interviewer: dict[str, list[Any]] = defaultdict(list)
    for idx in df.index:
        name = str(interviewers.at[idx]).strip() or "Unknown"
        if name == "Unknown":
            continue
        by_interviewer[name].append(idx)

    flags: list[dict[str, Any]] = []
    flagged_ids: set[str] = set()
    by_interviewer_summary: list[dict[str, Any]] = []

    for interviewer, indices in by_interviewer.items():
        if len(indices) < 2:
            continue

        def sort_key(row_idx: Any) -> tuple[str, Any]:
            rid = safe_response_id(df.at[row_idx, id_col] if id_col else None, row_idx)
            return (str(rid), row_idx)

        sorted_indices = sorted(indices, key=sort_key)
        interviewer_flags = 0
        max_similarity = 0.0

        for i in range(len(sorted_indices)):
            idx_a = sorted_indices[i]
            fp_a = fingerprints.get(idx_a, {})
            if not fp_a:
                continue
            rid_a = str(safe_response_id(df.at[idx_a, id_col] if id_col else None, idx_a))
            for j in range(i + 1, len(sorted_indices)):
                idx_b = sorted_indices[j]
                fp_b = fingerprints.get(idx_b, {})
                if not fp_b:
                    continue
                common = set(fp_a.keys()) & set(fp_b.keys())
                if len(common) < _MIN_COMPARABLE_FIELDS:
                    continue
                matches = sum(1 for key in common if fp_a[key] == fp_b[key])
                similarity = matches / len(common)
                if similarity < similarity_threshold:
                    continue
                max_similarity = max(max_similarity, similarity)
                rid_b = str(safe_response_id(df.at[idx_b, id_col] if id_col else None, idx_b))
                if rid_b in flagged_ids:
                    continue
                flagged_ids.add(rid_b)
                interviewer_flags += 1
                pct = round(similarity * 100, 1)
                flags.append({
                    "response_id": rid_b,
                    "interviewer": interviewer,
                    "match_response_id": rid_a,
                    "similarity_pct": pct,
                    "matched_fields": matches,
                    "comparable_fields": len(common),
                    "reason": (
                        f"{pct}% same answers as record {rid_a} "
                        f"({matches}/{len(common)} fields, interviewer: {interviewer})"
                    ),
                })

        if interviewer_flags > 0:
            by_interviewer_summary.append({
                "interviewer": interviewer,
                "flagged_count": interviewer_flags,
                "max_similarity_pct": round(max_similarity * 100, 1),
                "completed": len(indices),
            })

    by_interviewer_summary.sort(key=lambda row: (-row["flagged_count"], row["interviewer"]))

    return {
        "available": True,
        "count": len(flags),
        "flags": flags[:_MAX_FLAGS],
        "by_interviewer": by_interviewer_summary,
        "threshold_pct": round(similarity_threshold * 100, 1),
        "comparable_fields": len(compare_cols),
    }


def _normalize_cell(value: Any) -> str | None:
    if _is_missing(value):
        return None
    text = str(value).strip()
    if not text or text.lower() in _EMPTY_VALUES:
        return None
    return text


def _is_name_field(var: dict[str, Any]) -> bool:
    parts = [
        str(var.get("text") or ""),
        str(var.get("code") or ""),
        str(var.get("id") or ""),
    ]
    combined = " ".join(parts).lower()
    return any(h in combined for h in _NAME_HINTS)


def _looks_like_person_name(text: str) -> bool:
    s = text.strip()
    if len(s) < 2 or len(s) > 80:
        return False
    if not re.match(r"^[\w\s'.-]+$", s, re.UNICODE):
        return False
    words = [w for w in re.split(r"\s+", s) if w]
    if not words or len(words) > 5:
        return False
    letters = re.sub(r"[^a-zA-Z]", "", s)
    if len(letters) < 2:
        return False
    if any(w[0].isupper() for w in words if w and w[0].isalpha()):
        return True
    return len(words) <= 3 and all(1 <= len(w) <= 24 for w in words)


def _is_gibberish_text(text: str) -> bool:
    s = text.strip()
    low = s.lower()
    if low in _GIBBERISH_EXACT:
        return True
    if re.fullmatch(r"(.)\1{4,}", s):
        return True
    if re.fullmatch(r"[asdfghjklqwertyuiopzxcvbnm]{6,}", s, re.IGNORECASE):
        return True
    return False


def _is_keyboard_mash(text: str) -> bool:
    if _looks_like_person_name(text):
        return False
    letters = re.sub(r"[^a-zA-Z]", "", text.lower())
    if len(letters) < 8:
        return False
    vowels = sum(1 for c in letters if c in "aeiou")
    if vowels == 0:
        return True
    if len(letters) >= 10 and vowels / len(letters) < 0.08:
        return True
    return False
