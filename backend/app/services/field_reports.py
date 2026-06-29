from __future__ import annotations

import csv
import io
from collections import defaultdict
from typing import Any

import pandas as pd

from app.services.analysis_context import load_analysis_context
from app.services.answer_labels import canonical_answer_code, label_for_answer
from app.services.data_quality import response_id_column, run_data_quality, safe_response_id
from app.services.qc_filter import collect_flagged_ids, get_qc_excluded_response_ids, get_qc_summary
from app.services.qc_config_store import enabled_check_ids, get_qc_config
from app.services.question_schema import get_variable
from app.services.quota_check import check_quotas
from app.services.quota_config_store import get_quota_config
from app.services.variable_columns import find_variable_column


def _csv_string(rows: list[list[Any]]) -> str:
    buf = io.StringIO()
    writer = csv.writer(buf)
    for row in rows:
        writer.writerow(row)
    return buf.getvalue()


def _response_id_series(df: pd.DataFrame) -> pd.Series:
    id_col = response_id_column(df)
    if not id_col:
        return pd.Series((str(i) for i in df.index), index=df.index)
    return pd.Series(
        (str(safe_response_id(df.at[idx, id_col], idx)) for idx in df.index),
        index=df.index,
    )


def _interviewer_labels(schema: dict[str, Any], var: dict[str, Any], df: pd.DataFrame) -> pd.Series:
    col = find_variable_column(var, df)
    if not col or col not in df.columns:
        return pd.Series("Unknown", index=df.index)
    raw = df[col].astype(str).str.strip()
    return raw.map(lambda v: label_for_answer(var, canonical_answer_code(var, v)) or v or "Unknown")


def _flagged_checks_by_response(quality: dict[str, Any], disabled: frozenset[str]) -> dict[str, list[str]]:
    out: dict[str, list[str]] = defaultdict(list)
    mapping = {
        "speeders": "Speeders",
        "test_responses": "Test / dummy",
        "duplicate_phones": "Duplicate phones",
        "straight_liners": "Straight-lining",
        "gibberish": "Gibberish",
        "custom_rules": "Custom rules",
    }
    for key, title in mapping.items():
        if key in disabled:
            continue
        for item in (quality.get(key) or {}).get("flags", []):
            rid = item.get("response_id")
            if rid is not None:
                out[str(rid)].append(title)
    return out


def quota_completion_csv(survey_id: int, *, completion_status: str | None = None) -> str:
    config = get_quota_config(survey_id)
    basis = completion_status or config.basis or "complete"
    if basis not in ("complete", "qc_approved"):
        basis = "complete"
    result = check_quotas(survey_id, completion_status=basis)

    rows: list[list[Any]] = [
        ["Quota completion report"],
        ["Basis", basis],
        ["Checked at", result.get("checked_at", "")],
        ["Total responses", result.get("total_completes", 0)],
        [],
        ["Type", "Field", "Cell", "Target", "Actual", "Actual %", "Gap", "Status"],
    ]

    for field in result.get("fields") or []:
        if field.get("error"):
            continue
        label = field.get("label") or field.get("code") or field.get("variable_id", "")
        for cell in field.get("cells") or []:
            if cell.get("status") == "empty" and not cell.get("target"):
                continue
            rows.append(
                [
                    "Single field",
                    label,
                    cell.get("label") or cell.get("code", ""),
                    cell.get("target", ""),
                    cell.get("actual", ""),
                    cell.get("actual_pct", ""),
                    cell.get("gap", ""),
                    cell.get("status", ""),
                ]
            )

    for layer in result.get("layers") or []:
        if layer.get("error"):
            continue
        layer_name = layer.get("name") or "Layered quota"
        for cell in layer.get("cells") or []:
            if cell.get("status") == "empty" and not cell.get("target"):
                continue
            rows.append(
                [
                    "Layered",
                    layer_name,
                    cell.get("label", ""),
                    cell.get("target", ""),
                    cell.get("actual", ""),
                    cell.get("actual_pct", ""),
                    cell.get("gap", ""),
                    cell.get("status", ""),
                ]
            )

    if len(rows) <= 6:
        rows.append(["No quota targets configured"])
    return _csv_string(rows)


def qc_checks_csv(survey_id: int) -> str:
    quality = run_data_quality(survey_id, completion_status="complete")
    summary = get_qc_summary(survey_id)
    disabled = frozenset({"speeders", "test_responses", "duplicate_phones", "straight_liners", "gibberish"}) - enabled_check_ids(
        survey_id
    )
    flagged_by_rid = _flagged_checks_by_response(quality, disabled)
    cfg = get_qc_config(survey_id)
    excluded = get_qc_excluded_response_ids(survey_id)
    kept = {str(x) for x in cfg.kept_response_ids}
    manual_excluded = {str(x) for x in cfg.excluded_response_ids}

    rows: list[list[Any]] = [
        ["QC checks report"],
        ["Total completed", summary.get("total_completed", 0)],
        ["Auto-flagged", summary.get("auto_flagged_count", 0)],
        ["QC approved sample", summary.get("qc_approved_count", 0)],
        ["Excluded from QC approved", summary.get("excluded_count", 0)],
        ["Manual exclusions", summary.get("manual_excluded_count", 0)],
        [],
        ["Check", "Count", "Severity"],
    ]
    for check in quality.get("checks") or []:
        rows.append([check.get("title", check.get("id", "")), check.get("count", 0), check.get("severity", "")])
    rows.extend(
        [
            [],
            ["Response ID", "QC checks failed", "Excluded from QC approved", "Manual keep", "Manual exclude", "Detail"],
        ]
    )

    all_rids = sorted(set(flagged_by_rid.keys()) | excluded | kept | manual_excluded)
    for rid in all_rids:
        checks = flagged_by_rid.get(rid, [])
        detail = "; ".join(checks)
        rows.append(
            [
                rid,
                "; ".join(checks) if checks else "",
                "yes" if rid in excluded else "no",
                "yes" if rid in kept else "no",
                "yes" if rid in manual_excluded else "no",
                detail,
            ]
        )

    if not all_rids:
        rows.append(["No flagged or excluded responses"])
    return _csv_string(rows)


def interviewer_rejections_csv(survey_id: int, interviewer_variable_id: str | None = None) -> str:
    from app.services.interviewer_qc import CHECK_COLUMNS, interviewer_qc_stats

    stats = interviewer_qc_stats(survey_id, interviewer_variable_id)
    if stats.get("error"):
        raise ValueError(str(stats["error"]))

    rows: list[list[Any]] = [
        ["Interviewer-wise rejections"],
        ["Interviewer question", stats.get("interviewer_question", "")],
        ["Total completed interviews", stats.get("total_completed", 0)],
        ["Total excluded", stats.get("total_rejected", 0)],
        [],
        ["Interviewer", "Completed", "Rejected", "Rejection %", *CHECK_COLUMNS],
    ]

    for row in stats.get("rows") or []:
        checks = row.get("checks") or {}
        rows.append(
            [
                row.get("interviewer", ""),
                row.get("completed", 0),
                row.get("rejected", 0),
                row.get("rejection_pct", 0),
                *[int(checks.get(col, 0)) for col in CHECK_COLUMNS],
            ]
        )

    if not stats.get("rows"):
        rows.append(["No completed interviews"])
    return _csv_string(rows)
