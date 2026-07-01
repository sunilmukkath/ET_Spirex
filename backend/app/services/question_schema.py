from __future__ import annotations

import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any

from app.config import settings

from app.lime_client import execute_lime
from app.services.answer_labels import builtin_scale_options
from app.services.location_detect import apply_location_kind
from app.services.question_types import (
    AnswerOption,
    SubQuestion,
    SurveyVariable,
    get_type_info,
)
from app.services.survey_text import clean_survey_text

_SCHEMA_CACHE: dict[tuple[int, str, bool], tuple[float, dict[str, Any]]] = {}
_SCHEMA_TTL = 600
_ENRICH_KINDS = frozenset({"single", "multi", "array", "numeric", "rank"})


def _strip_html(text: str) -> str:
    return clean_survey_text(text)


def _parse_options(raw: Any) -> list[AnswerOption]:
    if raw is None or isinstance(raw, str):
        return []
    if not isinstance(raw, dict):
        return []
    options: list[AnswerOption] = []
    for code, item in raw.items():
        if isinstance(item, dict):
            label = _strip_html(str(item.get("answer") or item.get("question") or code))
            order = int(item.get("sortorder") or 0)
        else:
            label = _strip_html(str(item))
            order = 0
        options.append(AnswerOption(code=str(code), label=label, sort_order=order))
    options.sort(key=lambda o: (o.sort_order, _natural_sort_key(o.code)))
    return options


def _natural_sort_key(value: str) -> tuple[int, str]:
    if value.isdigit():
        return (0, int(value))
    return (1, value)


def _builtin_answer_options(ls_type: str) -> list[AnswerOption]:
    presets: dict[str, list[tuple[str, str]]] = {
        "Y": [("Y", "Yes"), ("N", "No")],
        "G": [("M", "Male"), ("F", "Female"), ("U", "Uncertain"), ("O", "Other")],
        "5": builtin_scale_options("5") or [(str(i), str(i)) for i in range(1, 6)],
        "A": builtin_scale_options("A") or [(str(i), str(i)) for i in range(1, 6)],
        "B": builtin_scale_options("B") or [(str(i), str(i)) for i in range(1, 11)],
    }
    return [
        AnswerOption(code=code, label=label, sort_order=i)
        for i, (code, label) in enumerate(presets.get(ls_type, []))
    ]


def _extract_answer_options(props: dict[str, Any], ls_type: str) -> list[AnswerOption]:
    for key in ("answeroptions", "available_answers", "answers"):
        options = _parse_options(props.get(key))
        if options:
            return options
    return _builtin_answer_options(ls_type)


def _parse_subquestions(raw: Any, title: str, df_columns: list[str]) -> list[SubQuestion]:
    if not isinstance(raw, dict):
        return []
    subs: list[SubQuestion] = []
    for key, item in raw.items():
        if isinstance(item, dict):
            sq_code = str(item.get("title") or key)
            label = _strip_html(str(item.get("question") or sq_code))
            order = int(item.get("sortorder") or 0)
        else:
            sq_code = str(key)
            label = _strip_html(str(item))
            order = 0
        column = _resolve_column(title, sq_code, df_columns)
        subs.append(
            SubQuestion(code=sq_code, label=label, column=column, sort_order=order)
        )
    subs.sort(key=lambda s: (s.sort_order, _natural_sort_key(s.code)))
    return subs


def _resolve_column(title: str, suffix: str, df_columns: list[str]) -> str:
    candidates = [f"{title}_{suffix}", f"{title}{suffix}", suffix, title]
    for candidate in candidates:
        if candidate in df_columns:
            return candidate
    for col in df_columns:
        if col.startswith(title) and suffix in col:
            return col
    return candidates[0]


def _resolve_variable_columns(
    ls_type: str,
    title: str,
    subquestions: list[SubQuestion],
    df_columns: list[str],
) -> list[str]:
    info = get_type_info(ls_type)
    if info.kind in ("multi", "array") and subquestions:
        return [sq.column for sq in subquestions if sq.column in df_columns]
    if info.kind == "numeric" and ls_type == "K" and subquestions:
        return [sq.column for sq in subquestions if sq.column in df_columns]
    if title in df_columns:
        return [title]
    matches = [
        c for c in df_columns
        if c == title or c.startswith(f"{title}_") or c.startswith(title)
    ]
    return matches or [title]


def _list_group_questions(survey_id: int, gid: int) -> list[dict[str, Any]]:
    """List questions in a group using a dedicated client (safe for parallel RPC)."""
    from citric import Client

    client = Client(
        settings.limesurvey_url,
        settings.limesurvey_username,
        settings.limesurvey_password,
    )
    return client.list_questions(survey_id, gid)


