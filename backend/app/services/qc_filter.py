from __future__ import annotations

import time
from typing import Any

import pandas as pd

from app.services.data_quality import response_id_column, safe_response_id

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


def collect_flagged_ids(quality_result: dict[str, Any]) -> set[str]:
    flagged: set[str] = set()
    for key in (
        "speeders",
        "test_responses",
        "duplicate_phones",
        "straight_liners",
        "gibberish",
    ):
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

    result = run_data_quality(survey_id, completion_status="complete")
    flagged = collect_flagged_ids(result)
    _FLAGGED_CACHE[survey_id] = (now, flagged)
    return flagged


def qc_approved_response_count(survey_id: int) -> int:
    from app.services.response_store import get_responses

    dataset = get_responses(survey_id, completion_status="complete")
    df = dataset.dataframe
    if df.empty:
        return 0

    flagged = get_flagged_response_ids(survey_id)
    if not flagged:
        return int(len(df))

    id_col = response_id_column(df)
    if not id_col:
        return max(0, int(len(df)) - len(flagged))

    ids = pd.Series(
        (str(safe_response_id(df.at[idx, id_col], idx)) for idx in df.index),
        index=df.index,
    )
    return int((~ids.isin(flagged)).sum())


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
