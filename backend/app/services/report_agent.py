"""Report writing agent — drafts client-facing report narratives from survey analysis."""

from __future__ import annotations

import json
from typing import Any

from app.models.pm import AgentDraftResponse, AgentDraftSection
from app.models.workspace_prefs import ReportSectionInput
from app.services.agent_helpers import parse_markdown_sections
from app.services.ai_narrative import (
    ai_status,
    banner_context,
    complete_custom,
    profile_context,
)
from app.services.banner_analysis import run_banner_table, run_question_profile
from app.services.project_workflow_store import get_project_workflow

REPORT_SYSTEM = """You are Elastic Tree's lead reporting consultant writing a client research report.
Rules:
- British English, insight-led prose suitable for a PowerPoint deck and written report.
- Use ONLY statistics and facts present in the JSON data. Never invent percentages or sample sizes.
- Structure output with these ## sections:
## Executive summary
## Methodology recap
## Key findings
## Recommendations
## Appendix notes
- Under Key findings, write one subsection per analysis section (use the section labels provided).
- Keep executive summary to 3–5 sentences.
- Start directly with ## Executive summary (no title before it)."""


def run_report_writing_agent(
    survey_id: int,
    sections: list[ReportSectionInput],
    *,
    deck_title: str = "",
    client_context: str | None = None,
) -> AgentDraftResponse:
    contexts, load_errors = _load_section_contexts(survey_id, sections)
    meta = _survey_meta(survey_id, deck_title, client_context)

    if not contexts and load_errors:
        return AgentDraftResponse(
            agent="report",
            configured=False,
            title=deck_title or f"Survey {survey_id} report",
            draft_markdown="Could not load analysis data for the selected sections.",
            sections=[],
            actions=load_errors,
        )

    payload = {"survey": meta, "analysis_sections": contexts}
    title = deck_title or meta.get("title") or f"Survey {survey_id} report"

    if ai_status().get("configured"):
        text = complete_custom(
            f"Write the client report narrative:\n\n```json\n{json.dumps(payload, default=str, indent=2)}\n```",
            system=REPORT_SYSTEM,
            max_tokens=3000,
        )
        if text:
            parsed_title, parsed_sections = parse_markdown_sections(text)
            return AgentDraftResponse(
                agent="report",
                configured=True,
                title=parsed_title or title,
                draft_markdown=text.strip(),
                sections=parsed_sections,
                actions=_report_actions(meta, contexts),
            )

    return _heuristic_report(meta, contexts, title)


def _load_section_contexts(
    survey_id: int,
    sections: list[ReportSectionInput],
) -> tuple[list[dict[str, Any]], list[str]]:
    contexts: list[dict[str, Any]] = []
    errors: list[str] = []
    for section in sections:
        try:
            if section.report_type == "banner" and section.banner_request:
                result = run_banner_table(survey_id, **section.banner_request)
                ctx = banner_context(result)
            elif section.variable_id:
                result = run_question_profile(
                    survey_id,
                    section.variable_id,
                    completion_status=section.completion_status,
                    filters=section.filters or None,
                    filter_tree=section.filter_tree,
                )
                ctx = profile_context(result)
            else:
                errors.append(f"Section '{section.label}' is not configured.")
                continue
            ctx["section_id"] = section.section_id
            ctx["label"] = section.label
            contexts.append(ctx)
        except Exception as exc:
            errors.append(f"Could not load '{section.label}': {exc}")
    return contexts, errors


def _survey_meta(survey_id: int, deck_title: str, client_context: str | None) -> dict[str, Any]:
    meta: dict[str, Any] = {
        "survey_id": survey_id,
        "title": deck_title or f"Survey {survey_id}",
        "client_context": client_context,
    }
    try:
        wf = get_project_workflow(survey_id)
        meta.update(
            {
                "client_name": wf.client_name,
                "project_code": wf.project_code,
                "study_type": wf.study_type,
                "phase": wf.phase,
            }
        )
        if wf.client_name and not deck_title:
            meta["title"] = f"{wf.client_name} — {wf.project_code or 'Research report'}"
    except Exception:
        pass
    return meta


def _format_finding(ctx: dict[str, Any]) -> str:
    label = ctx.get("label") or ctx.get("question_text") or "Finding"
    base_n = ctx.get("base_n")
    lines = [f"**{label}**"]
    if base_n is not None:
        lines.append(f"Base: n={base_n}.")

    if ctx.get("analysis_type") == "numeric":
        for key in ("mean", "median", "count"):
            if ctx.get(key) is not None:
                lines.append(f"{key.capitalize()}: {ctx[key]}.")
        return " ".join(lines)

    dist = ctx.get("distribution") or []
    if dist:
        top = dist[:5]
        parts = [f"{row.get('label')}: {row.get('percentage')}% (n={row.get('count')})" for row in top]
        lines.append("Top responses: " + "; ".join(parts) + ".")
        return " ".join(lines)

    if ctx.get("type") == "banner" and ctx.get("tables"):
        lines.append("Crosstab analysis included — see tables in appendix.")
        return " ".join(lines)

    return " ".join(lines)


def _heuristic_report(
    meta: dict[str, Any],
    contexts: list[dict[str, Any]],
    title: str,
) -> AgentDraftResponse:
    client = meta.get("client_name") or "the client"
    findings = "\n\n".join(_format_finding(ctx) for ctx in contexts) if contexts else "Configure report sections with questions or crosstabs to populate findings."

    sections = [
        AgentDraftSection(
            heading="Executive summary",
            body=(
                f"This report presents findings from research conducted for {client}. "
                f"Analysis covers {len(contexts)} core section(s) from the {meta.get('study_type', 'quant')} study. "
                "Detailed results and recommendations follow."
            ),
        ),
        AgentDraftSection(
            heading="Methodology recap",
            body=(
                "Fieldwork was conducted online via LimeSurvey with Elastic Tree QC procedures. "
                "Tables show weighted or unweighted bases as per project setup."
            ),
        ),
        AgentDraftSection(
            heading="Key findings",
            body=findings,
        ),
        AgentDraftSection(
            heading="Recommendations",
            body=(
                "Recommendations should be tailored in the client debrief. "
                "Review significant differences in crosstabs and top-box metrics for action priorities."
            ),
        ),
        AgentDraftSection(
            heading="Appendix notes",
            body="Full data tables and charts are available in the exported deck and ET Scout workspace.",
        ),
    ]

    draft = "\n\n".join(f"## {s.heading}\n\n{s.body}" for s in sections)
    return AgentDraftResponse(
        agent="report",
        configured=False,
        title=title,
        draft_markdown=draft,
        sections=sections,
        actions=_report_actions(meta, contexts),
    )


def _report_actions(meta: dict[str, Any], contexts: list[dict[str, Any]]) -> list[str]:
    actions: list[str] = []
    if not contexts:
        actions.append("Add configured sections (questions or saved crosstabs) before exporting.")
    if not meta.get("client_name"):
        actions.append("Set client name in project workflow for a personalised report title.")
    if ai_status().get("configured"):
        actions.append("Re-run with AI enabled for polished client-ready prose.")
    else:
        actions.append("Set ANTHROPIC_API_KEY or Azure OpenAI for AI-authored narratives.")
    return actions
