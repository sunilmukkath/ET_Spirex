"""Detect client proposals / briefs in Gmail and prepare pipeline metadata."""

from __future__ import annotations

import re
from typing import Any

from app.models.gmail import GmailProposalBriefHint
from app.services.gmail_suggest import suggest_assignee

_PROPOSAL_BRIEF_RE = re.compile(
    r"\b("
    r"new\s+(?:client\s+)?(?:proposal|brief|project|study|rfp)"
    r"|client\s+brief"
    r"|research\s+brief"
    r"|project\s+brief"
    r"|(?:new|fresh)\s+rfp"
    r"|request\s+for\s+proposal"
    r"|scope\s+of\s+work"
    r"|proposal\s+request"
    r"|briefing\s+document"
    r")\b",
    re.I,
)
_SUBJECT_HINT_RE = re.compile(
    r"\b(proposal|brief|rfp|pitch|scope|new\s+project|new\s+study)\b",
    re.I,
)
_PREFIX_RE = re.compile(r"^(re|fw|fwd)\s*:\s*", re.I)
_NOISE_RE = re.compile(r"\b(proposal|brief|rfp|request|for|new)\b", re.I)


def is_proposal_or_brief(message: dict[str, Any]) -> bool:
    subject = str(message.get("subject") or "")
    body = str(message.get("body_text") or message.get("snippet") or "")
    haystack = f"{subject}\n{body[:4000]}"
    if _PROPOSAL_BRIEF_RE.search(haystack):
        return True
    if _SUBJECT_HINT_RE.search(subject) and len(body.strip()) > 40:
        return True
    return False


def suggest_project_name(message: dict[str, Any]) -> str:
    subject = str(message.get("subject") or "").strip()
    while _PREFIX_RE.match(subject):
        subject = _PREFIX_RE.sub("", subject, count=1).strip()
    subject = re.sub(r"\s+", " ", subject).strip(" -–|")
    if subject and subject.lower() not in {"proposal", "brief", "rfp", "new brief", "new proposal"}:
        cleaned = _NOISE_RE.sub("", subject).strip(" -–:|")
        if len(cleaned) >= 4:
            return cleaned[:160]
        return subject[:160]
    from_name = str(message.get("from_name") or "").strip()
    if from_name:
        return f"{from_name} — new brief"[:160]
    return "New client brief"


def suggest_client_name(message: dict[str, Any]) -> str:
    from_name = str(message.get("from_name") or "").strip()
    from_email = str(message.get("from_email") or "").strip().lower()
    if from_name and from_name.lower() not in {"mail", "info", "team", "support", "noreply"}:
        return from_name[:120]
    if "@" in from_email:
        domain = from_email.split("@", 1)[1]
        domain = domain.split(".")[0]
        if domain not in {"gmail", "yahoo", "hotmail", "outlook", "elastictree"}:
            return domain.replace("-", " ").title()[:120]
    return from_name or "Client TBC"


def proposal_brief_hint(message: dict[str, Any]) -> GmailProposalBriefHint:
    detected = is_proposal_or_brief(message)
    assignee = suggest_assignee(message)
    if not detected:
        return GmailProposalBriefHint(detected=False)
    subject = str(message.get("subject") or "").lower()
    confidence: str = "high" if _PROPOSAL_BRIEF_RE.search(subject) or assignee else "medium"
    return GmailProposalBriefHint(
        detected=True,
        project_name=suggest_project_name(message),
        client_name=suggest_client_name(message),
        assignee=assignee,
        confidence=confidence,  # type: ignore[arg-type]
    )


def default_proposal_tasks(owner: str | None) -> list[dict[str, Any]]:
    assignee = owner or None
    return [
        {
            "title": "Review client brief and confirm scope",
            "note": "Read the email brief and note objectives, sample, timeline, and deliverables.",
            "category": "client_request",
            "assignee": assignee,
            "priority": "high",
            "billable": True,
        },
        {
            "title": "Draft proposal response",
            "note": "Use Operations → Draft proposal once requirements are captured.",
            "category": "research",
            "assignee": assignee,
            "priority": "high",
            "billable": True,
        },
        {
            "title": "Confirm budget and timeline with client",
            "note": "Align commercial terms before sending the proposal.",
            "category": "finance",
            "assignee": assignee,
            "priority": "medium",
            "billable": True,
        },
    ]
