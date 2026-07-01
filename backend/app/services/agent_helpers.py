"""Shared helpers for ET Scout agents."""

from __future__ import annotations

import re

from app.models.pm import AgentDraftSection


def parse_agent_brief_text(agent: str, configured: bool, text: str):
    """Parse SUMMARY / ACTIONS / RISKS agent output into AgentBriefResponse fields."""
    from app.models.pm import AgentBriefResponse

    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    summary_parts: list[str] = []
    actions: list[str] = []
    risks: list[str] = []
    mode = "summary"
    for ln in lines:
        upper = ln.upper()
        if upper.startswith("ACTIONS"):
            mode = "actions"
            continue
        if upper.startswith("RISKS"):
            mode = "risks"
            continue
        if upper.startswith("SUMMARY"):
            mode = "summary"
            continue
        if ln.startswith("•"):
            actions.append(ln.lstrip("• ").strip())
        elif ln.startswith("⚠"):
            risks.append(ln.lstrip("⚠ ").strip())
        elif mode == "summary":
            summary_parts.append(ln)
        elif mode == "actions":
            actions.append(ln.lstrip("-• ").strip())
        elif mode == "risks":
            risks.append(ln.lstrip("-⚠• ").strip())
    return AgentBriefResponse(
        agent=agent,
        configured=configured,
        summary=" ".join(summary_parts) or text[:400],
        actions=actions,
        risks=risks,
    )


def parse_markdown_sections(text: str) -> tuple[str, list[AgentDraftSection]]:
    """Split markdown on ## headings into sections."""
    text = text.strip()
    if not text:
        return "", []

    parts = re.split(r"\n(?=##\s+)", text)
    sections: list[AgentDraftSection] = []
    title = ""

    for i, part in enumerate(parts):
        part = part.strip()
        if not part:
            continue
        if part.startswith("##"):
            lines = part.split("\n", 1)
            heading = lines[0].lstrip("#").strip()
            body = lines[1].strip() if len(lines) > 1 else ""
            sections.append(AgentDraftSection(heading=heading, body=body))
        elif i == 0 and not part.startswith("#"):
            title = part.split("\n", 1)[0].strip().lstrip("#").strip()
            rest = part.split("\n", 1)
            if len(rest) > 1 and rest[1].strip():
                sections.insert(0, AgentDraftSection(heading="Overview", body=rest[1].strip()))

    if not title and sections:
        title = sections[0].heading
    return title, sections
