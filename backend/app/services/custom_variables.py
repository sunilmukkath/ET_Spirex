from __future__ import annotations

from typing import Any

import pandas as pd

from app.models.custom_variable import CustomVariable
from app.services.custom_variable_store import list_custom_variables
from app.services.question_schema import get_variable
from app.services.variable_columns import find_variable_column

_CHECKBOX_YES = frozenset({"y", "1", "yes"})


def custom_column_name(variable_id: str, suffix: str = "") -> str:
    base = f"_cv_{variable_id}"
    return f"{base}_{suffix}" if suffix else base


def apply_custom_variables(
    survey_id: int,
    schema: dict[str, Any],
    df: pd.DataFrame,
) -> tuple[dict[str, Any], pd.DataFrame]:
    custom_vars = list_custom_variables(survey_id)
    if not custom_vars:
        return schema, df

    df = df.copy()
    schema = dict(schema)
    variables = list(schema.get("variables") or [])

    custom_ids: list[str] = []
    for cv in custom_vars:
        computed = compute_custom_variable(cv, schema, df)
        if computed is None:
            continue

        if isinstance(computed, dict):
            for col_name, series in computed.items():
                df[col_name] = series
            variables.append(_custom_to_schema_var(cv, list(computed.keys()), computed))
        else:
            col_name = custom_column_name(cv.id)
            df[col_name] = computed
            variables.append(_custom_to_schema_var(cv, [col_name], {col_name: computed}))

        custom_ids.append(cv.id)

    schema["variables"] = variables
    if custom_ids:
        groups = list(schema.get("groups") or [])
        groups.append(
            {
                "id": -1,
                "title": "Custom variables",
                "order": 9999,
                "variable_ids": custom_ids,
            }
        )
        schema["groups"] = groups

    return schema, df


def preview_custom_variable(
    cv: CustomVariable,
    schema: dict[str, Any],
    df: pd.DataFrame,
) -> dict[str, Any]:
    if cv.variable_type == "net_score":
        return _preview_net_score(cv, schema, df)

    computed = compute_custom_variable(cv, schema, df)
    if computed is None:
        return {"error": "Could not compute variable — check source questions and columns", "counts": []}

    if isinstance(computed, dict):
        total = int(len(df))
        rows = []
        for code, series in computed.items():
            yes = int(series.astype(str).isin(["Y", "1", "yes", "Yes"]).sum())
            label = code.replace(f"_cv_{cv.id}_", "").replace(f"{cv.code}_", "")
            rows.append(
                {
                    "label": label,
                    "count": yes,
                    "percentage": round((yes / total) * 100, 1) if total else 0,
                }
            )
        return {"total": total, "counts": rows, "preview_type": "combine"}

    counts = computed.value_counts(dropna=False).reset_index()
    counts.columns = ["label", "count"]
    total = int(len(computed))
    rows = []
    for _, row in counts.iterrows():
        label = str(row["label"]) if pd.notna(row["label"]) else "(blank)"
        count = int(row["count"])
        rows.append(
            {
                "label": label,
                "count": count,
                "percentage": round((count / total) * 100, 1) if total else 0,
            }
        )
    return {"total": total, "counts": rows}


def compute_custom_variable(
    cv: CustomVariable,
    schema: dict[str, Any],
    df: pd.DataFrame,
) -> pd.Series | dict[str, pd.Series] | None:
    if cv.variable_type == "combine":
        return _compute_combine(cv, schema, df)
    if cv.variable_type == "net_score":
        return _compute_net_score(cv, schema, df)
    return _compute_recode(cv, schema, df)


