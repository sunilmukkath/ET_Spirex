"""Rule-based Gmail task suggestions."""

from __future__ import annotations

import re
from typing import Any

from app.models.gmail import GmailTaskSuggestion
from app.models.project_workflow import TaskCategory, TaskPriority
from app.services.auth import get_valid_users

_TEAM_NAMES = sorted(get_valid_users(), key=len, reverse=True)

_CLIENT_HINTS = re.compile(
    r"\b(brief|proposal|approval|sign[\s-]?off|client|deck|report|invoice)\b",
    re.I,
)
_FIELD_HINTS = re.compile(r"\b(field|quota|completes|vendor|recruit|screener|cati)\b", re.I)
_PROG_HINTS = re.compile(r"\b(program|questionnaire|limesurvey|survey link|pilot)\b", re.I)
_ASSIGN_RE = re.compile(
    r"(?:assign(?:ed)?\s+to|for|@)\s+(" + "|".join(re.escape(n) for n in _TEAM_NAMES) + r")\b",
    re.I,
)


def _parse_team_email_map() -> dict[str, str]:
    from app.config import settings

    mapping: dict[str, str] = {}
    raw = settings.resolved_gmail_team_email_map
    if not raw:
        return mapping
    for pair in raw.split(","):
        if ":" not in pair:
            continue
        email, name = pair.split(":", 1)
        email = email.strip().lower()
        name = name.strip()
        if email and name in get_valid_users():
            mapping[email] = name
    return mapping


def suggest_assignee(message: dict[str, Any]) -> str | None:
    email_map = _parse_team_email_map()
    for addr in message.get("to_emails", []) + message.get("cc_emails", []):
        if addr in email_map:
            return email_map[addr]

    haystack = " ".join(
        [
            message.get("subject", ""),
            message.get("snippet", ""),
        ]
    )
    match = _ASSIGN_RE.search(haystack)
    if match:
        candidate = match.group(1)
        for name in _TEAM_NAMES:
            if name.lower() == candidate.lower():
                return name

    for name in _TEAM_NAMES:
        if re.search(rf"\b{re.escape(name)}\b", haystack, re.I):
            return name
    return None


def suggest_category(message: dict[str, Any]) -> TaskCategory:
    haystack = f"{message.get('subject', '')} {message.get('snippet', '')}"
    if _CLIENT_HINTS.search(haystack):
        return "client_request"
    if _FIELD_HINTS.search(haystack):
        return "field"
    if _PROG_HINTS.search(haystack):
        return "programming"
    return "general"


def suggest_priority(message: dict[str, Any]) -> TaskPriority:
    haystack = f"{message.get('subject', '')} {message.get('snippet', '')}".lower()
    if any(w in haystack for w in ("urgent", "asap", "eod", "today", "blocked")):
        return "high"
    if any(w in haystack for w in ("fyi", "when you can", "no rush")):
        return "low"
    return "medium"


def suggest_task_from_message(message: dict[str, Any]) -> GmailTaskSuggestion:
    subject = str(message.get("subject") or "(no subject)").strip()
    snippet = str(message.get("snippet") or "").strip()
    assignee = suggest_assignee(message)
    category = suggest_category(message)
    priority = suggest_priority(message)
    confidence: str = "high" if assignee else "medium"
    return GmailTaskSuggestion(
        title=subject[:200],
        description=snippet[:2000],
        category=category,
        assignee=assignee,
        priority=priority,
        confidence=confidence,  # type: ignore[arg-type]
    )