def _fetch_question_props(qid: int) -> dict[str, Any]:
    def load_props(client) -> dict[str, Any]:
        return dict(
            client.get_question_properties(
                qid,
                settings=["answeroptions", "available_answers", "subquestions", "type", "title"],
            )
        )

    return execute_lime(load_props)


def _response_count(survey_id: int) -> int:
    try:
        def load_count(client) -> int:
            summary = client.get_summary(survey_id) or {}
            return int(summary.get("count_total") or 0)

        return execute_lime(load_count)
    except Exception:
        return 0


def _response_count_from_summary(survey_id: int, completion_status: str) -> int:
    """Fast counts from Lime summary — no full response export (used for light schema)."""
    from app.services.qc_filter import QC_APPROVED_STATUS

    def load_summary(client) -> dict[str, Any]:
        return client.get_summary(survey_id) or {}

    try:
        summary = execute_lime(load_summary)
        completed = int(summary.get("completed_responses") or 0)
        incomplete = int(summary.get("incomplete_responses") or 0)
        total = int(summary.get("count_total") or 0) or (completed + incomplete)
        if completion_status == "complete":
            return completed
        if completion_status == "incomplete":
            return incomplete
        if completion_status == "all":
            return total
        if completion_status == QC_APPROVED_STATUS:
            return completed
        return completed
    except Exception:
        return _response_count(survey_id)


def _response_count_for_status(survey_id: int, completion_status: str, *, light: bool = False) -> int:
    if light:
        return _response_count_from_summary(survey_id, completion_status)
    try:
        from app.services.qc_filter import QC_APPROVED_STATUS, qc_approved_response_count
        from app.services.response_store import get_responses

        if completion_status == QC_APPROVED_STATUS:
            return qc_approved_response_count(survey_id)
        return len(get_responses(survey_id, completion_status=completion_status).dataframe)
    except Exception:
        return _response_count(survey_id)


def _variable_to_dict(v: SurveyVariable) -> dict[str, Any]:
    return {
        "id": v.id,
        "qid": v.qid,
        "code": v.code,
        "text": v.text,
        "ls_type": v.ls_type,
        "kind": v.kind,
        "type_label": v.type_label,
        "group_id": v.group_id,
        "group_title": v.group_title,
        "group_order": v.group_order,
        "question_order": v.question_order,
        "columns": v.columns,
        "answer_options": [
            {"code": o.code, "label": o.label, "sort_order": o.sort_order}
            for o in v.answer_options
        ],
        "subquestions": [
            {
                "code": s.code,
                "label": s.label,
                "column": s.column,
                "sort_order": s.sort_order,
            }
            for s in v.subquestions
        ],
        "metrics": v.metrics,
        "can_banner": v.can_banner,
        "can_filter": v.can_filter,
        "lat_column": v.lat_column,
        "lng_column": v.lng_column,
    }