def _preview_net_score(cv: CustomVariable, schema: dict[str, Any], df: pd.DataFrame) -> dict[str, Any]:
    series = _compute_net_score(cv, schema, df)
    if series is None:
        return {"error": "Source variable has no data column", "counts": []}

    total = int(len(series))
    top_n = int((series == 1).sum())
    bottom_n = int((series == -1).sum())
    neutral_n = int((series == 0).sum())
    top_pct = round((top_n / total) * 100, 1) if total else 0
    bottom_pct = round((bottom_n / total) * 100, 1) if total else 0
    net_pct = round(top_pct - bottom_pct, 1)

    return {
        "total": total,
        "preview_type": "net_score",
        "top_count": top_n,
        "bottom_count": bottom_n,
        "neutral_count": neutral_n,
        "top_pct": top_pct,
        "bottom_pct": bottom_pct,
        "net_pct": net_pct,
        "counts": [
            {"label": "Top box", "count": top_n, "percentage": top_pct},
            {"label": "Neutral", "count": neutral_n, "percentage": round((neutral_n / total) * 100, 1) if total else 0},
            {"label": "Bottom box", "count": bottom_n, "percentage": bottom_pct},
            {"label": "Net (Top − Bottom)", "count": net_pct, "percentage": net_pct},
        ],
    }


def _compute_recode(
    cv: CustomVariable,
    schema: dict[str, Any],
    df: pd.DataFrame,
) -> pd.Series | None:
    source = get_variable(schema, cv.source_variable_id)
    if not source:
        return None
    src_col = find_variable_column(source, df)
    if not src_col or src_col not in df.columns:
        return None

    value_map: dict[str, str] = {}
    for cat in cv.categories:
        for raw in cat.source_values:
            value_map[str(raw).strip()] = cat.label

    def map_value(raw: Any) -> str | None:
        if raw is None or (isinstance(raw, float) and pd.isna(raw)):
            return None
        key = str(raw).strip()
        if not key or key.lower() in ("nan", "none", ""):
            return None
        if key in value_map:
            return value_map[key]
        if cv.include_unmapped:
            return cv.unmapped_label
        return None

    return df[src_col].map(map_value)


def _compute_combine(
    cv: CustomVariable,
    schema: dict[str, Any],
    df: pd.DataFrame,
) -> dict[str, pd.Series] | None:
    source_ids = cv.source_variable_ids or []
    if len(source_ids) < 2:
        return None

    tracked = [str(c).strip() for c in cv.tracked_codes if str(c).strip()]
    if not tracked:
        tracked = _infer_shared_codes(schema, source_ids)
    if not tracked:
        return None

    result: dict[str, pd.Series] = {}
    index = df.index

    for code in tracked:
        col_name = custom_column_name(cv.id, code)
        flags = pd.Series(False, index=index)
        for var_id in source_ids:
            var = get_variable(schema, var_id)
            if not var:
                continue
            flags = flags | _code_selected_mask(var, code, df)
        result[col_name] = flags.map(lambda v: "Y" if v else "N")

    return result if result else None


def _compute_net_score(
    cv: CustomVariable,
    schema: dict[str, Any],
    df: pd.DataFrame,
) -> pd.Series | None:
    source = get_variable(schema, cv.source_variable_id)
    if not source:
        return None
    src_col = find_variable_column(source, df)
    if not src_col or src_col not in df.columns:
        return None

    top = {str(c).strip() for c in cv.top_codes}
    bottom = {str(c).strip() for c in cv.bottom_codes}

    def score(raw: Any) -> int | None:
        if raw is None or (isinstance(raw, float) and pd.isna(raw)):
            return None
        key = str(raw).strip()
        if not key or key.lower() in ("nan", "none", ""):
            return None
        if key in top:
            return 1
        if key in bottom:
            return -1
        return 0

    return df[src_col].map(score)


def _infer_shared_codes(schema: dict[str, Any], source_ids: list[str]) -> list[str]:
    code_sets: list[set[str]] = []
    for var_id in source_ids:
        var = get_variable(schema, var_id)
        if not var:
            continue
        codes: set[str] = set()
        for sq in var.get("subquestions") or []:
            if sq.get("code"):
                codes.add(str(sq["code"]))
        for opt in var.get("answer_options") or []:
            if opt.get("code"):
                codes.add(str(opt["code"]))
        if codes:
            code_sets.append(codes)

    if not code_sets:
        return []

    shared = code_sets[0]
    for others in code_sets[1:]:
        shared = shared & others
    return sorted(shared)


