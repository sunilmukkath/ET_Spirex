from __future__ import annotations

import math
import re
from collections import Counter
from typing import Any

import pandas as pd
from scipy.stats import chi2_contingency

from app.services.answer_labels import (
    builtin_scale_options,
    canonical_answer_code,
    label_for_answer,
    normalize_answer_code,
)
from app.services.analysis_context import load_analysis_context, load_filtered_context
from app.services.question_schema import get_variable
from app.services.variable_columns import find_variable_column as _find_column

Z_THRESHOLDS = {0.90: 1.645, 0.95: 1.96, 0.99: 2.576}


def run_question_profile(
    survey_id: int,
    variable_id: str,
    *,
    completion_status: str = "complete",
    filters: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    schema, df_raw = load_filtered_context(
        survey_id,
        completion_status=completion_status,
        filters=filters,
    )
    variable = get_variable(schema, variable_id)
    if not variable:
        return {"error": f"Variable '{variable_id}' not found"}

    df = df_raw
    if df.empty:
        return {"error": "No responses match the selected filters"}

    kind = variable["kind"]
    if kind == "single":
        return _profile_single(variable, df)
    if kind == "multi":
        return _profile_multi(variable, df)
    if kind == "array":
        return _profile_array(variable, df)
    if kind == "numeric":
        return _profile_numeric(variable, df)
    if kind == "rank":
        return _profile_rank(variable, df)
    if kind == "text":
        return _profile_text(variable, df)
    if kind == "location":
        return _profile_location(variable, df)
    return {"error": f"Analysis not supported for {variable['type_label']}"}


def run_banner_table(
    survey_id: int,
    *,
    row_variable_id: str,
    banner_variable_ids: list[str],
    row_variable_ids: list[str] | None = None,
    filters: list[dict[str, Any]] | None = None,
    row_filters: dict[str, list[dict[str, Any]]] | None = None,
    completion_status: str = "complete",
    show_counts: bool = True,
    show_col_pct: bool = True,
    show_row_pct: bool = False,
    show_significance: bool = True,
    confidence_level: float = 0.95,
    metric: str = "auto",
) -> dict[str, Any]:
    row_ids = row_variable_ids or [row_variable_id]
    row_ids = [rid for rid in row_ids if rid]

    def _row_filters(rid: str) -> list[dict[str, Any]]:
        if row_filters and rid in row_filters:
            return row_filters[rid]
        return filters or []

    if len(row_ids) <= 1:
        rid = row_ids[0] if row_ids else row_variable_id
        return _build_banner_table(
            survey_id,
            row_variable_id=rid,
            banner_variable_ids=banner_variable_ids,
            filters=_row_filters(rid),
            completion_status=completion_status,
            show_counts=show_counts,
            show_col_pct=show_col_pct,
            show_row_pct=show_row_pct,
            show_significance=show_significance,
            confidence_level=confidence_level,
            metric=metric,
        )

    schema, df_raw = load_analysis_context(survey_id, completion_status=completion_status)
    tables = []
    for rid in row_ids:
        table = _build_banner_table(
            survey_id,
            row_variable_id=rid,
            banner_variable_ids=banner_variable_ids,
            filters=_row_filters(rid),
            completion_status=completion_status,
            show_counts=show_counts,
            show_col_pct=show_col_pct,
            show_row_pct=show_row_pct,
            show_significance=show_significance,
            confidence_level=confidence_level,
            metric=metric,
            schema=schema,
            df_raw=df_raw,
        )
        tables.append(table)

    errors = [t.get("error") for t in tables if t.get("error")]
    if errors and all(t.get("error") for t in tables):
        return {"error": errors[0], "tables": tables}

    return {
        "table_type": "multi",
        "tables": tables,
        "confidence_level": confidence_level,
        "show_counts": show_counts,
        "show_col_pct": show_col_pct,
        "show_row_pct": show_row_pct,
        "show_significance": show_significance,
    }


def _build_banner_table(
    survey_id: int,
    *,
    row_variable_id: str,
    banner_variable_ids: list[str],
    filters: list[dict[str, Any]] | None = None,
    completion_status: str = "complete",
    show_counts: bool = True,
    show_col_pct: bool = True,
    show_row_pct: bool = False,
    show_significance: bool = True,
    confidence_level: float = 0.95,
    metric: str = "auto",
    schema: dict[str, Any] | None = None,
    df_raw: pd.DataFrame | None = None,
) -> dict[str, Any]:
    if schema is None or df_raw is None:
        schema, df = load_filtered_context(
            survey_id,
            completion_status=completion_status,
            filters=filters,
        )
    else:
        df = _apply_filters(df_raw, schema, filters or [])

    row_var = get_variable(schema, row_variable_id)
    if not row_var:
        return {"error": f"Row variable '{row_variable_id}' not found"}
    if not row_var["can_banner"]:
        return {"error": f"'{row_var['text']}' cannot be used as a banner row"}

    banner_vars = []
    for bid in banner_variable_ids:
        bvar = get_variable(schema, bid)
        if not bvar:
            return {"error": f"Banner variable '{bid}' not found"}
        if not bvar["can_banner"]:
            return {"error": f"'{bvar['text']}' cannot be used as a banner break"}
        banner_vars.append(bvar)

    if df.empty:
        return {"error": "No responses match the selected filters"}

    resolved_metric = metric if metric != "auto" else _default_metric(row_var)
    base_n = len(df)

    banner_columns = _build_banner_columns(banner_vars, df)
    if not banner_columns:
        return {"error": "Banner variables have no valid data columns"}

    if row_var["kind"] in ("single",) or (
        row_var["kind"] == "array" and row_var["subquestions"]
    ):
        if row_var["kind"] == "single":
            table = _banner_single(row_var, banner_columns, df, resolved_metric)
        else:
            table = _banner_array(row_var, banner_columns, df, resolved_metric)
    elif row_var["kind"] == "multi":
        table = _banner_multi(row_var, banner_columns, df)
    elif row_var["kind"] == "numeric":
        table = _banner_numeric(row_var, banner_columns, df, resolved_metric)
    else:
        return {"error": f"Banner analysis not supported for {row_var['type_label']}"}

    if show_significance and resolved_metric == "distribution":
        if table.get("table_type") == "array" and table.get("sections"):
            for section in table["sections"]:
                _add_significance(section, row_var, confidence_level=confidence_level)
                if show_row_pct:
                    _apply_row_pcts(section)
        else:
            _add_significance(table, row_var, confidence_level=confidence_level)
            if show_row_pct:
                _apply_row_pcts(table)
    elif show_row_pct:
        if table.get("table_type") == "array" and table.get("sections"):
            for section in table["sections"]:
                _apply_row_pcts(section)
        else:
            _apply_row_pcts(table)

    return {
        "row_variable": _var_summary(row_var),
        "banner_variables": [_var_summary(v) for v in banner_vars],
        "metric": resolved_metric,
        "base_n": base_n,
        "filtered_n": len(df),
        "filters_applied": filters or [],
        "show_counts": show_counts,
        "show_col_pct": show_col_pct,
        "show_row_pct": show_row_pct,
        "show_significance": show_significance,
        "confidence_level": confidence_level,
        **table,
    }


def _var_summary(v: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": v["id"],
        "code": v["code"],
        "text": v["text"],
        "kind": v["kind"],
        "type_label": v["type_label"],
    }


def _default_metric(row_var: dict[str, Any]) -> str:
    metrics = row_var.get("metrics") or []
    if "distribution" in metrics:
        return "distribution"
    if "checkbox_rate" in metrics:
        return "checkbox_rate"
    if "mean" in metrics:
        return "mean"
    return "distribution"


def _apply_filters(
    df: pd.DataFrame,
    schema: dict[str, Any],
    filters: list[dict[str, Any]],
) -> pd.DataFrame:
    if not filters:
        return df
    result = df.copy()
    for f in filters:
        var = get_variable(schema, f.get("variable_id", ""))
        if not var:
            continue
        values = [str(v) for v in (f.get("values") or []) if str(v).strip()]
        if not values:
            continue

        match_values = _filter_match_values(var, values)
        kind = var.get("kind")

        if kind == "multi":
            mask = pd.Series(False, index=result.index)
            subquestions = var.get("subquestions") or []
            if not subquestions and var.get("answer_options"):
                subquestions = [
                    {
                        "code": o["code"],
                        "label": o["label"],
                        "column": f"{var.get('code')}_{o['code']}",
                    }
                    for o in var["answer_options"]
                ]
            for code in values:
                for sq in subquestions:
                    if str(sq.get("code")) != str(code):
                        continue
                    col = _resolve_subquestion_column(var, sq, result)
                    if col and col in result.columns:
                        mask |= result[col].astype(str).str.strip().isin(
                            ["Y", "1", "yes", "Yes", "y"]
                        )
            result = result[mask]
            continue

        col = _find_column(var, result)
        if not col or col not in result.columns:
            continue

        series = result[col].astype(str).str.strip()
        mask = series.isin(match_values)
        # Also match when export uses labels but filter sends codes (or vice versa)
        if not mask.any() and var.get("answer_options"):
            label_to_code = {
                str(o.get("label", "")).strip(): str(o["code"])
                for o in var["answer_options"]
            }
            code_to_label = {
                str(o["code"]): str(o.get("label", "")).strip()
                for o in var["answer_options"]
            }
            expanded: set[str] = set()
            for v in values:
                expanded.add(v)
                if v in code_to_label and code_to_label[v]:
                    expanded.add(code_to_label[v])
                if v in label_to_code:
                    expanded.add(label_to_code[v])
            mask = series.isin(expanded)
        result = result[mask]

    return result


def _filter_match_values(var: dict[str, Any], values: list[str]) -> set[str]:
    match = set(values)
    for code in values:
        match.add(str(code))
        label = _label_for_code(var, str(code))
        if label:
            match.add(label)
    return {m.strip() for m in match if m.strip()}


def get_filter_options(
    survey_id: int,
    variable_id: str,
    *,
    completion_status: str = "complete",
) -> dict[str, Any]:
    schema, df = load_analysis_context(survey_id, completion_status=completion_status)
    var = get_variable(schema, variable_id)
    if not var:
        return {"options": [], "error": "Variable not found"}

    kind = var.get("kind")
    options: list[dict[str, Any]] = []

    if kind == "multi":
        subquestions = var.get("subquestions") or []
        if not subquestions and var.get("answer_options"):
            subquestions = [
                {"code": o["code"], "label": o["label"], "column": f"{var.get('code')}_{o['code']}"}
                for o in var["answer_options"]
            ]
        for sq in subquestions:
            col = _resolve_subquestion_column(var, sq, df)
            if not col or col not in df.columns:
                continue
            selected = df[col].astype(str).str.strip().isin(["Y", "1", "yes", "Yes", "y"]).sum()
            if int(selected) > 0:
                options.append(
                    {
                        "code": str(sq.get("code")),
                        "label": str(sq.get("label") or sq.get("code")),
                        "count": int(selected),
                    }
                )
        return {"options": options}

    col = _find_column(var, df)
    if not col or col not in df.columns:
        return {"options": [], "error": "No data column for this question"}

    counts = df[col].dropna().astype(str).str.strip().value_counts()
    for raw_code, count in counts.items():
        if not raw_code or raw_code.lower() in ("nan", "none"):
            continue
        options.append(
            {
                "code": raw_code,
                "label": _label_for_code(var, raw_code),
                "count": int(count),
            }
        )

    if var.get("answer_options"):
        order = [str(o["code"]) for o in var["answer_options"]]
        code_index = {c: i for i, c in enumerate(order)}
        options.sort(key=lambda o: (code_index.get(o["code"], 9999), o["code"]))

    return {"options": options}


def _build_banner_columns(
    banner_vars: list[dict[str, Any]],
    df: pd.DataFrame,
) -> list[dict[str, Any]]:
    columns: list[dict[str, Any]] = []
    for bvar in banner_vars:
        if bvar["kind"] == "single":
            col = bvar["columns"][0] if bvar["columns"] else bvar["code"]
            if col not in df.columns:
                continue
            categories = _ordered_categories(bvar, df[col])
            for cat in categories:
                label = _label_for_code(bvar, cat)
                columns.append(
                    {
                        "banner_id": bvar["id"],
                        "banner_text": bvar["text"],
                        "category_code": cat,
                        "category_label": label,
                        "header": label,
                        "filter_col": col,
                        "filter_value": cat,
                    }
                )
        elif bvar["kind"] == "multi":
            for sq in bvar["subquestions"]:
                col = sq["column"]
                if col not in df.columns:
                    continue
                columns.append(
                    {
                        "banner_id": bvar["id"],
                        "banner_text": bvar["text"],
                        "category_code": sq["code"],
                        "category_label": sq["label"],
                        "header": sq["label"],
                        "filter_col": col,
                        "filter_value": "Y",
                        "is_checkbox": True,
                    }
                )
    return columns


def _natural_sort_key(value: str) -> tuple[int, Any]:
    text = str(value)
    if text.isdigit():
        return (0, int(text))
    return (1, text)


def _ordered_categories(var: dict[str, Any], series: pd.Series) -> list[str]:
    canonical = series.dropna().astype(str).str.strip().map(lambda v: canonical_answer_code(var, v))
    canonical = canonical[canonical != ""]
    if var.get("answer_options"):
        codes = [normalize_answer_code(o["code"]) for o in var["answer_options"]]
        present = set(canonical.unique())
        return [c for c in codes if c in present] + sorted(
            present - set(codes), key=_natural_sort_key
        )
    return sorted(canonical.unique().tolist(), key=_natural_sort_key)


def _label_for_code(var: dict[str, Any], code: str) -> str:
    return label_for_answer(var, code)


def _resolve_subquestion_column(var: dict[str, Any], sq: dict[str, Any], df: pd.DataFrame) -> str | None:
    col = sq.get("column")
    if col and col in df.columns:
        return col
    code = var.get("code", "")
    sq_code = sq.get("code", "")
    for candidate in (f"{code}_{sq_code}", sq_code, col):
        if candidate and candidate in df.columns:
            return candidate
    return _find_column({**var, "columns": [col, f"{code}_{sq_code}", sq_code]}, df)


def _banner_single(
    row_var: dict[str, Any],
    banner_columns: list[dict[str, Any]],
    df: pd.DataFrame,
    metric: str,
) -> dict[str, Any]:
    col = _find_column(row_var, df)
    if col is None:
        return {"error": f"Data column for '{row_var['text']}' not found in responses"}

    if metric == "mean":
        return _banner_numeric_row(row_var, banner_columns, df, col)

    categories = _ordered_categories(row_var, df[col])
    rows = []
    for cat in categories:
        row_label = _label_for_code(row_var, cat)
        cells = _distribution_cells(df, col, cat, banner_columns, row_var=row_var)
        rows.append({"code": cat, "label": row_label, "cells": cells})

    total_cells = _distribution_cells(
        df, col, None, banner_columns, is_total_row=True, row_var=row_var
    )
    rows.append({"code": "_total", "label": "Total", "cells": total_cells, "is_total": True})

    headers = [{"key": "total", "label": "Total", "banner_id": None}] + [
        {"key": f"{c['banner_id']}_{c['category_code']}", "label": c["header"], "banner_id": c["banner_id"]}
        for c in banner_columns
    ]

    return {
        "table_type": "distribution",
        "row_header": row_var["text"],
        "headers": headers,
        "rows": rows,
    }


def _distribution_cells(
    df: pd.DataFrame,
    col: str,
    category: str | None,
    banner_columns: list[dict[str, Any]],
    *,
    is_total_row: bool = False,
    row_var: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    cells: list[dict[str, Any]] = []

    def _cell(subset: pd.DataFrame, match_value: str | None) -> dict[str, Any]:
        n = len(subset)
        if is_total_row:
            count = n
        else:
            col_series = subset[col].dropna().astype(str).str.strip()
            if row_var:
                canonical = col_series.map(lambda v: canonical_answer_code(row_var, v))
                count = int((canonical == str(match_value)).sum())
            else:
                count = int((col_series == str(match_value)).sum())
        pct = round((count / n) * 100, 1) if n else 0.0
        return {"count": count, "base": n, "col_pct": pct}

    cells.append(_cell(df, category))

    for banner in banner_columns:
        bcol = banner["filter_col"]
        if banner.get("is_checkbox"):
            subset = df[df[bcol].astype(str).isin(["Y", "1", "yes", "Yes"])]
        else:
            subset = df[df[bcol].astype(str) == str(banner["filter_value"])]
        cells.append(_cell(subset, category))

    return cells


def _banner_multi(
    row_var: dict[str, Any],
    banner_columns: list[dict[str, Any]],
    df: pd.DataFrame,
) -> dict[str, Any]:
    rows = []
    for sq in row_var["subquestions"]:
        col = sq["column"]
        if col not in df.columns:
            continue
        cells = []
        total_n = len(df)
        total_yes = int(df[col].astype(str).isin(["Y", "1", "yes", "Yes"]).sum())
        cells.append(
            {
                "count": total_yes,
                "base": total_n,
                "col_pct": round((total_yes / total_n) * 100, 1) if total_n else 0,
            }
        )
        for banner in banner_columns:
            if banner.get("is_checkbox"):
                subset = df[df[banner["filter_col"]].astype(str).isin(["Y", "1", "yes", "Yes"])]
            else:
                subset = df[df[banner["filter_col"]].astype(str) == str(banner["filter_value"])]
            n = len(subset)
            yes = int(subset[col].astype(str).isin(["Y", "1", "yes", "Yes"]).sum()) if n else 0
            cells.append(
                {
                    "count": yes,
                    "base": n,
                    "col_pct": round((yes / n) * 100, 1) if n else 0,
                }
            )
        rows.append({"code": sq["code"], "label": sq["label"], "cells": cells})

    headers = [{"key": "total", "label": "Total", "banner_id": None}] + [
        {"key": f"{c['banner_id']}_{c['category_code']}", "label": c["header"], "banner_id": c["banner_id"]}
        for c in banner_columns
    ]

    return {
        "table_type": "checkbox_rate",
        "row_header": row_var["text"],
        "headers": headers,
        "rows": rows,
    }


def _banner_array(
    row_var: dict[str, Any],
    banner_columns: list[dict[str, Any]],
    df: pd.DataFrame,
    metric: str,
) -> dict[str, Any]:
    if metric in ("mean", "top2box", "bottom2box"):
        return _banner_array_metrics(row_var, banner_columns, df, metric)

    answer_options = row_var.get("answer_options") or []
    if not answer_options:
        for sq in row_var["subquestions"][:1]:
            col = sq["column"]
            if col in df.columns:
                answer_options = [{"code": c, "label": c} for c in _ordered_categories(row_var, df[col])]
                break

    sections = []
    for sq in row_var["subquestions"]:
        col = sq["column"]
        if col not in df.columns:
            continue
        temp_var = {**row_var, "columns": [col], "text": sq["label"]}
        section = _banner_single(temp_var, banner_columns, df, "distribution")
        section["subquestion"] = sq["label"]
        sections.append(section)

    return {
        "table_type": "array",
        "row_header": row_var["text"],
        "sections": sections,
    }


def _banner_array_metrics(
    row_var: dict[str, Any],
    banner_columns: list[dict[str, Any]],
    df: pd.DataFrame,
    metric: str,
) -> dict[str, Any]:
    rows = []
    for sq in row_var["subquestions"]:
        col = sq["column"]
        if col not in df.columns:
            continue
        cells = _metric_cells(df, col, banner_columns, metric, row_var)
        rows.append({"code": sq["code"], "label": sq["label"], "cells": cells})

    headers = [{"key": "total", "label": "Total", "banner_id": None}] + [
        {"key": f"{c['banner_id']}_{c['category_code']}", "label": c["header"], "banner_id": c["banner_id"]}
        for c in banner_columns
    ]

    return {
        "table_type": metric,
        "row_header": row_var["text"],
        "headers": headers,
        "rows": rows,
    }


def _banner_numeric(
    row_var: dict[str, Any],
    banner_columns: list[dict[str, Any]],
    df: pd.DataFrame,
    metric: str,
) -> dict[str, Any]:
    if row_var["ls_type"] == "K" and row_var["subquestions"]:
        return _banner_array_metrics(row_var, banner_columns, df, metric)

    col = row_var["columns"][0] if row_var["columns"] else row_var["code"]
    return _banner_numeric_row(row_var, banner_columns, df, col, metric)


def _banner_numeric_row(
    row_var: dict[str, Any],
    banner_columns: list[dict[str, Any]],
    df: pd.DataFrame,
    col: str,
    metric: str = "mean",
) -> dict[str, Any]:
    cells = _metric_cells(df, col, banner_columns, metric, row_var)
    headers = [{"key": "total", "label": "Total", "banner_id": None}] + [
        {"key": f"{c['banner_id']}_{c['category_code']}", "label": c["header"], "banner_id": c["banner_id"]}
        for c in banner_columns
    ]
    return {
        "table_type": metric,
        "row_header": row_var["text"],
        "headers": headers,
        "rows": [{"code": metric, "label": metric.replace("_", " ").title(), "cells": cells}],
    }


def _metric_cells(
    df: pd.DataFrame,
    col: str,
    banner_columns: list[dict[str, Any]],
    metric: str,
    row_var: dict[str, Any],
) -> list[dict[str, Any]]:
    cells = [_compute_metric(df, col, metric, row_var)]
    for banner in banner_columns:
        if banner.get("is_checkbox"):
            subset = df[df[banner["filter_col"]].astype(str).isin(["Y", "1", "yes", "Yes"])]
        else:
            subset = df[df[banner["filter_col"]].astype(str) == str(banner["filter_value"])]
        cells.append(_compute_metric(subset, col, metric, row_var))
    return cells


def _compute_metric(
    df: pd.DataFrame,
    col: str,
    metric: str,
    row_var: dict[str, Any],
) -> dict[str, Any]:
    if col not in df.columns:
        return {"value": None, "base": 0}

    numeric = pd.to_numeric(df[col], errors="coerce")
    valid = numeric.dropna()
    n = int(valid.count())
    if n == 0:
        return {"value": None, "base": 0}

    if metric == "mean":
        return {"value": round(float(valid.mean()), 2), "base": n}

    codes = [o["code"] for o in row_var.get("answer_options") or []]
    if codes:
        top_codes = set(codes[-2:]) if len(codes) >= 2 else set(codes)
        bottom_codes = set(codes[:2]) if len(codes) >= 2 else set(codes)
    else:
        top_codes = {str(int(valid.max())), str(int(valid.max()) - 1)} if valid.max() >= 2 else set()
        bottom_codes = {"1", "2"}

    str_vals = df[col].astype(str)
    if metric == "top2box":
        count = int(str_vals.isin(top_codes).sum())
        return {"value": round((count / n) * 100, 1), "base": n, "col_pct": round((count / n) * 100, 1), "count": count}
    if metric == "bottom2box":
        count = int(str_vals.isin(bottom_codes).sum())
        return {"value": round((count / n) * 100, 1), "base": n, "col_pct": round((count / n) * 100, 1), "count": count}

    return {"value": round(float(valid.mean()), 2), "base": n}


def _apply_row_pcts(table: dict[str, Any]) -> None:
    for row in table.get("rows", []):
        if row.get("is_total"):
            continue
        row_base = row.get("cells", [{}])[0].get("count", 0) if row.get("cells") else 0
        if not row_base:
            continue
        for cell in row.get("cells", []):
            count = cell.get("count", 0) or 0
            cell["row_pct"] = round((count / row_base) * 100, 1)


def _add_significance(
    table: dict[str, Any],
    row_var: dict[str, Any],
    *,
    confidence_level: float = 0.95,
) -> None:
    if table.get("table_type") != "distribution":
        return

    data_rows = [r for r in table.get("rows", []) if not r.get("is_total")]
    if len(data_rows) < 1:
        return

    banner_count = max(len(data_rows[0].get("cells", [])) - 1, 0)
    if banner_count < 1:
        return

    observed = []
    for row in data_rows:
        observed.append([int(c.get("count", 0) or 0) for c in row.get("cells", [])[1:]])

    matrix = pd.DataFrame(observed)
    if matrix.sum().sum() == 0:
        return

    try:
        _, _, _, expected = chi2_contingency(matrix.to_numpy(), correction=False)
    except ValueError:
        return

    row_margins = matrix.sum(axis=1).to_numpy(dtype=float)
    col_margins = matrix.sum(axis=0).to_numpy(dtype=float)
    grand = float(matrix.sum().sum())
    threshold = Z_THRESHOLDS.get(confidence_level, Z_THRESHOLDS[0.95])

    for ri, row in enumerate(data_rows):
        for ci in range(banner_count):
            obs = float(matrix.iat[ri, ci])
            exp = float(expected[ri, ci])
            if exp <= 0:
                continue
            row_share = row_margins[ri] / grand if grand else 0
            col_share = col_margins[ci] / grand if grand else 0
            denom = exp * (1 - row_share) * (1 - col_share)
            if denom <= 0:
                continue
            residual = (obs - exp) / math.sqrt(denom)
            cell = row["cells"][ci + 1]
            cell["sig"] = _sig_letters(residual, confidence_level=confidence_level)
            cell["chi_residual"] = round(residual, 2)


def _two_proportion_z(p1: float, n1: int, p2: float, n2: int) -> float:
    if n1 == 0 or n2 == 0:
        return 0.0
    p_pool = (p1 * n1 + p2 * n2) / (n1 + n2)
    if p_pool in (0, 1):
        return 0.0
    se = math.sqrt(p_pool * (1 - p_pool) * (1 / n1 + 1 / n2))
    if se == 0:
        return 0.0
    return (p2 - p1) / se


def _sig_letters(z: float, *, confidence_level: float = 0.95) -> str | None:
    threshold = Z_THRESHOLDS.get(confidence_level, Z_THRESHOLDS[0.95])
    if abs(z) < threshold:
        return None
    marker = "+" if z > 0 else "-"
    if confidence_level >= 0.99:
        return f"{marker}99"
    if confidence_level >= 0.95:
        return f"{marker}95"
    return f"{marker}90"


def _profile_single(var: dict[str, Any], df: pd.DataFrame) -> dict[str, Any]:
    col = _find_column(var, df)
    if col is None:
        return {"error": f"No response data for '{var['text']}'", "variable": _var_summary(var)}

    series = df[col].dropna().astype(str).str.strip()
    canonical = series.map(lambda v: canonical_answer_code(var, v))
    total = int((canonical != "").sum())
    categories = _ordered_categories(var, series)
    values = []
    for cat in categories:
        count = int((canonical == cat).sum())
        values.append(
            {
                "code": cat,
                "label": _label_for_code(var, cat),
                "count": count,
                "percentage": round((count / total) * 100, 1) if total else 0,
            }
        )
    return {
        "analysis_type": "distribution",
        "variable": _var_summary(var),
        "base_n": total,
        "values": values,
    }


def _profile_multi(var: dict[str, Any], df: pd.DataFrame) -> dict[str, Any]:
    total = len(df)
    values = []
    subquestions = var.get("subquestions") or []
    if not subquestions and var.get("answer_options"):
        subquestions = [
            {"code": o["code"], "label": o["label"], "column": f"{var['code']}_{o['code']}"}
            for o in var["answer_options"]
        ]

    for sq in subquestions:
        col = _resolve_subquestion_column(var, sq, df)
        if col is None:
            continue
        yes = int(df[col].astype(str).isin(["Y", "1", "yes", "Yes"]).sum())
        values.append(
            {
                "code": sq["code"],
                "label": sq["label"],
                "count": yes,
                "percentage": round((yes / total) * 100, 1) if total else 0,
            }
        )
    return {
        "analysis_type": "checkbox_rate",
        "variable": _var_summary(var),
        "base_n": total,
        "values": values,
    }


def _profile_array(var: dict[str, Any], df: pd.DataFrame) -> dict[str, Any]:
    sections = []
    for sq in var.get("subquestions") or []:
        col = _resolve_subquestion_column(var, sq, df)
        if col is None:
            continue
        temp = {**var, "columns": [col]}
        profile = _profile_single(temp, df)
        profile["subquestion"] = sq["label"]
        sections.append(profile)
    return {
        "analysis_type": "array",
        "variable": _var_summary(var),
        "base_n": len(df),
        "sections": sections,
    }


def _profile_numeric(var: dict[str, Any], df: pd.DataFrame) -> dict[str, Any]:
    if var["ls_type"] == "K" and var["subquestions"]:
        sections = []
        for sq in var["subquestions"]:
            col = sq["column"]
            if col not in df.columns:
                continue
            numeric = pd.to_numeric(df[col], errors="coerce").dropna()
            sections.append(
                {
                    "subquestion": sq["label"],
                    "count": int(numeric.count()),
                    "mean": round(float(numeric.mean()), 2) if len(numeric) else None,
                    "median": round(float(numeric.median()), 2) if len(numeric) else None,
                    "min": round(float(numeric.min()), 2) if len(numeric) else None,
                    "max": round(float(numeric.max()), 2) if len(numeric) else None,
                }
            )
        return {"analysis_type": "numeric_multi", "variable": _var_summary(var), "sections": sections}

    col = var["columns"][0] if var["columns"] else var["code"]
    numeric = pd.to_numeric(df[col], errors="coerce").dropna()
    return {
        "analysis_type": "numeric",
        "variable": _var_summary(var),
        "count": int(numeric.count()),
        "mean": round(float(numeric.mean()), 2) if len(numeric) else None,
        "median": round(float(numeric.median()), 2) if len(numeric) else None,
        "std": round(float(numeric.std()), 2) if len(numeric) > 1 else 0,
        "min": round(float(numeric.min()), 2) if len(numeric) else None,
        "max": round(float(numeric.max()), 2) if len(numeric) else None,
    }


def _profile_rank(var: dict[str, Any], df: pd.DataFrame) -> dict[str, Any]:
    return _profile_multi(var, df)


def _profile_text(var: dict[str, Any], df: pd.DataFrame) -> dict[str, Any]:
    col = var["columns"][0] if var["columns"] else var["code"]
    if col not in df.columns:
        return {"error": "No data", "variable": _var_summary(var)}
    texts = df[col].dropna()
    word_counts: Counter[str] = Counter()
    samples: list[str] = []
    for text in texts:
        s = str(text).strip()
        if not s or s.lower() in ("nan", "none"):
            continue
        if len(samples) < 20:
            samples.append(s)
        for word in re.findall(r"[a-zA-Z]{3,}", s.lower()):
            word_counts[word] += 1

    return {
        "analysis_type": "text",
        "variable": _var_summary(var),
        "response_count": int(texts.shape[0]),
        "samples": samples,
        "top_words": [
            {"word": word, "count": count}
            for word, count in word_counts.most_common(40)
        ],
    }


def _profile_location(var: dict[str, Any], df: pd.DataFrame) -> dict[str, Any]:
    lat_col = var.get("lat_column") or ""
    lng_col = var.get("lng_column") or ""
    if not lat_col or not lng_col:
        pair_cols = [c for c in var.get("columns") or [] if c in df.columns]
        if len(pair_cols) >= 2:
            lat_col, lng_col = pair_cols[0], pair_cols[1]
        else:
            return {"error": "No GPS columns found", "variable": _var_summary(var)}

    if lat_col not in df.columns or lng_col not in df.columns:
        return {"error": "GPS columns missing in response data", "variable": _var_summary(var)}

    points: list[dict[str, float]] = []
    for _, row in df.iterrows():
        lat = pd.to_numeric(row.get(lat_col), errors="coerce")
        lng = pd.to_numeric(row.get(lng_col), errors="coerce")
        if pd.isna(lat) or pd.isna(lng):
            continue
        lat_f, lng_f = float(lat), float(lng)
        if not (-90 <= lat_f <= 90 and -180 <= lng_f <= 180):
            continue
        if lat_f == 0 and lng_f == 0:
            continue
        points.append({"lat": lat_f, "lng": lng_f})

    bounds = None
    if points:
        lats = [p["lat"] for p in points]
        lngs = [p["lng"] for p in points]
        bounds = {
            "north": max(lats),
            "south": min(lats),
            "east": max(lngs),
            "west": min(lngs),
        }

    return {
        "analysis_type": "location",
        "variable": _var_summary(var),
        "base_n": len(points),
        "points": points[:5000],
        "bounds": bounds,
    }


def run_chart_data(
    survey_id: int,
    variable_id: str,
    *,
    completion_status: str = "complete",
    filters: list[dict[str, Any]] | None = None,
    chart_type: str = "auto",
    bins: int = 10,
    banner_variable_id: str | None = None,
    y_variable_id: str | None = None,
    z_variable_id: str | None = None,
) -> dict[str, Any]:
    """Build chart-ready payloads; supports profile types plus histogram and banner breakdown."""
    if y_variable_id and chart_type in ("scatter_xy", "bubble"):
        return _scatter_chart_data(
            survey_id,
            x_variable_id=variable_id,
            y_variable_id=y_variable_id,
            z_variable_id=z_variable_id if chart_type == "bubble" else None,
            completion_status=completion_status,
            filters=filters,
            chart_type=chart_type,
        )

    if banner_variable_id and chart_type in ("banner_grouped", "banner_stacked", "banner_heatmap"):
        banner = run_banner_table(
            survey_id,
            row_variable_id=variable_id,
            row_variable_ids=[variable_id],
            banner_variable_ids=[banner_variable_id],
            filters=filters,
            completion_status=completion_status,
            show_significance=False,
            metric="auto",
        )
        if banner.get("error") and not banner.get("headers"):
            return banner
        banner["chart_type"] = chart_type
        return banner

    if chart_type == "histogram":
        return _numeric_histogram(
            survey_id,
            variable_id,
            completion_status=completion_status,
            filters=filters,
            bins=bins,
        )

    profile = run_question_profile(
        survey_id,
        variable_id,
        completion_status=completion_status,
        filters=filters,
    )
    if profile.get("error"):
        return profile
    profile["chart_type"] = chart_type
    return profile


def _numeric_histogram(
    survey_id: int,
    variable_id: str,
    *,
    completion_status: str = "complete",
    filters: list[dict[str, Any]] | None = None,
    bins: int = 10,
) -> dict[str, Any]:
    schema, df = load_filtered_context(
        survey_id,
        completion_status=completion_status,
        filters=filters,
    )
    variable = get_variable(schema, variable_id)
    if not variable:
        return {"error": f"Variable '{variable_id}' not found"}
    if variable["kind"] != "numeric":
        return {"error": "Histogram is only available for numeric questions"}

    if df.empty:
        return {"error": "No responses match the selected filters"}

    col = variable["columns"][0] if variable["columns"] else variable["code"]
    if col not in df.columns:
        return {"error": "No data column found"}

    numeric = pd.to_numeric(df[col], errors="coerce").dropna()
    if numeric.empty:
        return {"error": "No numeric responses"}

    bins = max(3, min(int(bins), 50))
    counts, edges = pd.cut(numeric, bins=bins, retbins=True, duplicates="drop")
    grouped = counts.value_counts().sort_index()
    total = int(len(numeric))
    values = []
    for interval, count in grouped.items():
        left = float(interval.left)
        right = float(interval.right)
        label = f"{left:.1g}–{right:.1g}"
        values.append(
            {
                "code": label,
                "label": label,
                "count": int(count),
                "percentage": round(100 * int(count) / total, 1) if total else 0,
            }
        )

    return {
        "analysis_type": "histogram",
        "chart_type": "histogram",
        "variable": _var_summary(variable),
        "base_n": total,
        "values": values,
    }


def _value_series_for_chart(var: dict[str, Any], df: pd.DataFrame) -> pd.Series:
    """Per-respondent numeric values for scatter / bubble axes."""
    kind = var.get("kind")

    if kind == "numeric":
        if var.get("ls_type") == "K" and var.get("subquestions"):
            cols = [sq["column"] for sq in var["subquestions"] if sq.get("column") in df.columns]
            if not cols:
                return pd.Series(index=df.index, dtype=float)
            nums = df[cols].apply(pd.to_numeric, errors="coerce")
            return nums.mean(axis=1)
        col = var["columns"][0] if var.get("columns") else var["code"]
        if col not in df.columns:
            return pd.Series(index=df.index, dtype=float)
        return pd.to_numeric(df[col], errors="coerce")

    if kind in ("single", "custom", "rank"):
        col = _find_column(var, df)
        if col is None:
            return pd.Series(index=df.index, dtype=float)
        raw = df[col].astype(str).str.strip()
        numeric = pd.to_numeric(raw.replace({"": pd.NA, "nan": pd.NA}), errors="coerce")
        if numeric.notna().sum() >= max(3, int(len(df) * 0.3)):
            return numeric
        options = var.get("answer_options") or builtin_scale_options(var)
        code_to_idx = {str(o["code"]): float(i + 1) for i, o in enumerate(options)}
        canonical = raw.map(lambda v: canonical_answer_code(var, v))
        return canonical.map(code_to_idx)

    if kind == "multi":
        subquestions = var.get("subquestions") or []
        if not subquestions and var.get("answer_options"):
            subquestions = [
                {"code": o["code"], "label": o["label"], "column": f"{var['code']}_{o['code']}"}
                for o in var["answer_options"]
            ]
        count = pd.Series(0.0, index=df.index)
        for sq in subquestions:
            col = _resolve_subquestion_column(var, sq, df)
            if col is None:
                continue
            checked = df[col].astype(str).isin(["Y", "1", "yes", "Yes"])
            count = count + checked.astype(float)
        return count

    return pd.Series(index=df.index, dtype=float)


def _scatter_chart_data(
    survey_id: int,
    *,
    x_variable_id: str,
    y_variable_id: str,
    z_variable_id: str | None = None,
    completion_status: str = "complete",
    filters: list[dict[str, Any]] | None = None,
    chart_type: str = "scatter_xy",
) -> dict[str, Any]:
    schema, df = load_filtered_context(
        survey_id,
        completion_status=completion_status,
        filters=filters,
    )
    x_var = get_variable(schema, x_variable_id)
    y_var = get_variable(schema, y_variable_id)
    if not x_var:
        return {"error": f"X variable '{x_variable_id}' not found"}
    if not y_var:
        return {"error": f"Y variable '{y_variable_id}' not found"}
    if x_variable_id == y_variable_id:
        return {"error": "X and Y must be different variables"}
    if z_variable_id and z_variable_id in (x_variable_id, y_variable_id):
        return {"error": "Size variable must differ from X and Y"}

    z_var = get_variable(schema, z_variable_id) if z_variable_id else None
    if z_variable_id and not z_var:
        return {"error": f"Size variable '{z_variable_id}' not found"}

    if df.empty:
        return {"error": "No responses match the selected filters"}

    x_series = _value_series_for_chart(x_var, df)
    y_series = _value_series_for_chart(y_var, df)
    z_series = _value_series_for_chart(z_var, df) if z_var else None

    mask = x_series.notna() & y_series.notna()
    if z_series is not None:
        mask = mask & z_series.notna()

    paired = df.loc[mask]
    if paired.empty:
        return {
            "error": "No respondents with valid values on all selected axes",
            "x_variable": _var_summary(x_var),
            "y_variable": _var_summary(y_var),
        }

    xs = x_series.loc[mask]
    ys = y_series.loc[mask]
    zs = z_series.loc[mask] if z_series is not None else None

    points: list[dict[str, float]] = []
    for i in range(len(paired)):
        pt: dict[str, float] = {
            "x": round(float(xs.iloc[i]), 4),
            "y": round(float(ys.iloc[i]), 4),
        }
        if zs is not None:
            pt["z"] = round(float(zs.iloc[i]), 4)
        points.append(pt)

    max_points = 3000
    if len(points) > max_points:
        step = max(1, len(points) // max_points)
        points = points[::step][:max_points]

    result: dict[str, Any] = {
        "analysis_type": "scatter",
        "chart_type": chart_type,
        "variable": _var_summary(x_var),
        "x_variable": _var_summary(x_var),
        "y_variable": _var_summary(y_var),
        "base_n": int(mask.sum()),
        "scatter_points": points,
    }
    if z_var:
        result["z_variable"] = _var_summary(z_var)
    return result
