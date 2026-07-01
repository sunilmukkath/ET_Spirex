"""Proposal writing agent — drafts client-facing research proposals from PM context."""

from __future__ import annotations

import json
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.db.models import Project, Proposal
from app.models.pm import AgentDraftResponse, AgentDraftSection
from app.models.project_requirements import requirements_from_raw, requirements_to_context
from app.services.agent_helpers import parse_markdown_sections
from app.services.ai_narrative import ai_status, complete_custom
from app.services.pm_ops_store import finance_summary
from app.services.project_workflow_store import get_project_workflow

PROPOSAL_SYSTEM = """You are Elastic Tree's senior research consultant drafting a client proposal.
Rules:
- British English, professional and confident, not salesy.
- Use ONLY facts from the JSON context. If sample size, budget, or methodology are unknown, say "to be confirmed" rather than inventing.
- Structure the proposal with these ## sections exactly:
## Executive summary
## Research objectives
## Methodology & approach
## Sample design
## Timeline & milestones
## Investment & terms
## Why Elastic Tree
- Under each heading write 2–4 short paragraphs or bullet lists as appropriate.
- Do not include a title line before the first ## — start directly with ## Executive summary."""


def run_proposal_writing_agent(
    session: Session,
    project_id: UUID,
    *,
    extra_context: str | None = None,
) -> AgentDraftResponse:
    ctx = _build_context(session, project_id, extra_context)
    if not ctx:
        return AgentDraftResponse(
            agent="proposal",
            configured=False,
            title="Proposal",
            draft_markdown="Project not found.",
            sections=[],
            actions=["Create the PM project in Operations hub first."],
        )

    title = f"Research proposal — {ctx.get('project_name', 'Project')}"
    if ai_status().get("configured"):
        text = complete_custom(
            f"Draft a client proposal:\n\n```json\n{json.dumps(ctx, default=str, indent=2)}\n```",
            system=PROPOSAL_SYSTEM,
            max_tokens=2500,
        )
        if text:
            parsed_title, sections = parse_markdown_sections(text)
            return AgentDraftResponse(
                agent="proposal",
                configured=True,
                title=parsed_title or title,
                draft_markdown=text.strip(),
                sections=sections,
                actions=_proposal_actions(ctx),
            )

    return _heuristic_proposal(ctx, title)


def _build_context(
    session: Session,
    project_id: UUID,
    extra_context: str | None,
) -> dict[str, Any] | None:
    project = session.scalar(
        select(Project).options(joinedload(Project.client)).where(Project.project_id == project_id)
    )
    if not project:
        return None

    finance = finance_summary(session, project_id)
    proposals = session.scalars(
        select(Proposal).where(Proposal.project_id == project_id).order_by(Proposal.version.desc())
    ).all()

    workflow_ctx: dict[str, Any] = {}
    pm_requirements: dict[str, str] = {}
    if project.requirements:
        pm_requirements = requirements_to_context(requirements_from_raw(project.requirements))
    if project.limesurvey_survey_id:
        try:
            wf = get_project_workflow(project.limesurvey_survey_id)
            workflow_ctx = {
                "client_name": wf.client_name,
                "project_code": wf.project_code,
                "study_type": wf.study_type,
                "phase": wf.phase,
                "target_delivery": wf.target_delivery,
                "requirements": requirements_to_context(wf.requirements),
            }
        except Exception:
            pass

    return {
        "project_name": project.project_name,
        "client_name": project.client.client_name if project.client else workflow_ctx.get("client_name"),
        "sector": project.client.sector if project.client else None,
        "contact_person": project.client.contact_person if project.client else None,
        "project_type": project.project_type,
        "engagement_type": project.engagement_type,
        "stage": project.stage,
        "budget_estimate": float(project.budget_estimate) if project.budget_estimate else None,
        "finance_lines_estimated": float(finance.total_estimated_lines) if finance and finance.total_estimated_lines else None,
        "target_close_date": str(project.target_close_date) if project.target_close_date else None,
        "prior_proposals": [
            {"version": p.version, "status": p.status, "sample_size": p.sample_size}
            for p in proposals[:3]
        ],
        "pm_requirements": pm_requirements,
        "workflow": workflow_ctx,
        "additional_brief": extra_context,
    }


def _proposal_actions(ctx: dict[str, Any]) -> list[str]:
    actions: list[str] = []
    if not ctx.get("budget_estimate"):
        actions.append("Add budget estimate on the project before sending to client.")
    if not ctx.get("prior_proposals"):
        actions.append("Save this draft as proposal v1 in Operations after client review.")
    if ctx.get("stage") == "Proposal":
        actions.append("Move stage to Budgeting once client requests costing detail.")
    return actions


def _heuristic_proposal(ctx: dict[str, Any], title: str) -> AgentDraftResponse:
    client = ctx.get("client_name") or "the client"
    ptype = ctx.get("project_type") or "quant"
    engagement = ctx.get("engagement_type") or "ad-hoc"
    budget = ctx.get("budget_estimate")
    sample = None
    for p in ctx.get("prior_proposals") or []:
        if p.get("sample_size"):
            sample = p["sample_size"]
            break

    sections = [
        AgentDraftSection(
            heading="Executive summary",
            body=(
                f"Elastic Tree proposes to support {client} with a {ptype} {engagement} study: "
                f"**{ctx.get('project_name')}**. We will deliver actionable insight aligned to your "
                "business questions using rigorous fieldwork, QC, and analysis."
            ),
        ),
        AgentDraftSection(
            heading="Research objectives",
            body=(
                "Objectives will be finalised in the kick-off workshop. Typical aims include "
                "understanding attitudes, usage, and drivers among the target audience."
                + (f"\n\nAdditional context: {ctx['additional_brief']}" if ctx.get("additional_brief") else "")
            ),
        ),
        AgentDraftSection(
            heading="Methodology & approach",
            body=(
                f"Study design: {ptype} research ({engagement}). "
                "Quant fieldwork via LimeSurvey with Elastic Tree QC standards; qual via moderated sessions where applicable."
            ),
        ),
        AgentDraftSection(
            heading="Sample design",
            body=(
                f"Target sample: **{sample or 'to be confirmed'}** completes. "
                "Quotas and screening criteria to be agreed at briefing."
            ),
        ),
        AgentDraftSection(
            heading="Timeline & milestones",
            body=(
                f"Target close: {ctx.get('target_close_date') or 'to be confirmed'}. "
                "Milestones: proposal sign-off → programming & pilot → fieldwork → analysis → delivery."
            ),
        ),
        AgentDraftSection(
            heading="Investment & terms",
            body=(
                f"Indicative investment: **{'£{:,.0f}'.format(budget) if budget else 'to be confirmed'}** (ex VAT). "
                "Payment terms: 50% on approval, 50% on delivery unless otherwise agreed."
            ),
        ),
        AgentDraftSection(
            heading="Why Elastic Tree",
            body=(
                "Integrated quant and qual capability, LimeSurvey programming expertise, "
                "and a single team from proposal through client delivery."
            ),
        ),
    ]

    draft = "\n\n".join(f"## {s.heading}\n\n{s.body}" for s in sections)
    return AgentDraftResponse(
        agent="proposal",
        configured=False,
        title=title,
        draft_markdown=draft,
        sections=sections,
        actions=_proposal_actions(ctx),
    )