def _code_selected_mask(var: dict[str, Any], code: str, df: pd.DataFrame) -> pd.Series:
    kind = var.get("kind")
    index = df.index

    if kind == "multi":
        col = _column_for_subquestion_code(var, code, df)
        if col and col in df.columns:
            return df[col].map(_is_checkbox_yes).fillna(False)
        return pd.Series(False, index=index)

    col = find_variable_column(var, df)
    if not col or col not in df.columns:
        return pd.Series(False, index=index)

    if kind == "single":
        return df[col].astype(str).str.strip() == str(code)

    return df[col].astype(str).str.strip() == str(code)


def _column_for_subquestion_code(var: dict[str, Any], code: str, df: pd.DataFrame) -> str | None:
    for sq in var.get("subquestions") or []:
        if str(sq.get("code", "")) == str(code):
            col = sq.get("column")
            if col and col in df.columns:
                return str(col)
    base = str(var.get("code") or "")
    candidates = [
        f"{base}_{code}",
        f"{base}#{code}",
        f"{base}{code}",
    ]
    for candidate in candidates:
        if candidate in df.columns:
            return candidate
    for col in df.columns:
        if str(col).endswith(f"_{code}") or str(col).endswith(f"#{code}"):
            if base and str(col).startswith(base):
                return str(col)
    return None


def _is_checkbox_yes(value: Any) -> bool:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return False
    return str(value).strip().lower() in _CHECKBOX_YES


def _custom_to_schema_var(
    cv: CustomVariable,
    columns: list[str],
    series_by_col: dict[str, pd.Series],
) -> dict[str, Any]:
    if cv.variable_type == "combine":
        subquestions = []
        for code in cv.tracked_codes or _codes_from_columns(cv, columns):
            col = custom_column_name(cv.id, code)
            if col not in columns:
                continue
            subquestions.append(
                {
                    "code": code,
                    "label": code,
                    "column": col,
                    "sort_order": len(subquestions),
                }
            )
        return {
            "id": cv.id,
            "qid": 0,
            "code": cv.code,
            "text": cv.name,
            "ls_type": "custom",
            "kind": "multi",
            "type_label": "Custom (combined)",
            "group_id": -1,
            "group_title": "Custom variables",
            "group_order": 9999,
            "question_order": 0,
            "columns": columns,
            "answer_options": [],
            "subquestions": subquestions,
            "metrics": ["distribution"],
            "can_banner": True,
            "can_filter": True,
            "custom": True,
            "source_variable_ids": cv.source_variable_ids,
        }

    if cv.variable_type == "net_score":
        return {
            "id": cv.id,
            "qid": 0,
            "code": cv.code,
            "text": cv.name,
            "ls_type": "custom",
            "kind": "numeric",
            "type_label": "Custom (net score)",
            "group_id": -1,
            "group_title": "Custom variables",
            "group_order": 9999,
            "question_order": 0,
            "columns": columns,
            "answer_options": [],
            "subquestions": [],
            "metrics": ["mean", "distribution"],
            "can_banner": True,
            "can_filter": True,
            "custom": True,
            "source_variable_id": cv.source_variable_id,
        }

    labels = [c.label for c in cv.categories]
    if cv.include_unmapped and cv.unmapped_label not in labels:
        labels.append(cv.unmapped_label)
    answer_options = [{"code": lbl, "label": lbl, "sort_order": i} for i, lbl in enumerate(labels)]

    return {
        "id": cv.id,
        "qid": 0,
        "code": cv.code,
        "text": cv.name,
        "ls_type": "custom",
        "kind": "single",
        "type_label": "Custom (recode)",
        "group_id": -1,
        "group_title": "Custom variables",
        "group_order": 9999,
        "question_order": 0,
        "columns": columns,
        "answer_options": answer_options,
        "subquestions": [],
        "metrics": ["distribution"],
        "can_banner": True,
        "can_filter": True,
        "custom": True,
        "source_variable_id": cv.source_variable_id,
    }


def _codes_from_columns(cv: CustomVariable, columns: list[str]) -> list[str]:
    prefix = f"_cv_{cv.id}_"
    return [col.replace(prefix, "") for col in columns if col.startswith(prefix)]
