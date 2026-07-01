"""SPSS syntax + CSV export from ET survey schema."""

from __future__ import annotations

from typing import Any

from app.models.et_survey import EtQuestion, EtSurveyDefinition


def _variable_names(question: EtQuestion) -> list[str]:
    if question.type in ("matrix", "array_carousel"):
        return [f"{question.code}_{row.code}" for row in question.rows]
    if question.type == "gps":
        return [f"{question.code}GPSLat", f"{question.code}GPSLng"]
    if question.type in ("equation", "display"):
        return []
    return [question.code]


def _spss_type(question: EtQuestion) -> str:
    if question.type in ("numeric", "scale"):
        return "F8.0"
    return "A255"


def export_to_spss_syntax(
    definition: EtSurveyDefinition,
    responses: list[dict[str, Any]] | None = None,
) -> dict[str, str]:
    responses = responses or []
    columns: list[str] = []
    var_defs: list[str] = []
    var_labels: list[str] = []
    value_labels: list[str] = []

    blocks = sorted(definition.blocks, key=lambda b: b.sort_order)
    questions: list[EtQuestion] = []
    for block in blocks:
        questions.extend(sorted(block.questions, key=lambda q: q.sort_order))

    for q in questions:
        if q.type in ("display", "equation"):
            continue
        for col in _variable_names(q):
            columns.append(col)
            var_defs.append(f"  {col} {_spss_type(q)}")
            var_labels.append(f"  {col} '{q.text.replace(chr(39), chr(39)+chr(39))}'")
            if q.options:
                value_labels.append(f"VALUE LABELS {col}")
                for opt in q.options:
                    num = opt.code
                    try:
                        code = str(int(num))
                    except ValueError:
                        code = f"'{opt.code.replace(chr(39), chr(39)+chr(39))}'"
                    label = opt.label.replace("'", "''")
                    value_labels.append(f"  {code} '{label}'")
                value_labels.append(".")

    def esc(v: Any) -> str:
        s = "" if v is None else str(v)
        if "," in s or '"' in s or "\n" in s:
            return '"' + s.replace('"', '""') + '"'
        return s

    header = ",".join(["response_id", *columns])
    rows = [
        ",".join([esc(r.get("response_id", f"R{i+1}")), *[esc(r.get(c, "")) for c in columns]])
        for i, r in enumerate(responses)
    ]
    csv_data = "\n".join([header, *rows])

    spss_syntax = "\n".join(
        [
            "* ET Scout SPSS syntax — generated from survey schema.",
            f"* Survey version: {definition.version}",
            "",
            "DATA LIST FREE",
            f"  /{' '.join(columns)}." if columns else "  /.",
            "",
            "VARIABLE LABELS",
            *var_labels,
            ".",
            "",
            *var_defs,
            ".",
            "",
            *value_labels,
            "",
            "EXECUTE.",
        ]
    )
    return {"csv_data": csv_data, "spss_syntax": spss_syntax}
