"""Create PM pipeline projects from Gmail proposal / brief emails."""

from __future__ import annotations

import time
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Client
from app.db.session import database_enabled, session_scope
from app.models.gmail import (
    CreatePipelineFromEmailRequest,
    CreatePipelineFromEmailResponse,
    CreateTaskFromEmailItem,
    CreateTaskFromEmailRequest,
)
from app.models.pm import ClientCreate, PmProjectCreate, ProposalCreate
from app.models.project_requirements import ProjectRequirements
from app.services import gmail_store, pm_ops_store, pm_store
from app.services.auth import VALID_USERS
from app.services.gmail_proposal import default_proposal_tasks, suggest_client_name
from app.services.gmail_suggest import suggest_assignee
from app.services.gmail_tasks import _resolve_message, create_task_from_email, gmail_message_url


def _normalize_team_member(name: str | None, fallback: str) -> str:
    if not name:
        return fallback
    clean = name.strip()
    for valid in VALID_USERS:
        if valid.lower() == clean.lower():
            return valid
    return fallback


def _find_or_create_client(session: Session, client_name: str, message: dict[str, Any]) -> UUID | None:
    clean = client_name.strip()
    if not clean:
        return None
    row = session.scalar(select(Client).where(Client.client_name.ilike(clean)).limit(1))
    if row:
        return row.client_id
    created = pm_ops_store.create_client(
        session,
        ClientCreate(
            client_name=clean,
            contact_person=str(message.get("from_name") or "").strip() or None,
            contact_email=str(message.get("from_email") or "").strip() or None,
        ),
    )
    return created.client_id


def _requirements_from_message(message: dict[str, Any], *, updated_by: str) -> ProjectRequirements:
    subject = str(message.get("subject") or "").strip()
    body = str(message.get("body_text") or message.get("snippet") or "").strip()
    summary = body[:4000] if body else subject
    return ProjectRequirements(
        summary=summary,
        objectives="",
        methodology="",
        sample_design="",
        deliverables="",
        timeline="",
        constraints="",
        updated_at=time.time(),
        updated_by=updated_by,
    )


def create_pipeline_from_email(
    username: str,
    message_id: str,
    body: CreatePipelineFromEmailRequest,
) -> CreatePipelineFromEmailResponse:
    if not database_enabled():
        raise ValueError("Operations database is required to create a pipeline project.")

    project_name = body.project_name.strip()
    if not project_name:
        raise ValueError("Project name is required.")

    message = _resolve_message(username, message_id, with_body=True)
    owner_name = _normalize_team_member(
        body.owner_name or suggest_assignee(message) or username,
        username,
    )
    client_name = (body.client_name or suggest_client_name(message)).strip() or None

    proposal_id: str | None = None
    tasks_created = 0

    with session_scope() as session:
        client_id = _find_or_create_client(session, client_name or "", message) if client_name else None

        project = pm_store.create_project(
            session,
            PmProjectCreate(
                project_name=project_name,
                client_id=client_id,
                project_type=body.project_type,
                engagement_type=body.engagement_type,
                stage="Proposal",
                owner_name=owner_name,
                status_notes=f"Created from Gmail message {message_id}",
                requirements=_requirements_from_message(message, updated_by=username),
            ),
        )

        proposal = pm_ops_store.create_proposal(
            session,
            ProposalCreate(project_id=UUID(str(project.project_id)), status="draft"),
        )
        if proposal:
            proposal_id = str(proposal.proposal_id)

        gmail_store.link_message_to_pm_project(message_id, project.project_id, username)

    task_items: list[CreateTaskFromEmailItem] = list(body.tasks)
    if body.create_tasks and not task_items:
        task_items = [
            CreateTaskFromEmailItem(
                title=str(item["title"]),
                note=str(item.get("note") or ""),
                category=item.get("category"),  # type: ignore[arg-type]
                assignee=_normalize_team_member(item.get("assignee"), owner_name),
                priority=item.get("priority"),  # type: ignore[arg-type]
                billable=bool(item.get("billable", True)),
            )
            for item in default_proposal_tasks(owner_name)
        ]

    if body.create_tasks:
        for item in task_items:
            create_task_from_email(
                username,
                message_id,
                CreateTaskFromEmailRequest(
                    title=item.title,
                    note=item.note,
                    category=item.category,
                    assignee=_normalize_team_member(item.assignee, owner_name),
                    priority=item.priority,
                    billable=item.billable,
                    project_id=UUID(str(project.project_id)),
                    survey_id=item.survey_id,
                ),
            )
            tasks_created += 1

    return CreatePipelineFromEmailResponse(
        project_id=str(project.project_id),
        project_name=project.project_name,
        client_name=client_name,
        owner_name=owner_name,
        assignee=owner_name,
        proposal_id=proposal_id,
        tasks_created=tasks_created,
        operations_url="/operations?tab=pipeline",
        email_url=gmail_message_url(message_id),
    )
