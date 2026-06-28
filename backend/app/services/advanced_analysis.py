from __future__ import annotations

import math
from typing import Any

import numpy as np
import pandas as pd
from scipy import stats

from app.services.analysis_context import load_filtered_context
from app.services.banner_analysis import _value_series_for_chart
from app.services.filter_engine import legacy_filters_to_tree
from app.services.question_schema import get_variable
from app.services.variable_columns import find_variable_column as _find_column


def run_advanced_analysis(
    survey_id: int,
    *,
    analysis_type: str,
    completion_status: str = "complete",
    filters: list[dict[str, Any]] | None = None,
    filter_tree: dict[str, Any] | None = None,
    variable_ids: list[str] | None = None,
    dependent_id: str | None = None,
    independent_ids: list[str] | None = None,
    group_variable_id: str | None = None,
    numeric_variable_id: str | None = None,
    method: str = "pearson",
) -> dict[str, Any]:
    tree = filter_tree or legacy_filters_to_tree(filters)
    schema, df = load_filtered_context(
        survey_id,
        completion_status=completion_status,
        filters=filters if not tree else None,
        filter_tree=tree,
    )
    if df.empty:
        return {"error": "No responses match the selected filters", "base_n": 0}

    base_n = len(df)
    analysis_type = analysis_type.lower().strip()

    if analysis_type == "correlation":
        return _correlation_matrix(schema, df, variable_ids or [], method, base_n)
    if analysis_type == "regression":
        return _linear_regression(schema, df, dependent_id, independent_ids or [], base_n)
    if analysis_type in ("chi_square", "association"):
        ids = variable_ids or []
        if len(ids) < 2:
            return {"error": "Select two categorical variables for chi-square"}
        return _chi_square(schema, df, ids[0], ids[1], base_n)
    if analysis_type == "ttest":
        if not numeric_variable_id or not group_variable_id:
            return {"error": "Select a numeric variable and a grouping variable"}
        return _ttest(schema, df, numeric_variable_id, group_variable_id, base_n)
    if analysis_type == "anova":
        if not numeric_variable_id or not group_variable_id:
            return {"error": "Select a numeric variable and a grouping variable"}
        return _anova(schema, df, numeric_variable_id, group_variable_id, base_n)
    if analysis_type == "describe":
        return _describe_numeric(schema, df, variable_ids or [], base_n)

    return {"error": f"Unknown analysis type: {analysis_type}"}


def _numeric_series(schema: dict[str, Any], df: pd.DataFrame, variable_id: str) -> pd.Series | None:
    var = get_variable(schema, variable_id)
    if not var:
        return None
    return _value_series_for_chart(var, df)


def _categorical_series(schema: dict[str, Any], df: pd.DataFrame, variable_id: str) -> pd.Series | None:
    var = get_variable(schema, variable_id)
    if not var:
        return None
    col = _find_column(var, df)
    if not col or col not in df.columns:
        return None
    from app.services.answer_labels import canonical_answer_code, label_for_answer

    raw = df[col].astype(str).str.strip()
    return raw.map(lambda v: label_for_answer(var, canonical_answer_code(var, v)) or v)


def _var_label(schema: dict[str, Any], variable_id: str) -> str:
    var = get_variable(schema, variable_id)
    return var["text"] if var else variable_id


def _correlation_matrix(
    schema: dict[str, Any],
    df: pd.DataFrame,
    variable_ids: list[str],
    method: str,
    base_n: int,
) -> dict[str, Any]:
    if len(variable_ids) < 2:
        return {"error": "Select at least two numeric variables"}

    columns: dict[str, pd.Series] = {}
    labels: dict[str, str] = {}
    for vid in variable_ids[:12]:
        series = _numeric_series(schema, df, vid)
        if series is None:
            continue
        clean = series.dropna()
        if len(clean) < 3:
            continue
        key = vid
        columns[key] = series
        labels[key] = _var_label(schema, vid)

    if len(columns) < 2:
        return {"error": "Need at least two numeric variables with sufficient data"}

    frame = pd.DataFrame(columns)
    frame = frame.dropna()
    n = len(frame)
    if n < 3:
        return {"error": "Not enough overlapping responses for correlation"}

    method = method if method in ("pearson", "spearman", "kendall") else "pearson"
    corr = frame.corr(method=method)
    p_values: dict[str, dict[str, float | None]] = {}
    keys = list(columns.keys())

    for i, a in enumerate(keys):
        p_values[a] = {}
        for j, b in enumerate(keys):
            if i == j:
                p_values[a][b] = None
                continue
            x = frame[a].values
            y = frame[b].values
            if method == "spearman":
                _, p = stats.spearmanr(x, y)
            elif method == "kendall":
                _, p = stats.kendalltau(x, y)
            else:
                _, p = stats.pearsonr(x, y)
            p_values[a][b] = round(float(p), 4) if p == p else None

    rows = []
    for a in keys:
        row = {"variable_id": a, "label": labels[a], "values": {}}
        for b in keys:
            val = corr.loc[a, b]
            row["values"][b] = round(float(val), 4) if val == val else None
        rows.append(row)

    return {
        "analysis_type": "correlation",
        "method": method,
        "base_n": base_n,
        "pairwise_n": n,
        "variables": [{"id": k, "label": labels[k]} for k in keys],
        "matrix": rows,
        "p_values": p_values,
    }


