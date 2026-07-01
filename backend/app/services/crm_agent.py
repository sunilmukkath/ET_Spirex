"""CRM / marketing agent — client follow-ups, pipeline nudges, outreach suggestions."""

from __future__ import annotations

import json
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.db.models import Client, MarketingActivity, Project, Proposal
from app.models.pm import AgentBriefResponse
from app.services.ai_narrative import ai_status, complete_custom

CRM_SYSTEM = """You are Elastic Tree's CRM and marketing agent for B2B research clients.
Rules:
- Use ONLY data in the JSON context.
- British English, relationship-focused but professional.
- Return plain text sections: SUMMARY, ACTIONS (• bullets), RISKS (⚠ bullets).
- Suggest concrete follow-ups: proposals, nurture, event invites, check-ins."""


def run_crm_agent(
    session: Session,
    *,
    project_id: UUID | None = None,
    client_id: UUID | None = None,
    extra_context: str | None = None,
) -> AgentBriefResponse:
    ctx = _build_context(session, project_id=project_id, client_id=client_id, extra=extra_context)
    if not ctx:
        return AgentBriefResponse(
            agent="crm",
            configured=False,
            summary="No client or project context found.",
            actions=[],
            risks=[],
        )

    if ai_status().get("configured"):
        text = complete_custom(
            f"Advise on CRM/marketing next steps:\n\n```json\n{json.dumps(ctx, default=str, indent=2)}\n```",
            system=CRM_SYSTEM,
            max_tokens=600,
        )
        if text:
            from app.services.finance_agent import _parse_agent_text

            return _parse_agent_text("crm", True, text)

    return _heuristic_crm(ctx)


def _build_context(
    session: Session,
    *,
    project_id: UUID | None,
    client_id: UUID | None,
    extra: str | None,
) -> dict[str, Any] | None:
    client: Client | None = None
    project: Project | None = None
    if project_id:
        project = session.scalar(
            select(Project).options(joinedload(Project.client)).where(Project.project_id == project_id)
        )
        if project and project.client:
            client = project.client
    elif client_id:
        client = session.get(Client, client_id)

    if not client and not project:
        return None

    proposals: list[dict[str, Any]] = []
    if project:
        for p in session.scalars(select(Proposal).where(Proposal.project_id == project.project_id)).all():
            proposals.append({"version": p.version, "status": p.status, "sample_size": p.sample_size})

    activities = []
    stmt = select(MarketingActivity).order_by(MarketingActivity.due_date.asc().nullslast()).limit(8)
    if client_id or (client and client.client_id):
        cid = client_id or client.client_id
        stmt = stmt.where(MarketingActivity.client_id == cid)
    for act in session.scalars(stmt).all():
        activities.append(
            {"title": act.title, "type": act.activity_type, "status": act.status, "due_date": str(act.due_date)}
        )

    return {
        "client_name": client.client_name if client else None,
        "sector": client.sector if client else None,
        "repeat_client": client.repeat_client if client else None,
        "contact_person": client.contact_person if client else None,
        "project_name": project.project_name if project else None,
        "stage": project.stage if project else None,
        "has_survey_link": bool(project and project.limesurvey_survey_id),
        "proposals": proposals,
        "marketing_activities": activities,
        "additional_context": extra,
    }


def _heuristic_crm(ctx: dict[str, Any]) -> AgentBriefResponse:
    actions: list[str] = []
    risks: list[str] = []
    name = ctx.get("client_name") or ctx.get("project_name") or "Client"
    stage = ctx.get("stage")
    proposals = ctx.get("proposals") or []

    if stage == "Proposal" and not proposals:
        actions.append("Draft v1 proposal with methodology, sample, and budget breakdown.")
    elif proposals and proposals[-1].get("status") == "sent":
        actions.append("Schedule proposal follow-up call within 5 business days.")
    if stage in ("Close-out", "Delivered") and ctx.get("repeat_client"):
        actions.append("Send thank-you note and ask about tracking / next wave.")
    if not ctx.get("marketing_activities"):
        actions.append("Log a nurture activity (newsletter, insight share, or event invite).")
    if stage == "Deployment Prep" and not ctx.get("has_survey_link"):
        risks.append("Project in deployment prep without LimeSurvey link — assign survey to project.")

    summary = f"{name}"
    if stage:
        summary += f" is at stage {stage}."
    else:
        summary += " — review relationship touchpoints."

    return AgentBriefResponse(
        agent="crm",
        configured=bool(ai_status().get("configured")),
        summary=summary,
        actions=actions,
        risks=risks,
    )
