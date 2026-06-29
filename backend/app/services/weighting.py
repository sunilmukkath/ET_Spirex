from __future__ import annotations

from typing import Any

import pandas as pd

from app.services.question_schema import get_variable
from app.services.variable_columns import find_variable_column as _find_column
from app.services.weight_config_store import get_weight_config

_WEIGHT_COL = "__weight__"


def attach_weights(
    survey_id: int,
    schema: dict[str, Any],
    df: pd.DataFrame,
) -> pd.DataFrame:
    config = get_weight_config(survey_id)
    if not config.enabled or not config.variable_id:
        if _WEIGHT_COL in df.columns:
            df = df.drop(columns=[_WEIGHT_COL])
        return df

    var = get_variable(schema, config.variable_id)
    if not var:
        return df

    col = _find_column(var, df)
    if not col or col not in df.columns:
        return df

    out = df.copy()
    weights = pd.to_numeric(out[col], errors="coerce").fillna(0.0)
    weights = weights.clip(lower=0.0)
    if weights.sum() <= 0:
        weights = pd.Series(1.0, index=out.index)
    out[_WEIGHT_COL] = weights
    return out


def weight_series(df: pd.DataFrame) -> pd.Series:
    if _WEIGHT_COL in df.columns:
        return df[_WEIGHT_COL].astype(float)
    return pd.Series(1.0, index=df.index)


def weighted_sum(mask: pd.Series, weights: pd.Series) -> float:
    return float(weights[mask].sum())


def weighted_pct(count: float, total: float) -> float:
    if total <= 0:
        return 0.0
    return round((count / total) * 100, 1)


def weighted_mean(series: pd.Series, weights: pd.Series) -> float | None:
    valid = series.notna()
    if not valid.any():
        return None
    w = weights[valid].astype(float)
    vals = pd.to_numeric(series[valid], errors="coerce")
    denom = float(w.sum())
    if denom <= 0:
        return None
    return round(float((vals * w).sum() / denom), 2)