def _linear_regression(
    schema: dict[str, Any],
    df: pd.DataFrame,
    dependent_id: str | None,
    independent_ids: list[str],
    base_n: int,
) -> dict[str, Any]:
    if not dependent_id or not independent_ids:
        return {"error": "Select a dependent (Y) and at least one independent (X) variable"}

    y = _numeric_series(schema, df, dependent_id)
    if y is None:
        return {"error": "Dependent variable not found or not numeric"}

    x_cols: dict[str, pd.Series] = {}
    for vid in independent_ids[:8]:
        xs = _numeric_series(schema, df, vid)
        if xs is not None:
            x_cols[vid] = xs

    if not x_cols:
        return {"error": "No valid independent variables"}

    data = pd.DataFrame({"y": y, **x_cols}).dropna()
    n = len(data)
    if n < len(x_cols) + 2:
        return {"error": f"Need at least {len(x_cols) + 2} complete cases (have {n})"}

    y_vals = data["y"].values.astype(float)
    x_matrix = np.column_stack([np.ones(n), *[data[c].values.astype(float) for c in x_cols]])
    coefs, residuals, rank, sv = np.linalg.lstsq(x_matrix, y_vals, rcond=None)

    y_hat = x_matrix @ coefs
    ss_res = float(np.sum((y_vals - y_hat) ** 2))
    ss_tot = float(np.sum((y_vals - np.mean(y_vals)) ** 2))
    r_squared = 1 - ss_res / ss_tot if ss_tot else 0
    adj_r_squared = 1 - (1 - r_squared) * (n - 1) / (n - len(coefs)) if n > len(coefs) else r_squared
    mse = ss_res / (n - len(coefs)) if n > len(coefs) else ss_res

    coef_names = ["Intercept"] + [_var_label(schema, vid) for vid in x_cols]
    coefficients = []
    for i, name in enumerate(coef_names):
        coefficients.append(
            {
                "name": name,
                "variable_id": None if i == 0 else list(x_cols.keys())[i - 1],
                "estimate": round(float(coefs[i]), 4),
            }
        )

    return {
        "analysis_type": "regression",
        "base_n": base_n,
        "n": n,
        "dependent": {"id": dependent_id, "label": _var_label(schema, dependent_id)},
        "independents": [
            {"id": vid, "label": _var_label(schema, vid)} for vid in x_cols
        ],
        "r_squared": round(r_squared, 4),
        "adj_r_squared": round(adj_r_squared, 4),
        "rmse": round(math.sqrt(mse), 4),
        "coefficients": coefficients,
    }


def _chi_square(
    schema: dict[str, Any],
    df: pd.DataFrame,
    var_a: str,
    var_b: str,
    base_n: int,
) -> dict[str, Any]:
    a = _categorical_series(schema, df, var_a)
    b = _categorical_series(schema, df, var_b)
    if a is None or b is None:
        return {"error": "Could not load variables for chi-square test"}

    table_df = pd.DataFrame({"a": a, "b": b}).dropna()
    if len(table_df) < 5:
        return {"error": "Not enough responses for chi-square test"}

    ct = pd.crosstab(table_df["a"], table_df["b"])
    if ct.shape[0] < 2 or ct.shape[1] < 2:
        return {"error": "Both variables need at least two categories"}

    chi2, p, dof, _ = stats.chi2_contingency(ct)
    n = ct.sum().sum()
    cramers_v = math.sqrt(chi2 / (n * (min(ct.shape) - 1))) if n and min(ct.shape) > 1 else 0

    return {
        "analysis_type": "chi_square",
        "base_n": base_n,
        "n": int(n),
        "variable_a": {"id": var_a, "label": _var_label(schema, var_a)},
        "variable_b": {"id": var_b, "label": _var_label(schema, var_b)},
        "chi2": round(float(chi2), 4),
        "df": int(dof),
        "p_value": round(float(p), 4),
        "cramers_v": round(float(cramers_v), 4),
        "interpretation": _assoc_strength(cramers_v),
        "table": {
            "row_labels": [str(x) for x in ct.index.tolist()],
            "col_labels": [str(x) for x in ct.columns.tolist()],
            "counts": ct.values.tolist(),
        },
    }


