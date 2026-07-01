"""Survey logic static analysis."""

from __future__ import annotations

import re
from typing import Any

from app.models.et_survey import EtSurveyDefinition
from app.services.survey_logic.expression_engine import ExpressionError, evaluate_expression

_RESERVED = frozenset(
    {"if", "sum", "count", "rand", "array_filter", "and", "or", "not", "true", "false"}
)
_IDENT_RE = re.compile(r"\b([a-zA-Z_][a-zA-Z0-9_]*)\b")
_EXPR_IN_TEXT_RE = re.compile(r"\{([^{}]+)\}")


def _all_questions(defn: EtSurveyDefinition) -> list[Any]:
    blocks = sorted(defn.blocks, key=lambda b: b.sort_order)
    out = []
    for block in blocks:
        out.extend(sorted(block.questions, key=lambda q: q.sort_order))
    return out


def _extract_ids(expr: str) -> list[str]:
    return [m for m in _IDENT_RE.findall(expr) if m not in _RESERVED]


def _collect_expressions(defn: EtSurveyDefinition) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for block in sorted(defn.blocks, key=lambda b: b.sort_order):
        if block.relevance_equation:
            rows.append({"qcode": block.title or block.id, "field": "block.relevance_equation", "expr": block.relevance_equation})
        for q in sorted(block.questions, key=lambda x: x.sort_order):
            if q.relevance_equation:
                rows.append({"qcode": q.code, "field": "relevance_equation", "expr": q.relevance_equation})
            if q.validation_equation:
                rows.append({"qcode": q.code, "field": "validation_equation", "expr": q.validation_equation})
            if q.equation:
                rows.append({"qcode": q.code, "field": "equation", "expr": q.equation})
            for m in _EXPR_IN_TEXT_RE.finditer(q.text):
                rows.append({"qcode": q.code, "field": "text", "expr": m.group(1).strip()})
    for quota in defn.quotas or []:
        if quota.expression:
            rows.append({"qcode": quota.id, "field": "quota.expression", "expr": quota.expression})
    return rows


def validate_survey_logic(defn: EtSurveyDefinition) -> dict[str, Any]:
    diagnostics: list[dict[str, Any]] = []
    questions = _all_questions(defn)
    codes = {q.code: q for q in questions}
    order = {q.code: i for i, q in enumerate(questions)}

    for row in _collect_expressions(defn):
        try:
            evaluate_expression(row["expr"], {k: "" for k in codes})
        except ExpressionError as exc:
            diagnostics.append(
                {
                    "severity": "error",
                    "qcode": row["qcode"],
                    "field": row["field"],
                    "expression": row["expr"],
                    "message": str(exc),
                }
            )
            continue
        for ref in _extract_ids(row["expr"]):
            if ref not in codes:
                diagnostics.append(
                    {
                        "severity": "error",
                        "qcode": row["qcode"],
                        "field": row["field"],
                        "expression": row["expr"],
                        "message": f"Unknown Qcode '{ref}'",
                    }
                )
            elif order.get(ref, 0) > order.get(row["qcode"], 0):
                diagnostics.append(
                    {
                        "severity": "future_ref",
                        "qcode": row["qcode"],
                        "field": row["field"],
                        "expression": row["expr"],
                        "message": f"Reference to '{ref}' which appears on a later page",
                    }
                )

    seen: set[str] = set()
    for q in questions:
        if q.code in seen:
            diagnostics.append({"severity": "error", "qcode": q.code, "field": "code", "message": f"Duplicate Qcode '{q.code}'"})
        seen.add(q.code)

    return {
        "diagnostics": diagnostics,
        "has_errors": any(d["severity"] == "error" for d in diagnostics),
        "has_future_refs": any(d["severity"] == "future_ref" for d in diagnostics),
    }
