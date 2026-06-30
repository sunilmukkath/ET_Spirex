from __future__ import annotations

from collections import defaultdict
from typing import Any

from app.services.analysis_context import load_analysis_context
from app.services.data_quality import run_data_quality
from app.services.field_reports import _flagged_checks_by_response, _interviewer_labels, _response_id_series
from app.services.qc_config_store import enabled_check_ids, get_qc_config
from app.services.qc_filter import get_qc_excluded_response_ids
from app.services.question_schema import get_variable
from app.services.quota_config_store import get_quota_config

CHECK_COLUMNS = [
    "Speeders",
    "Test / dummy",
    "Duplicate phones",
    "Straight-lining",
    "Gibberish",
    "Duplicate answers",
    "GPS proximity",
    "Short interview gap",
    "Custom rules",
    "Manual exclusion",
]


def resolve_interviewer_variable_id(survey_id: int, override: str | None = None) -> str | None:
    if override and str(override).strip():
        return str(override).strip()
    qc_cfg = get_qc_config(survey_id)
    if qc_cfg.interviewer_variable_id:
        return qc_cfg.interviewer_variable_id
    quota_cfg = get_quota_config(survey_id)
    return quota_cfg.interviewer_variable_id


def interviewer_qc_stats(survey_id: int, interviewer_variable_id: str | None = None) -> dict[str, Any]:
    variable_id = resolve_interviewer_variable_id(survey_id, interviewer_variable_id)
    if not variable_id:
        return {
            "interviewer_variable_id": None,
            "error": "Select an interviewer question to view interviewer-wise QC.",
            "rows": [],
        }

    schema, df = load_analysis_context(survey_id, completion_status="complete")
    var = get_variable(schema, variable_id)
    if not var:
        return {
            "interviewer_variable_id": variable_id,
            "error": "Interviewer question not found in this survey.",
            "rows": [],
        }

    quality = run_data_quality(survey_id, completion_status="complete")
    disabled = frozenset(
        {
            "speeders",
            "test_responses",
            "duplicate_phones",
            "straight_liners",
            "gibberish",
            "interviewer_duplicates",
            "interviewer_gps_proximity",
            "interviewer_short_gap",
            "custom_rules",
        }
    ) - enabled_check_ids(survey_id)
    flagged_by_rid = _flagged_checks_by_response(quality, disabled)

    excluded = get_qc_excluded_response_ids(survey_id)
    ids = _response_id_series(df)
    interviewers = _interviewer_labels(schema, var, df)

    stats: dict[str, dict[str, Any]] = defaultdict(
        lambda: {"completed": 0, "rejected": 0, "checks": defaultdict(int)}
    )

    for idx in df.index:
        interviewer = str(interviewers.at[idx])
        rid = str(ids.at[idx])
        bucket = stats[interviewer]
        bucket["completed"] += 1
        if rid in excluded:
            bucket["rejected"] += 1
            for check in flagged_by_rid.get(rid, []):
                bucket["checks"][check] += 1
            if rid not in flagged_by_rid:
                bucket["checks"]["Manual exclusion"] += 1

    rows: list[dict[str, Any]] = []
    for interviewer, data in sorted(stats.items(), key=lambda x: (-x[1]["rejected"], x[0])):
        completed = int(data["completed"])
        rejected = int(data["rejected"])
        approved = completed - rejected
        rejection_pct = round((rejected / completed) * 100, 1) if completed else 0.0
        checks = {col: int(data["checks"].get(col, 0)) for col in CHECK_COLUMNS}
        rows.append(
            {
                "interviewer": interviewer,
                "completed": completed,
                "approved": approved,
                "rejected": rejected,
                "rejection_pct": rejection_pct,
                "checks": checks,
            }
        )

    total_completed = len(df)
    total_rejected = len(excluded)
    return {
        "interviewer_variable_id": variable_id,
        "interviewer_question": str(var.get("text") or var.get("code") or variable_id),
        "interviewer_code": str(var.get("code") or ""),
        "total_completed": total_completed,
        "total_rejected": total_rejected,
        "total_approved": max(0, total_completed - total_rejected),
        "check_columns": CHECK_COLUMNS,
        "rows": rows,
    }


def interviewer_labels_by_response(
    survey_id: int,
    interviewer_variable_id: str | None = None,
) -> dict[str, Any]:
    variable_id = resolve_interviewer_variable_id(survey_id, interviewer_variable_id)
    if not variable_id:
        return {
            "interviewer_variable_id": None,
            "labels": {},
            "error": "No interviewer question selected.",
        }

    schema, df = load_analysis_context(survey_id, completion_status="complete")
    var = get_variable(schema, variable_id)
    if not var:
        return {
            "interviewer_variable_id": variable_id,
            "labels": {},
            "error": "Interviewer question not found in this survey.",
        }

    ids = _response_id_series(df)
    interviewers = _interviewer_labels(schema, var, df)
    labels = {str(ids.at[idx]): str(interviewers.at[idx]) for idx in df.index}

    return {
        "interviewer_variable_id": variable_id,
        "interviewer_question": str(var.get("text") or var.get("code") or variable_id),
        "labels": labels,
    }
