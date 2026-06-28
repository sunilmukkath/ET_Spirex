from __future__ import annotations

from typing import Any

import pandas as pd

from app.services.answer_labels import canonical_answer_code
from app.services.question_schema import get_variable
from app.services.variable_columns import find_variable_column as _find_column


def legacy_filters_to_tree(filters: list[dict[str, Any]] | None) -> dict[str, Any] | None:
    if not filters:
        return None
    children = []
    for f in filters:
        values = [str(v) for v in (f.get("values") or []) if str(v).strip()]
        if not f.get("variable_id") or not values:
            continue
        children.append(
            {
                "type": "condition",
                "variable_id": f["variable_id"],
                "operator": "in",
                "values": values,
            }
        )
    if not children:
        return None
    return {"type": "group", "logic": "and", "negate": False, "children": children}


def apply_filter_tree(
    df: pd.DataFrame,
    schema: dict[str, Any],
    tree: dict[str, Any] | None,
    *,
    legacy_filters: list[dict[str, Any]] | None = None,
) -> pd.DataFrame:
    if tree is None and legacy_filters:
        tree = legacy_filters_to_tree(legacy_filters)
    if not tree or not tree.get("children"):
        return df
    mask = _eval_node(df, schema, tree)
    return df[mask.fillna(False)]


def _eval_node(df: pd.DataFrame, schema: dict[str, Any], node: dict[str, Any]) -> pd.Series:
    node_type = node.get("type", "group")
    if node_type == "condition":
        mask = _eval_condition(df, schema, node)
    else:
        children = node.get("children") or []
        logic = str(node.get("logic", "and")).lower()
        if not children:
            mask = pd.Series(True, index=df.index)
        elif logic == "or":
            mask = pd.Series(False, index=df.index)
            for child in children:
                mask = mask | _eval_node(df, schema, child)
        else:
            mask = pd.Series(True, index=df.index)
            for child in children:
                mask = mask & _eval_node(df, schema, child)
        if node.get("negate"):
            mask = ~mask
        return mask

    if node.get("negate"):
        mask = ~mask
    return mask


def _eval_condition(df: pd.DataFrame, schema: dict[str, Any], cond: dict[str, Any]) -> pd.Series:
    var = get_variable(schema, cond.get("variable_id", ""))
    if not var:
        return pd.Series(False, index=df.index)

    operator = str(cond.get("operator", "in")).lower()
    values = [str(v) for v in (cond.get("values") or []) if str(v).strip()]

    if operator in ("is_empty", "not_empty"):
        series = _variable_series(var, df)
        empty = series.isna() | (series.astype(str).str.strip() == "") | (
            series.astype(str).str.strip().str.lower().isin(["nan", "none"])
        )
        return empty if operator == "is_empty" else ~empty

    if var.get("kind") == "multi" and operator in ("in", "not_in", "eq", "ne"):
        return _eval_multi_condition(df, var, operator, values)

    col = _find_column(var, df)
    if not col or col not in df.columns:
        return pd.Series(False, index=df.index)

    raw = df[col]
    if var.get("kind") == "numeric" or operator in ("gt", "gte", "lt", "lte"):
        numeric = pd.to_numeric(raw, errors="coerce")
        if operator in ("gt", "gte", "lt", "lte") and values:
            threshold = float(values[0])
            if operator == "gt":
                return numeric > threshold
            if operator == "gte":
                return numeric >= threshold
            if operator == "lt":
                return numeric < threshold
            return numeric <= threshold
        if operator == "eq" and values:
            return numeric == float(values[0])
        if operator == "ne" and values:
            return numeric != float(values[0])

    series = raw.astype(str).str.strip()
    canonical = series.map(lambda v: canonical_answer_code(var, v) if v else "")
    labels = series

    expanded = _expand_match_values(var, values)

    if operator == "eq" and values:
        mask = (canonical == values[0]) | (labels == values[0]) | labels.isin(expanded)
    elif operator == "ne" and values:
        mask = ~((canonical == values[0]) | (labels == values[0]) | labels.isin(expanded))
    elif operator == "not_in":
        mask = ~(
            canonical.isin(expanded)
            | labels.isin(expanded)
            | series.isin(expanded)
        )
    elif operator == "contains" and values:
        needle = values[0].lower()
        mask = series.str.lower().str.contains(needle, na=False, regex=False)
    elif operator == "not_contains" and values:
        needle = values[0].lower()
        mask = ~series.str.lower().str.contains(needle, na=False, regex=False)
    else:
        mask = canonical.isin(expanded) | labels.isin(expanded) | series.isin(expanded)

    return mask.fillna(False)


def _eval_multi_condition(
    df: pd.DataFrame,
    var: dict[str, Any],
    operator: str,
    values: list[str],
) -> pd.Series:
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
    mask = pd.Series(operator in ("not_in", "ne"), index=df.index)
    for code in values:
        for sq in subquestions:
            if str(sq.get("code")) != str(code):
                continue
            col = sq.get("column") or f"{var.get('code')}_{code}"
            if col not in df.columns:
                col = _find_column({**var, "columns": [col]}, df)
            if not col or col not in df.columns:
                continue
            checked = df[col].astype(str).str.strip().isin(["Y", "1", "yes", "Yes", "y"])
            if operator in ("not_in", "ne"):
                mask = mask & ~checked
            else:
                mask = mask | checked
    return mask.fillna(False)


def _variable_series(var: dict[str, Any], df: pd.DataFrame) -> pd.Series:
    col = _find_column(var, df)
    if not col or col not in df.columns:
        return pd.Series(index=df.index, dtype=object)
    return df[col]


def _expand_match_values(var: dict[str, Any], values: list[str]) -> set[str]:
    from app.services.banner_analysis import _label_for_code

    match: set[str] = set()
    for v in values:
        match.add(v)
        match.add(str(v))
        label = _label_for_code(var, str(v))
        if label:
            match.add(label)
    if var.get("answer_options"):
        label_to_code = {str(o.get("label", "")).strip(): str(o["code"]) for o in var["answer_options"]}
        code_to_label = {str(o["code"]): str(o.get("label", "")).strip() for o in var["answer_options"]}
        for v in list(match):
            if v in code_to_label and code_to_label[v]:
                match.add(code_to_label[v])
            if v in label_to_code:
                match.add(label_to_code[v])
    return {m.strip() for m in match if m.strip()}
