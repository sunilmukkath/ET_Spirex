"""Build analysis-compatible schema from ET native survey definitions."""

from __future__ import annotations

from typing import Any

from app.models.et_survey import EtQuestion, EtSurveyDefinition
from app.services.et_survey_store import get_et_survey
from app.services.question_types import get_type_info

_ET_TYPE_MAP: dict[str, str] = {
    "display": "X",
    "single": "L",
    "dropdown": "L",
    "multi": "M",
    "text": "S",
    "long_text": "T",
    "numeric": "N",
    "email": "S",
    "date": "S",
    "scale": "5",
    "matrix": "F",
    "array_carousel": "F",
    "ranking": "R",
    "yes_no": "Y",
}


def _question_to_variable(
    question: EtQuestion,
    *,
    qid: int,
    group_id: int,
    group_title: str,
    group_order: int,
) -> dict[str, Any]:
    ls_type = _ET_TYPE_MAP.get(question.type, "L")
    info = get_type_info(ls_type)
    columns = [question.code]
    answer_options = [
        {"code": o.code, "label": o.label, "sort_order": o.sort_order}
        for o in sorted(question.options, key=lambda x: x.sort_order)
    ]
    subquestions: list[dict[str, Any]] = []

    if question.type in ("matrix", "array_carousel"):
        columns = [f"{question.code}_{row.code}" for row in question.rows]
        subquestions = [
            {
                "code": row.code,
                "label": row.label,
                "column": f"{question.code}_{row.code}",
                "sort_order": row.sort_order,
            }
            for row in sorted(question.rows, key=lambda x: x.sort_order)
        ]
        if not answer_options and question.scale_max >= question.scale_min:
            answer_options = [
                {
                    "code": str(v),
                    "label": str(v),
                    "sort_order": i,
                }
                for i, v in enumerate(range(question.scale_min, question.scale_max + 1))
            ]
    elif question.type == "scale" and not answer_options:
        answer_options = [
            {
                "code": str(v),
                "label": str(v),
                "sort_order": i,
            }
            for i, v in enumerate(range(question.scale_min, question.scale_max + 1))
        ]
    elif question.type == "yes_no" and not answer_options:
        answer_options = [
            {"code": "Y", "label": "Yes", "sort_order": 0},
            {"code": "N", "label": "No", "sort_order": 1},
        ]

    return {
        "id": question.id,
        "qid": qid,
        "code": question.code,
        "text": question.text,
        "ls_type": ls_type,
        "kind": info.kind,
        "type_label": f"ET {question.type.replace('_', ' ').title()}",
        "group_id": group_id,
        "group_title": group_title,
        "group_order": group_order,
        "question_order": question.sort_order,
        "columns": columns,
        "answer_options": answer_options,
        "subquestions": subquestions,
        "metrics": list(info.metrics),
        "can_banner": info.can_banner and question.type != "display",
        "can_filter": info.can_filter and question.type != "display",
        "parent_qid": 0,
        "lat_column": "",
        "lng_column": "",
        "et_type": question.type,
        "required": question.required,
        "show_if": question.show_if.model_dump() if question.show_if else None,
    }


def build_et_survey_schema(workspace_id: int, *, response_count: int = 0) -> dict[str, Any]:
    survey = get_et_survey(workspace_id)
    if not survey:
        return {
            "survey_id": workspace_id,
            "provider": "et",
            "response_count": 0,
            "question_count": 0,
            "enriched": True,
            "variables": [],
            "groups": [],
            "error": "ET survey not found",
        }

    definition = survey.definition
    variables: list[dict[str, Any]] = []
    groups: list[dict[str, Any]] = []
    qid = 1

    for block in sorted(definition.blocks, key=lambda b: b.sort_order):
        group_id = abs(hash(block.id)) % 1_000_000 or 1
        variable_ids: list[str] = []
        for question in sorted(block.questions, key=lambda q: q.sort_order):
            if question.type == "display":
                qid += 1
                continue
            var = _question_to_variable(
                question,
                qid=qid,
                group_id=group_id,
                group_title=block.title,
                group_order=block.sort_order,
            )
            variables.append(var)
            variable_ids.append(question.id)
            qid += 1
        groups.append(
            {
                "id": group_id,
                "title": block.title,
                "order": block.sort_order,
                "variable_ids": variable_ids,
            }
        )

    return {
        "survey_id": workspace_id,
        "provider": "et",
        "title": survey.title,
        "response_count": response_count or survey.response_count,
        "question_count": len(variables),
        "enriched": True,
        "variables": variables,
        "groups": groups,
    }
