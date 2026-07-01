from __future__ import annotations

import time
from typing import Any

import pandas as pd

from app.services.data_quality import response_id_column, safe_response_id
from app.services.qc_config_store import ALL_CHECK_IDS, enabled_check_ids

QC_APPROVED_STATUS = "qc_approved"
LIMESURVEY_EXPORT_STATUSES = frozenset({"complete", "all", "incomplete"})
_FLAGGED_CACHE: dict[int, tuple[float, set[str]]] = {}
_FLAGGED_TTL_SECONDS = 300


def normalize_export_status(completion_status: str) -> str:
    """Map app-only statuses to LimeSurvey export values."""
    if completion_status == QC_APPROVED_STATUS:
        return "complete"
    if completion_status in LIMESURVEY_EXPORT_STATUSES:
        return completion_status
    return "complete"


def invalidate_flagged_cache(survey_id: int) -> None:
    _FLAGGED_CACHE.pop(survey_id, None)


def collect_flagged_ids(
    quality_result: dict[str, Any],
    *,
    disabled_checks: frozenset[str] | None = None,
) -> set[str]:
    disabled = disabled_checks or frozenset()
    flagged: set[str] = set()
    check_keys = (
        "speeders",
        "test_responses",
        "duplicate_phones",
        "straight_liners",
        "gibberish",
        "interviewer_duplicates",
        "interviewer_gps_proximity",
        "interviewer_short_gap",
        "custom_rules",
    )
    for key in check_keys:
        if key in disabled:
            continue
        section = quality_result.get(key) or {}
        for item in section.get("flags", []):
            rid = item.get("response_id")
            if rid is not None:
                flagged.add(str(rid))
    return flagged


def get_flagged_response_ids(survey_id: int) -> set[str]:
    now = time.time()
    cached = _FLAGGED_CACHE.get(survey_id)
    if cached and now - cached[0] < _FLAGGED_TTL_SECONDS:
        return set(cached[1])

    from app.services.data_quality import run_data_quality
    from app.services.qc_config_store import enabled_check_ids

    result = run_data_quality(survey_id, completion_status="complete")
    disabled = frozenset(ALL_CHECK_IDS) - enabled_check_ids(survey_id)
    flagged = collect_flagged_ids(result, disabled_checks=disabled)
    _FLAGGED_CACHE[survey_id] = (now, flagged)
    return flagged


def _qc_excluded_ids(
    survey_id: int,
    quality_result: dict[str, Any] | None = None,
) -> set[str]:
    """Response IDs excluded from the QC Approved analysis sample."""
    from app.services.data_quality import run_data_quality
    from app.services.qc_config_store import get_qc_config

    cfg = get_qc_config(survey_id)
    result = (
        quality_result
        if quality_result is not None
        else run_data_quality(survey_id, completion_status="complete")
    )
    disabled = frozenset(ALL_CHECK_IDS) - enabled_check_ids(survey_id)
    auto_flagged = collect_flagged_ids(result, disabled_checks=disabled)
    kept = {str(x) for x in (cfg.kept_response_ids or [])}
    extra_excluded = {str(x) for x in (cfg.excluded_response_ids or [])}
    return (auto_flagged - kept) | extra_excluded


def get_qc_excluded_response_ids(survey_id: int) -> set[str]:
    """Response IDs removed from the QC Approved analysis sample."""
    return _qc_excluded_ids(survey_id)


def get_qc_summary(survey_id: int) -> dict[str, Any]:
    from app.services.data_quality import run_data_quality
    from app.services.qc_config_store import get_qc_config

    cfg = get_qc_config(survey_id)
    result = run_data_quality(survey_id, completion_status="complete")
    total = int(result.get("total_responses") or 0)
    disabled = frozenset(ALL_CHECK_IDS) - enabled_check_ids(survey_id)
    auto_flagged = collect_flagged_ids(result, disabled_checks=disabled)
    excluded = _qc_excluded_ids(survey_id, quality_result=result)
    qc_approved = max(0, total - len(excluded))
    kept = {str(x) for x in cfg.kept_response_ids}
    manual_excluded = {str(x) for x in cfg.excluded_response_ids} - auto_flagged
    return {
        "total_completed": total,
        "auto_flagged_count": len(auto_flagged),
        "excluded_count": max(0, total - qc_approved),
        "qc_approved_count": qc_approved,
        "kept_flagged_count": len(kept & auto_flagged),
        "manual_excluded_count": len(manual_excluded),
        "has_review": bool(kept or cfg.excluded_response_ids),
    }


def qc_approved_response_count(survey_id: int) -> int:
    from app.services.data_quality import run_data_quality

    result = run_data_quality(survey_id, completion_status="complete")
    total = int(result.get("total_responses") or 0)
    if total == 0:
        return 0
    excluded = _qc_excluded_ids(survey_id, quality_result=result)
    return max(0, total - len(excluded))


def exclude_flagged_responses(df: pd.DataFrame, flagged_ids: set[str]) -> pd.DataFrame:
    if df.empty or not flagged_ids:
        return df

    id_col = response_id_column(df)
    if not id_col:
        return df

    ids = pd.Series(
        (str(safe_response_id(df.at[idx, id_col], idx)) for idx in df.index),
        index=df.index,
    )
    return df.loc[~ids.isin(flagged_ids)].copy()
