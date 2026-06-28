from __future__ import annotations

from typing import Any

import pandas as pd

from app.lime_client import export_responses_dataframe


def _safe_column(df: pd.DataFrame, column: str) -> pd.Series | None:
    if column not in df.columns:
        return None
    return df[column]


def run_frequency_analysis(
    survey_id: int,
    column: str,
    *,
    completion_status: str = "all",
) -> dict[str, Any]:
    df = export_responses_dataframe(survey_id, completion_status=completion_status)
    series = _safe_column(df, column)
    if series is None:
        return {"column": column, "error": f"Column '{column}' not found", "values": []}

    counts = (
        series.fillna("(blank)")
        .astype(str)
        .value_counts()
        .reset_index()
    )
    counts.columns = ["value", "count"]

    total = int(counts["count"].sum())
    values = [
        {
            "value": row["value"],
            "count": int(row["count"]),
            "percentage": round((row["count"] / total) * 100, 1) if total else 0,
        }
        for _, row in counts.iterrows()
    ]

    return {"column": column, "total": total, "values": values}


def run_crosstab_analysis(
    survey_id: int,
    row_column: str,
    col_column: str,
    *,
    completion_status: str = "all",
) -> dict[str, Any]:
    df = export_responses_dataframe(survey_id, completion_status=completion_status)
    row_series = _safe_column(df, row_column)
    col_series = _safe_column(df, col_column)

    if row_series is None:
        return {"error": f"Column '{row_column}' not found"}
    if col_series is None:
        return {"error": f"Column '{col_column}' not found"}

    table = pd.crosstab(
        row_series.fillna("(blank)").astype(str),
        col_series.fillna("(blank)").astype(str),
        margins=True,
        margins_name="Total",
    )

    return {
        "row_column": row_column,
        "col_column": col_column,
        "columns": [str(c) for c in table.columns.tolist()],
        "rows": [
            {"label": str(idx), "values": [int(v) for v in row.tolist()]}
            for idx, row in table.iterrows()
        ],
    }


def run_numeric_summary(
    survey_id: int,
    column: str,
    *,
    completion_status: str = "all",
) -> dict[str, Any]:
    df = export_responses_dataframe(survey_id, completion_status=completion_status)
    series = _safe_column(df, column)
    if series is None:
        return {"column": column, "error": f"Column '{column}' not found"}

    numeric = pd.to_numeric(series, errors="coerce").dropna()
    if numeric.empty:
        return {
            "column": column,
            "error": "No numeric values found for this column",
        }

    return {
        "column": column,
        "count": int(numeric.count()),
        "mean": round(float(numeric.mean()), 2),
        "median": round(float(numeric.median()), 2),
        "std": round(float(numeric.std()), 2) if len(numeric) > 1 else 0,
        "min": round(float(numeric.min()), 2),
        "max": round(float(numeric.max()), 2),
    }


def get_response_columns(survey_id: int) -> list[dict[str, str]]:
    df = export_responses_dataframe(survey_id, completion_status="all")
    skip = {"id", "submitdate", "lastpage", "startlanguage", "seed", "token"}
    columns: list[dict[str, str]] = []

    for col in df.columns:
        dtype = str(df[col].dtype)
        kind = "numeric" if pd.api.types.is_numeric_dtype(df[col]) else "categorical"
        if str(col).lower() in skip:
            kind = "metadata"
        columns.append({"name": col, "dtype": dtype, "kind": kind})

    return columns
