"""Create workflow tasks from Gmail messages."""

from __future__ import annotations

import re
import time
import uuid
from typing import Any

from app.models.gmail import (
    CreateTaskFromEmailRequest,
    CreateTaskFromEmailResponse,
    GmailMessageSummary,
    GmailTaskSuggestion,
)
from app.models.project_workflow import ProjectTask, TaskCategory, TaskPriority
from app.services import gmail_store
from app.services.auth import VALID_USERS
from app.services.gmail_client import (
    GmailNotConnectedError,
    fetch_inbox_messages,
    get_profile_email,
    is_gmail_configured,
)
from app.services.project_workflow_store import add_task_to_workflow, get_project_workflow

_TEAM_NAMES = sorted(VALID_USERS, key=len, reverse=True)

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
        if email and name in VALID_USERS:
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


def enrich_messages(username: str, messages: list[dict[str, Any]]) -> list[GmailMessageSummary]:
    out: list[GmailMessageSummary] = []
    for msg in messages:
        link = gmail_store.get_message_link(msg["id"])
        out.append(
            GmailMessageSummary(
                id=msg["id"],
                thread_id=msg.get("thread_id") or "",
                subject=msg.get("subject") or "(no subject)",
                from_name=msg.get("from_name") or "",
                from_email=msg.get("from_email") or "",
                to_emails=msg.get("to_emails") or [],
                cc_emails=msg.get("cc_emails") or [],
                snippet=msg.get("snippet") or "",
                internal_date=msg.get("internal_date"),
                is_unread=bool(msg.get("is_unread")),
                has_task=link is not None,
                linked_survey_id=int(link["survey_id"]) if link else None,
                linked_task_id=str(link["task_id"]) if link else None,
            )
        )
    return out


def sync_inbox(username: str, *, force: bool = False) -> list[GmailMessageSummary]:
    if not force:
        cache = gmail_store.get_inbox_cache(username)
        synced_at = cache.get("synced_at")
        if synced_at and time.time() - float(synced_at) < 120:
            return enrich_messages(username, cache.get("messages") or [])

    try:
        messages = fetch_inbox_messages(username)
        gmail_store.save_inbox_cache(username, messages)
        return enrich_messages(username, messages)
    except Exception:
        cache = gmail_store.get_inbox_cache(username)
        cached = cache.get("messages") or []
        if cached:
            return enrich_messages(username, cached)
        raise


def get_connection_status(username: str) -> dict[str, Any]:
    if not is_gmail_configured():
        return {
            "configured": False,
            "connected": False,
            "email": None,
            "last_sync_at": None,
            "message": "Google OAuth not configured on server.",
        }
    tokens = gmail_store.get_tokens(username)
    if not tokens:
        return {
            "configured": True,
            "connected": False,
            "email": None,
            "last_sync_at": None,
            "message": "Connect your Elastic Tree Gmail account to turn emails into tasks.",
        }
    email = get_profile_email(username)
    cache = gmail_store.get_inbox_cache(username)
    return {
        "configured": True,
        "connected": True,
        "email": email,
        "last_sync_at": cache.get("synced_at"),
        "message": "Gmail connected.",
    }


def create_task_from_email(
    username: str,
    message_id: str,
    body: CreateTaskFromEmailRequest,
    *,
    survey_title: str = "",
) -> CreateTaskFromEmailResponse:
    if gmail_store.message_has_task(message_id):
        link = gmail_store.get_message_link(message_id)
        if link:
            workflow = get_project_workflow(int(link["survey_id"]))
            task = next((t for t in workflow.tasks if t.id == link["task_id"]), None)
            if task:
                return CreateTaskFromEmailResponse(
                    survey_id=int(link["survey_id"]),
                    task_id=task.id,
                    task_title=task.title,
                    assignee=task.assignee,
                    gmail_message_id=message_id,
                    survey_title=survey_title,
                )
        raise ValueError("This email already has a linked task.")

    cache = gmail_store.get_inbox_cache(username)
    message = next((m for m in cache.get("messages") or [] if m.get("id") == message_id), None)
    if not message:
        messages = fetch_inbox_messages(username)
        gmail_store.save_inbox_cache(username, messages)
        message = next((m for m in messages if m.get("id") == message_id), None)
    if not message:
        raise ValueError("Email not found in inbox.")

    suggestion = suggest_task_from_message(message)
    title = (body.title or suggestion.title).strip()
    if not title:
        raise ValueError("Task title is required.")

    task = ProjectTask(
        id=uuid.uuid4().hex[:12],
        title=title,
        description=(body.description or suggestion.description).strip(),
        category=body.category or suggestion.category,
        assignee=body.assignee or suggestion.assignee,
        status="todo",
        priority=body.priority or suggestion.priority,
        due_date=body.due_date,
        source="email",
        gmail_message_id=message_id,
        gmail_thread_id=str(message.get("thread_id") or "") or None,
    )

    saved, created = add_task_to_workflow(
        body.survey_id,
        task,
        editor=username,
    )
    del saved
    gmail_store.link_message_to_task(
        message_id,
        survey_id=body.survey_id,
        task_id=created.id,
        created_by=username,
    )

    return CreateTaskFromEmailResponse(
        survey_id=body.survey_id,
        task_id=created.id,
        task_title=created.title,
        assignee=created.assignee,
        gmail_message_id=message_id,
        survey_title=survey_title,
    )
