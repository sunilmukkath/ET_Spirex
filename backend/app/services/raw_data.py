from __future__ import annotations

from typing import Any

import pandas as pd

from app.services.analysis_context import load_analysis_context
from app.services.custom_variable_store import list_custom_variables
from app.services.custom_variables import custom_column_name

_SYSTEM_COLS = frozenset(
    {
        "id",
        "response id",
        "responseid",
        "submitdate",
        "startdate",
        "datestamp",
        "lastpage",
        "ipaddr",
        "refurl",
        "seed",
        "token",
    }
)


def _build_column_label_map(
    schema: dict[str, Any],
    custom_by_col: dict[str, dict[str, Any]],
) -> dict[str, str]:
    labels: dict[str, str] = {}
    for col, meta in custom_by_col.items():
        labels[str(col)] = str(meta.get("name") or meta.get("code") or col)

    for var in schema.get("variables") or []:
        if var.get("custom"):
            continue
        text = str(var.get("text") or var.get("code") or "").strip()
        label = text[:120] if text else ""
        for c in var.get("columns") or []:
            col = str(c)
            if col not in labels and label:
                labels[col] = label
        code = str(var.get("code") or "").strip()
        if code and code not in labels and label:
            labels[code] = label

    return labels


def _column_label(
    col: str,
    label_map: dict[str, str],
    custom_by_col: dict[str, dict[str, Any]],
) -> str:
    if col in label_map:
        return label_map[col]
    if col in custom_by_col:
        return str(custom_by_col[col].get("name") or custom_by_col[col].get("code") or col)

    col_lower = str(col).lower()
    if col_lower in _SYSTEM_COLS or col_lower.replace(" ", "") in _SYSTEM_COLS:
        return col.replace("_", " ").title()
    return col


def _column_kind(col: str, custom_by_col: dict[str, dict[str, Any]]) -> str:
    if col in custom_by_col:
        return "custom"
    col_norm = str(col).lower().replace(" ", "")
    if col_norm in _SYSTEM_COLS or str(col).lower() in _SYSTEM_COLS:
        return "system"
    return "raw"


def _filter_dataframe(
    df: pd.DataFrame,
    search: str | None,
    search_column: str | None = None,
) -> pd.DataFrame:
    if df.empty or not search or not str(search).strip():
        return df

    query = str(search).strip().lower()
    if search_column and search_column in df.columns:
        mask = df[search_column].astype(str).str.lower().str.contains(query, na=False, regex=False)
        return df.loc[mask]

    mask = pd.Series(False, index=df.index)
    for col in df.columns:
        mask = mask | df[col].astype(str).str.lower().str.contains(query, na=False, regex=False)
    return df.loc[mask]


def get_raw_data_page(
    survey_id: int,
    *,
    completion_status: str = "complete",
    page: int = 1,
    page_size: int = 50,
    username: str | None = None,
    search: str | None = None,
    search_column: str | None = None,
) -> dict[str, Any]:
    schema, df = load_analysis_context(survey_id, completion_status=completion_status)
    custom_vars = list_custom_variables(survey_id, username=username)
    custom_by_col: dict[str, dict[str, Any]] = {
        custom_column_name(cv.id): cv.model_dump() for cv in custom_vars
    }

    total_rows = int(len(df))
    filtered_df = _filter_dataframe(df, search, search_column)
    filtered_rows = int(len(filtered_df))

    page = max(1, page)
    page_size = max(1, min(page_size, 200))
    start = (page - 1) * page_size
    end = start + page_size
    page_df = filtered_df.iloc[start:end] if filtered_rows else filtered_df.iloc[0:0]

    label_map = _build_column_label_map(schema, custom_by_col)

    columns = [
        {
            "key": str(col),
            "label": _column_label(str(col), label_map, custom_by_col),
            "kind": _column_kind(str(col), custom_by_col),
            "variable_id": custom_by_col.get(str(col), {}).get("id"),
        }
        for col in df.columns
    ]

    rows: list[dict[str, Any]] = []
    if not page_df.empty:
        cleaned = page_df.where(pd.notna(page_df), None)
        for record in cleaned.to_dict(orient="records"):
            row: dict[str, Any] = {}
            for key, value in record.items():
                if value is None:
                    row[str(key)] = None
                elif isinstance(value, float) and pd.isna(value):
                    row[str(key)] = None
                else:
                    row[str(key)] = value
            rows.append(row)

    return {
        "survey_id": survey_id,
        "completion_status": completion_status,
        "total_rows": total_rows,
        "filtered_rows": filtered_rows,
        "search": search or "",
        "search_column": search_column or "",
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (filtered_rows + page_size - 1) // page_size) if filtered_rows else 1,
        "columns": columns,
        "rows": rows,
        "custom_variables": [cv.model_dump() for cv in custom_vars],
    }


def raw_data_to_csv(
    survey_id: int,
    *,
    completion_status: str = "complete",
    username: str | None = None,
    search: str | None = None,
    search_column: str | None = None,
) -> str:
    schema, df = load_analysis_context(survey_id, completion_status=completion_status)
    df = _filter_dataframe(df, search, search_column)
    custom_vars = list_custom_variables(survey_id, username=username)
    custom_by_col = {custom_column_name(cv.id): cv.model_dump() for cv in custom_vars}
    label_map = _build_column_label_map(schema, custom_by_col)

    rename = {str(col): _column_label(str(col), label_map, custom_by_col) for col in df.columns}
    export_df = df.rename(columns=rename)
    return export_df.to_csv(index=False)
