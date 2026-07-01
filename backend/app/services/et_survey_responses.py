"""ET native survey responses as analysis-ready dataframes."""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any

import pandas as pd
from sqlalchemy import select

from app.db.models import EtSurveyResponse
from app.db.session import database_enabled, session_scope
from app.services.et_survey_schema import build_et_survey_schema
from app.services.response_store import ResponseDataset

_CACHE: dict[tuple[int, str], tuple[float, ResponseDataset]] = {}
_TTL = 120


def _flatten_answers(answers: dict[str, Any], schema: dict[str, Any]) -> dict[str, Any]:
    row: dict[str, Any] = {}
    code_by_id = {v["id"]: v["code"] for v in schema.get("variables") or []}
    matrix_types = {"matrix", "array_carousel"}
    matrix_vars = {
        v["id"]: v for v in schema.get("variables") or [] if v.get("et_type") in matrix_types
    }
    gps_vars = {v["id"]: v for v in schema.get("variables") or [] if v.get("et_type") == "gps"}
    media_vars = {
        v["id"]: v for v in schema.get("variables") or [] if v.get("et_type") in ("photo", "audio")
    }

    for qid, value in answers.items():
        gps_var = gps_vars.get(qid)
        if gps_var and isinstance(value, dict):
            code = gps_var["code"]
            lat = value.get("lat")
            lng = value.get("lng")
            if lat is not None:
                row[f"{code}GPSLat"] = lat
            if lng is not None:
                row[f"{code}GPSLng"] = lng
            continue

        media_var = media_vars.get(qid)
        if media_var:
            code = media_var["code"]
            if isinstance(value, dict):
                row[code] = value.get("url") or value.get("media_id") or ""
            else:
                row[code] = value
            continue

        var = matrix_vars.get(qid)
        if var and isinstance(value, dict):
            for sub_code, sub_val in value.items():
                col = f"{var['code']}_{sub_code}"
                if isinstance(sub_val, list):
                    row[col] = ";".join(str(x) for x in sub_val)
                else:
                    row[col] = sub_val
            continue

        code = code_by_id.get(qid, qid)
        if isinstance(value, list):
            row[code] = ";".join(str(x) for x in value)
        else:
            row[code] = value
    return row


@dataclass
class _EtResponseRow:
    response_id: str
    complete: bool
    answers: dict[str, Any]
    submitted_at: str | None


def _load_rows(workspace_id: int, *, completion_status: str) -> list[_EtResponseRow]:
    if not database_enabled():
        return []
    with session_scope() as session:
        stmt = select(EtSurveyResponse).where(EtSurveyResponse.workspace_id == workspace_id)
        if completion_status == "complete":
            stmt = stmt.where(EtSurveyResponse.complete.is_(True))
        elif completion_status == "incomplete":
            stmt = stmt.where(EtSurveyResponse.complete.is_(False))
        rows = session.scalars(stmt.order_by(EtSurveyResponse.created_at)).all()
        return [
            _EtResponseRow(
                response_id=str(r.response_id),
                complete=bool(r.complete),
                answers=dict(r.answers or {}),
                submitted_at=r.submitted_at.isoformat() if r.submitted_at else None,
            )
            for r in rows
        ]


def get_et_responses(
    workspace_id: int,
    *,
    completion_status: str = "complete",
    refresh: bool = False,
) -> ResponseDataset:
    key = (workspace_id, completion_status)
    now = time.time()
    if not refresh:
        cached = _CACHE.get(key)
        if cached and now - cached[0] < _TTL:
            return cached[1]

    schema = build_et_survey_schema(workspace_id)
    raw_rows = _load_rows(workspace_id, completion_status=completion_status)

    records: list[dict[str, Any]] = []
    for item in raw_rows:
        flat = _flatten_answers(item.answers, schema)
        flat["id"] = item.response_id
        flat["submitdate"] = item.submitted_at or ""
        flat["datestamp"] = item.submitted_at or ""
        records.append(flat)

    if records:
        df = pd.DataFrame(records)
    else:
        df = pd.DataFrame(columns=["id"])

    dataset = ResponseDataset(
        dataframe=df,
        response_count=len(records),
        column_count=len(df.columns),
    )
    _CACHE[key] = (now, dataset)
    return dataset


def invalidate_et_response_cache(workspace_id: int | None = None) -> None:
    if workspace_id is None:
        _CACHE.clear()
        return
    for key in list(_CACHE):
        if key[0] == workspace_id:
            del _CACHE[key]