def build_survey_schema(
    survey_id: int,
    *,
    completion_status: str = "complete",
    light: bool = False,
    enrich_only: bool = False,
) -> dict[str, Any]:
    """Build survey schema. enrich_only loads answer options without exporting all responses."""
    from app.services.et_survey_registry import is_et_survey
    from app.services.et_survey_schema import build_et_survey_schema

    if is_et_survey(survey_id):
        return build_et_survey_schema(survey_id)

    effective_light = light and not enrich_only
    cache_key = (survey_id, completion_status, effective_light, enrich_only)
    now = time.time()
    if cache_key in _SCHEMA_CACHE:
        cached_at, data = _SCHEMA_CACHE[cache_key]
        if now - cached_at < _SCHEMA_TTL:
            return _finalize_schema(
                survey_id,
                data,
                completion_status=completion_status,
                light=effective_light,
            )

    def build_from_lime(client) -> dict[str, Any]:
        groups = client.list_groups(survey_id)
        groups_sorted = sorted(groups, key=lambda g: int(g.get("group_order") or 0))
        response_count = _response_count_for_status(survey_id, completion_status, light=light)

        questions_by_gid: dict[int, list[dict[str, Any]]] = {}
        if groups_sorted:
            workers = min(8, len(groups_sorted))
            with ThreadPoolExecutor(max_workers=workers) as pool:
                futures = {
                    pool.submit(_list_group_questions, survey_id, int(g["gid"])): int(g["gid"])
                    for g in groups_sorted
                }
                for future in as_completed(futures):
                    gid = futures[future]
                    try:
                        questions_by_gid[gid] = future.result()
                    except Exception:
                        questions_by_gid[gid] = []

        variables: list[SurveyVariable] = []
        group_summaries: list[dict[str, Any]] = []
        enrich_queue: list[tuple[SurveyVariable, int]] = []

        for group in groups_sorted:
            gid = int(group["gid"])
            group_title = _strip_html(str(group.get("group_name", "")))
            group_order = int(group.get("group_order") or 0)
            questions = questions_by_gid.get(gid, [])
            questions_sorted = sorted(questions, key=lambda q: int(q.get("question_order") or 0))
            group_vars: list[str] = []

            for q in questions_sorted:
                qid = int(q["qid"])
                parent_qid = int(q.get("parent_qid") or 0)
                if parent_qid > 0:
                    continue

                ls_type = str(q.get("type") or "")
                info = get_type_info(ls_type)
                if info.kind == "display":
                    continue

                title = str(q.get("title") or f"Q{qid}")
                text = _strip_html(str(q.get("question") or title))
                var_id = f"q{qid}"

                variable = SurveyVariable(
                    id=var_id,
                    qid=qid,
                    code=title,
                    text=text,
                    ls_type=ls_type,
                    kind=info.kind,
                    type_label=info.label,
                    group_id=gid,
                    group_title=group_title,
                    group_order=group_order,
                    question_order=int(q.get("question_order") or 0),
                    columns=[title],
                    metrics=list(info.metrics),
                    can_banner=info.can_banner,
                    can_filter=info.can_filter,
                    parent_qid=parent_qid,
                )
                variables.append(variable)
                group_vars.append(var_id)

                if not effective_light and info.kind in _ENRICH_KINDS:
                    enrich_queue.append((variable, qid))

            if group_vars:
                group_summaries.append(
                    {
                        "id": gid,
                        "title": group_title,
                        "order": group_order,
                        "variable_ids": group_vars,
                    }
                )

        df_columns: list[str] = []
        if not effective_light and not enrich_only:
            try:
                from app.services.response_store import get_responses

                df_columns = list(
                    get_responses(survey_id, completion_status=completion_status).dataframe.columns
                )
            except Exception:
                pass

        if not effective_light and enrich_queue:
            _enrich_variables_parallel(enrich_queue, df_columns)

        if not effective_light and not enrich_only and df_columns:
            apply_location_kind(variables, df_columns)

        return {
            "survey_id": survey_id,
            "response_count": response_count,
            "question_count": len(variables),
            "enriched": not effective_light,
            "variables": [_variable_to_dict(v) for v in variables],
            "groups": group_summaries,
        }

    result = execute_lime(build_from_lime)
    _SCHEMA_CACHE[cache_key] = (now, result)
    return _finalize_schema(survey_id, result, completion_status=completion_status, light=effective_light)


def _finalize_schema(
    survey_id: int,
    result: dict[str, Any],
    *,
    completion_status: str,
    light: bool,
) -> dict[str, Any]:
    from app.services.variable_setup import apply_setup_to_variable_dict
    from app.services.variable_setup_store import get_variable_setup_config

    setup = get_variable_setup_config(survey_id)
    out = dict(result)
    variables = []
    for var in out.get("variables") or []:
        entry = setup.variables.get(str(var.get("id") or ""))
        variables.append(apply_setup_to_variable_dict(var, entry))
    out["variables"] = variables
    return out


def _enrich_variables_parallel(
    enrich_queue: list[tuple[SurveyVariable, int]],
    df_columns: list[str],
) -> None:
    """Fetch answer options / subquestions in parallel (one API call per question)."""
    props_by_qid: dict[int, dict[str, Any]] = {}
    workers = min(12, len(enrich_queue))

    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(_fetch_question_props, qid): qid for _, qid in enrich_queue}
        for future in as_completed(futures):
            qid = futures[future]
            try:
                props_by_qid[qid] = future.result()
            except Exception:
                props_by_qid[qid] = {}

    for variable, qid in enrich_queue:
        props = props_by_qid.get(qid, {})
        variable.answer_options = _extract_answer_options(props, variable.ls_type)
        variable.subquestions = _parse_subquestions(
            props.get("subquestions"), variable.code, df_columns
        )
        if variable.subquestions:
            variable.columns = [
                sq.column for sq in variable.subquestions if sq.column in df_columns
            ] or [sq.column for sq in variable.subquestions]
        elif props.get("title"):
            variable.columns = [str(props["title"])]


def get_variable(schema: dict[str, Any], variable_id: str) -> dict[str, Any] | None:
    for var in schema["variables"]:
        if var["id"] == variable_id:
            return var
    return None


def invalidate_schema_cache(survey_id: int | None = None) -> None:
    from app.services.analysis_context import invalidate_analysis_context

    if survey_id is None:
        _SCHEMA_CACHE.clear()
        invalidate_analysis_context(None)
        return
    keys = [k for k in _SCHEMA_CACHE if k[0] == survey_id]
    for key in keys:
        del _SCHEMA_CACHE[key]
    invalidate_analysis_context(survey_id)
