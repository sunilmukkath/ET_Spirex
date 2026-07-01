"""AI topline report — short executive summary from analysis sections."""

from __future__ import annotations

import json
from typing import Any

from app.models.pm import AgentDraftResponse, AgentDraftSection
from app.models.workspace_prefs import ReportSectionInput
from app.services.agent_helpers import parse_markdown_sections
from app.services.ai_narrative import ai_status, complete_custom
from app.services.report_agent import _load_section_contexts, _survey_meta

TOPLINE_SYSTEM = """You are Elastic Tree's lead researcher writing a topline report (1–2 pages max).
Rules:
- British English, insight-led, client-ready.
- Use ONLY facts in the JSON. Never invent statistics.
- Structure with these ## sections only:
## Headlines
## Sample & method note
## Top findings
## Watch-outs
- Under Headlines: 3–5 one-line bullets (max 18 words each).
- Under Top findings: 4–6 bullets with key numbers where available.
- Keep total output under 350 words.
- Start directly with ## Headlines."""


def run_topline_agent(
    survey_id: int,
    sections: list[ReportSectionInput],
    *,
    deck_title: str = "",
    client_context: str | None = None,
) -> AgentDraftResponse:
    contexts, load_errors = _load_section_contexts(survey_id, sections)
    meta = _survey_meta(survey_id, deck_title, client_context)
    title = deck_title or meta.get("title") or f"Survey {survey_id} topline"

    if not contexts and load_errors:
        return AgentDraftResponse(
            agent="topline",
            configured=False,
            title=title,
            draft_markdown="Could not load analysis data.",
            sections=[],
            actions=load_errors,
        )

    payload = {"survey": meta, "analysis_sections": contexts}
    if client_context:
        payload["client_context"] = client_context

    if ai_status().get("configured"):
        text = complete_custom(
            f"Write a topline report:\n\n```json\n{json.dumps(payload, default=str, indent=2)}\n```",
            system=TOPLINE_SYSTEM,
            max_tokens=1200,
        )
        if text:
            parsed_title, parsed_sections = parse_markdown_sections(text)
            return AgentDraftResponse(
                agent="topline",
                configured=True,
                title=parsed_title or title,
                draft_markdown=text.strip(),
                sections=parsed_sections,
                actions=["Review numbers against tables before client send."],
            )

    bullets = [
        f"Base: {meta.get('response_count', 'n/a')} completes",
        "Configure Claude API for AI-authored topline narratives.",
    ]
    return AgentDraftResponse(
        agent="topline",
        configured=False,
        title=title,
        draft_markdown="## Headlines\n\n" + "\n".join(f"• {b}" for b in bullets),
        sections=[AgentDraftSection(heading="Headlines", body="\n".join(bullets))],
        actions=["Set ANTHROPIC_API_KEY on the server for AI toplines."],
    )
