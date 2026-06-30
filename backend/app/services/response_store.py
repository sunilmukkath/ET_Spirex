from __future__ import annotations

import threading
import time
from dataclasses import dataclass

import pandas as pd

from app.lime_client import export_responses_dataframe

_CACHE: dict[tuple[int, str], tuple[float, pd.DataFrame]] = {}
_TTL_SECONDS = 600
_META_LOCK = threading.Lock()
_KEY_LOCKS: dict[tuple[int, str], threading.Lock] = {}


@dataclass
class ResponseDataset:
    dataframe: pd.DataFrame
    response_count: int
    column_count: int


def _cache_get(key: tuple[int, str]) -> ResponseDataset | None:
    now = time.time()
    cached = _CACHE.get(key)
    if not cached:
        return None
    cached_at, df = cached
    if now - cached_at >= _TTL_SECONDS:
        return None
    return ResponseDataset(df, len(df), len(df.columns))


def _key_lock(key: tuple[int, str]) -> threading.Lock:
    with _META_LOCK:
        if key not in _KEY_LOCKS:
            _KEY_LOCKS[key] = threading.Lock()
        return _KEY_LOCKS[key]


def get_responses(
    survey_id: int,
    *,
    completion_status: str = "all",
    refresh: bool = False,
) -> ResponseDataset:
    from app.services.qc_filter import (
        QC_APPROVED_STATUS,
        exclude_flagged_responses,
        get_qc_excluded_response_ids,
        normalize_export_status,
    )

    key = (survey_id, completion_status)

    if not refresh:
        hit = _cache_get(key)
        if hit:
            return hit

    lock = _key_lock(key)
    with lock:
        if not refresh:
            hit = _cache_get(key)
            if hit:
                return hit

        export_status = normalize_export_status(completion_status)
        df = export_responses_dataframe(survey_id, completion_status=export_status)

        if completion_status == QC_APPROVED_STATUS:
            excluded = get_qc_excluded_response_ids(survey_id)
            df = exclude_flagged_responses(df, excluded)

        _CACHE[key] = (time.time(), df)
        return ResponseDataset(df, len(df), len(df.columns))


def invalidate_survey_cache(survey_id: int) -> None:
    from app.services.qc_filter import invalidate_flagged_cache
    from app.services.data_quality import invalidate_quality_cache
    from app.services.analysis_context import invalidate_analysis_context

    keys = [k for k in _CACHE if k[0] == survey_id]
    for key in keys:
        del _CACHE[key]
    invalidate_flagged_cache(survey_id)
    invalidate_quality_cache(survey_id)
    invalidate_analysis_context(survey_id)
