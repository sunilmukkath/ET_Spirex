"""Persist ET Scout native surveys."""

from __future__ import annotations

import re
import secrets
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import EtSurvey, EtSurveyResponse
from app.db.session import database_enabled, session_scope
from app.models.et_survey import (
    EtCollectorSurvey,
    EtResponseSubmit,
    EtResponseSubmitResult,
    EtSurveyCreate,
    EtSurveyDefinition,
    EtSurveyListItem,
    EtSurveyOut,
    EtSurveyUpdate,
)
from app.services.et_survey_registry import ET_SURVEY_ID_MIN

_SLUG_RE = re.compile(r"[^a-z0-9]+")


def _utc_iso(dt: datetime | None) -> str:
    if dt is None:
        return ""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


def _slugify(title: str) -> str:
    base = _SLUG_RE.sub("-", title.strip().lower()).strip("-")[:40] or "survey"
    return f"{base}-{secrets.token_hex(3)}"


def _next_workspace_id(session: Session) -> int:
    current = session.scalar(select(func.max(EtSurvey.workspace_id))) or (ET_SURVEY_ID_MIN - 1)
    return max(int(current) + 1, ET_SURVEY_ID_MIN)


def _definition_from_raw(raw: dict[str, Any] | None) -> EtSurveyDefinition:
    if not raw:
        return EtSurveyDefinition()
    return EtSurveyDefinition.model_validate(raw)


def _default_definition(title: str) -> EtSurveyDefinition:
    return EtSurveyDefinition(
        version=1,
        blocks=[
            {
                "id": "block_intro",
                "title": "Introduction",
                "description": "",
                "sort_order": 0,
                "questions": [
                    {
                        "id": "q_welcome",
                        "code": "INFO",
                        "type": "display",
                        "text": f"Welcome to {title}. Please answer honestly — your responses are confidential.",
                        "required": False,
                        "sort_order": 0,
                    }
                ],
            }
        ],
    )


def studio_available() -> bool:
    return database_enabled()


def list_et_surveys() -> list[EtSurveyListItem]:
    if not studio_available():
        return []
    with session_scope() as session:
        rows = session.scalars(select(EtSurvey).order_by(EtSurvey.updated_at.desc())).all()
        counts = dict(
            session.execute(
                select(EtSurveyResponse.workspace_id, func.count())
                .where(EtSurveyResponse.complete.is_(True))
                .group_by(EtSurveyResponse.workspace_id)
            ).all()
        )
        return [
            EtSurveyListItem(
                workspace_id=row.workspace_id,
                title=row.title,
                description=row.description or "",
                status=row.status,  # type: ignore[arg-type]
                language=row.language,
                public_slug=row.public_slug,
                created_by=row.created_by,
                updated_at=_utc_iso(row.updated_at),
                response_count=int(counts.get(row.workspace_id, 0)),
                active=row.status == "active",
            )
            for row in rows
        ]


def get_et_survey(workspace_id: int) -> EtSurveyOut | None:
    if not studio_available():
        return None
    with session_scope() as session:
        row = session.get(EtSurvey, workspace_id)
        if not row:
            return None
        complete_count = session.scalar(
            select(func.count())
            .select_from(EtSurveyResponse)
            .where(
                EtSurveyResponse.workspace_id == workspace_id,
                EtSurveyResponse.complete.is_(True),
            )
        )
        return _to_out(row, int(complete_count or 0))


def get_et_survey_by_slug(slug: str) -> EtSurvey | None:
    if not studio_available():
        return None
    with session_scope() as session:
        return session.scalar(select(EtSurvey).where(EtSurvey.public_slug == slug))


def create_et_survey(body: EtSurveyCreate, *, created_by: str) -> EtSurveyOut:
    if not studio_available():
        raise RuntimeError("Survey Studio requires DATABASE_URL (Postgres) on the server.")
    definition = _default_definition(body.title)
    with session_scope() as session:
        workspace_id = _next_workspace_id(session)
        now = datetime.now(timezone.utc)
        row = EtSurvey(
            workspace_id=workspace_id,
            title=body.title.strip(),
            description=body.description.strip(),
            status="draft",
            language=body.language or "en",
            public_slug=_slugify(body.title),
            definition=definition.model_dump(),
            version=definition.version,
            created_by=created_by,
            created_at=now,
            updated_at=now,
        )
        session.add(row)
        session.flush()
        return _to_out(row, 0)


def update_et_survey(workspace_id: int, body: EtSurveyUpdate) -> EtSurveyOut | None:
    if not studio_available():
        raise RuntimeError("Survey Studio requires DATABASE_URL.")
    with session_scope() as session:
        row = session.get(EtSurvey, workspace_id)
        if not row:
            return None
        if body.title is not None:
            row.title = body.title.strip()
        if body.description is not None:
            row.description = body.description.strip()
        if body.language is not None:
            row.language = body.language
        if body.status is not None:
            row.status = body.status
        if body.definition is not None:
            row.definition = body.definition.model_dump()
            row.version = body.definition.version
        row.updated_at = datetime.now(timezone.utc)
        complete_count = session.scalar(
            select(func.count())
            .select_from(EtSurveyResponse)
            .where(
                EtSurveyResponse.workspace_id == workspace_id,
                EtSurveyResponse.complete.is_(True),
            )
        )
        return _to_out(row, int(complete_count or 0))


def delete_et_survey(workspace_id: int) -> bool:
    if not studio_available():
        return False
    with session_scope() as session:
        row = session.get(EtSurvey, workspace_id)
        if not row:
            return False
        session.delete(row)
        return True


def collector_payload(survey: EtSurvey) -> EtCollectorSurvey:
    return EtCollectorSurvey(
        title=survey.title,
        description=survey.description or "",
        status=survey.status,  # type: ignore[arg-type]
        definition=_definition_from_raw(survey.definition),
        public_slug=survey.public_slug,
    )


def submit_response(slug: str, body: EtResponseSubmit) -> EtResponseSubmitResult | None:
    if not studio_available():
        return None
    now = datetime.now(timezone.utc)
    with session_scope() as session:
        survey = session.scalar(select(EtSurvey).where(EtSurvey.public_slug == slug))
        if not survey or survey.status != "active":
            return None
        row = EtSurveyResponse(
            workspace_id=survey.workspace_id,
            answers=body.answers,
            complete=body.complete,
            started_at=now,
            submitted_at=now if body.complete else None,
        )
        session.add(row)
        session.flush()
        return EtResponseSubmitResult(response_id=str(row.response_id), complete=body.complete)


def _to_out(row: EtSurvey, response_count: int) -> EtSurveyOut:
    return EtSurveyOut(
        workspace_id=row.workspace_id,
        title=row.title,
        description=row.description or "",
        status=row.status,  # type: ignore[arg-type]
        language=row.language,
        public_slug=row.public_slug,
        definition=_definition_from_raw(row.definition),
        version=row.version,
        created_by=row.created_by,
        created_at=_utc_iso(row.created_at),
        updated_at=_utc_iso(row.updated_at),
        response_count=response_count,
    )


def et_survey_exists(workspace_id: int) -> bool:
    if not studio_available():
        return False
    with session_scope() as session:
        return session.get(EtSurvey, workspace_id) is not None