def _assoc_strength(v: float) -> str:
    if v < 0.1:
        return "Negligible association"
    if v < 0.3:
        return "Weak association"
    if v < 0.5:
        return "Moderate association"
    return "Strong association"


def _ttest(
    schema: dict[str, Any],
    df: pd.DataFrame,
    numeric_id: str,
    group_id: str,
    base_n: int,
) -> dict[str, Any]:
    numeric = _numeric_series(schema, df, numeric_id)
    groups = _categorical_series(schema, df, group_id)
    if numeric is None or groups is None:
        return {"error": "Variables not found"}

    data = pd.DataFrame({"y": numeric, "g": groups}).dropna()
    top_groups = data["g"].value_counts().head(2).index.tolist()
    if len(top_groups) < 2:
        return {"error": "Grouping variable needs at least two categories"}

    g1 = data.loc[data["g"] == top_groups[0], "y"].astype(float)
    g2 = data.loc[data["g"] == top_groups[1], "y"].astype(float)
    if len(g1) < 2 or len(g2) < 2:
        return {"error": "Each group needs at least two responses"}

    t_stat, p = stats.ttest_ind(g1, g2, equal_var=False, nan_policy="omit")

    return {
        "analysis_type": "ttest",
        "base_n": base_n,
        "numeric_variable": {"id": numeric_id, "label": _var_label(schema, numeric_id)},
        "group_variable": {"id": group_id, "label": _var_label(schema, group_id)},
        "group_a": {"label": str(top_groups[0]), "n": int(len(g1)), "mean": round(float(g1.mean()), 4)},
        "group_b": {"label": str(top_groups[1]), "n": int(len(g2)), "mean": round(float(g2.mean()), 4)},
        "t_statistic": round(float(t_stat), 4),
        "p_value": round(float(p), 4),
        "significant_95": p < 0.05,
    }


def _anova(
    schema: dict[str, Any],
    df: pd.DataFrame,
    numeric_id: str,
    group_id: str,
    base_n: int,
) -> dict[str, Any]:
    numeric = _numeric_series(schema, df, numeric_id)
    groups = _categorical_series(schema, df, group_id)
    if numeric is None or groups is None:
        return {"error": "Variables not found"}

    data = pd.DataFrame({"y": numeric, "g": groups}).dropna()
    group_labels = data["g"].value_counts().head(8).index.tolist()
    samples = [data.loc[data["g"] == g, "y"].astype(float).values for g in group_labels]
    samples = [s for s in samples if len(s) >= 2]
    if len(samples) < 2:
        return {"error": "Need at least two groups with sufficient data"}

    f_stat, p = stats.f_oneway(*samples)

    group_stats = []
    for g in group_labels:
        vals = data.loc[data["g"] == g, "y"].astype(float)
        if len(vals) >= 1:
            group_stats.append(
                {
                    "label": str(g),
                    "n": int(len(vals)),
                    "mean": round(float(vals.mean()), 4),
                    "std": round(float(vals.std()), 4) if len(vals) > 1 else 0,
                }
            )

    return {
        "analysis_type": "anova",
        "base_n": base_n,
        "numeric_variable": {"id": numeric_id, "label": _var_label(schema, numeric_id)},
        "group_variable": {"id": group_id, "label": _var_label(schema, group_id)},
        "f_statistic": round(float(f_stat), 4),
        "p_value": round(float(p), 4),
        "groups": group_stats,
        "significant_95": p < 0.05,
    }


def _describe_numeric(
    schema: dict[str, Any],
    df: pd.DataFrame,
    variable_ids: list[str],
    base_n: int,
) -> dict[str, Any]:
    rows = []
    for vid in variable_ids[:20]:
        series = _numeric_series(schema, df, vid)
        if series is None:
            continue
        clean = series.dropna().astype(float)
        if clean.empty:
            continue
        rows.append(
            {
                "variable_id": vid,
                "label": _var_label(schema, vid),
                "n": int(len(clean)),
                "mean": round(float(clean.mean()), 4),
                "std": round(float(clean.std()), 4) if len(clean) > 1 else 0,
                "min": round(float(clean.min()), 4),
                "max": round(float(clean.max()), 4),
                "median": round(float(clean.median()), 4),
            }
        )
    return {"analysis_type": "describe", "base_n": base_n, "rows": rows}
