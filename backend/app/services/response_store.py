from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any

import pandas as pd

from app.lime_client import export_responses_dataframe

_CACHE: dict[tuple[int, str], tuple[float, pd.DataFrame]] = {}
_TTL_SECONDS = 300


@dataclass
class ResponseDataset:
    dataframe: pd.DataFrame
    response_count: int
    column_count: int


def get_responses(
    survey_id: int,
    *,
    completion_status: str = "all",
    refresh: bool = False,
) -> ResponseDataset:
    key = (survey_id, completion_status)
    now = time.time()

    if not refresh and key in _CACHE:
        cached_at, df = _CACHE[key]
        if now - cached_at < _TTL_SECONDS:
            return ResponseDataset(df, len(df), len(df.columns))

    df = export_responses_dataframe(survey_id, completion_status=completion_status)
    _CACHE[key] = (now, df)
    return ResponseDataset(df, len(df), len(df.columns))


def invalidate_survey_cache(survey_id: int) -> None:
    keys = [k for k in _CACHE if k[0] == survey_id]
    for key in keys:
        del _CACHE[key]
