"""AI breakdown of Gmail messages into short actionable tasks."""

from __future__ import annotations

import json
import re
from typing import Any

from app.models.gmail import GmailEmailBreakdown, GmailTaskDraft
from app.models.project_workflow import TaskCategory, TaskPriority
from app.services.ai_narrative import ai_configured, complete_json
from app.services.auth import get_valid_users
from app.services.gmail_proposal import proposal_brief_hint
from app.services.gmail_suggest import (
    suggest_assignee,
    suggest_category,
    suggest_priority,
    suggest_task_from_message,
)

_BREAKDOWN_SYSTEM = """You are Scout, Elastic Tree's operations assistant.
Break a work email into 1–5 short, actionable tasks for a market research team.

Rules:
- Each task title: max 12 words, verb-first (e.g. "Send revised quota to client").
- Each note: 1–2 short sentences with only the essential context.
- billable=true for client work, proposals, fieldwork, analysis, invoicing tied to a study.
- billable=false for internal admin, HR, training, IT, general FYI, or non-client ops.
- project_related=true only when clearly about a specific client study or survey.
- assignee: one of Sunil, Tony, Ravi, Aneena, Shilaja, Palani, Bagya, Ambika, Venisha, Samara — or null.
- category: programming | field | research | finance | client_request | general

Return ONLY valid JSON:
{"tasks":[{"title":"...","note":"...","category":"general","assignee":null,"priority":"medium","billable":false,"project_related":false}]}"""


def gmail_message_url(message_id: str) -> str:
    return f"https://mail.google.com/mail/u/0/#inbox/{message_id}"


def _parse_ai_tasks(raw: str) -> list[dict[str, Any]]:
    text = raw.strip()
    fence = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if fence:
        text = fence.group(1).strip()
    data = json.loads(text)
    items = data.get("tasks") if isinstance(data, dict) else data
    if not isinstance(items, list):
        return []
    return [item for item in items if isinstance(item, dict)]


def _normalize_category(value: Any) -> TaskCategory:
    key = str(value or "general").strip().lower()
    allowed: set[str] = {
        "programming",
        "field",
        "research",
        "finance",
        "client_request",
        "general",
    }
    return key if key in allowed else "general"  # type: ignore[return-value]


def _normalize_priority(value: Any) -> TaskPriority:
    key = str(value or "medium").strip().lower()
    return key if key in ("low", "medium", "high") else "medium"  # type: ignore[return-value]


def _normalize_assignee(value: Any) -> str | None:
    if not value:
        return None
    name = str(value).strip()
    for valid in get_valid_users():
        if valid.lower() == name.lower():
            return valid
    return None


def _heuristic_breakdown(message: dict[str, Any]) -> list[GmailTaskDraft]:
    subject = str(message.get("subject") or "(no subject)").strip()
    body = str(message.get("body_text") or message.get("snippet") or "").strip()
    assignee = suggest_assignee(message)
    category = suggest_category(message)
    priority = suggest_priority(message)
    haystack = f"{subject} {body}".lower()
    billable = not any(
        w in haystack
        for w in ("fyi", "internal", "hr ", "holiday", "team lunch", "it support", "password reset")
    )

    bullets: list[str] = []
    for line in body.splitlines():
        stripped = line.strip()
        if re.match(r"^[-*•]\s+", stripped) or re.match(r"^\d+[.)]\s+", stripped):
            bullets.append(re.sub(r"^[-*•\d.)]+\s*", "", stripped).strip())

    drafts: list[GmailTaskDraft] = []
    if bullets:
        for bullet in bullets[:5]:
            if len(bullet) < 4:
                continue
            title = bullet[:120]
            drafts.append(
                GmailTaskDraft(
                    title=title,
                    note=subject[:200],
                    category=category,
                    assignee=assignee,
                    priority=priority,
                    billable=billable,
                    project_related=category != "general",
                )
            )

    if not drafts:
        suggestion = suggest_task_from_message(message)
        drafts.append(
            GmailTaskDraft(
                title=suggestion.title[:120],
                note=(body or suggestion.description)[:500],
                category=suggestion.category,
                assignee=suggestion.assignee,
                priority=suggestion.priority,
                billable=billable,
                project_related=suggestion.category != "general",
                confidence=suggestion.confidence,
            )
        )
    return drafts


def break_down_email_message(message: dict[str, Any]) -> GmailEmailBreakdown:
    message_id = str(message.get("id") or "")
    subject = str(message.get("subject") or "(no subject)").strip()
    body = str(message.get("body_text") or message.get("snippet") or "").strip()
    configured = ai_configured()

    drafts: list[GmailTaskDraft] = []
    if configured and (subject or body):
        user_prompt = (
            f"Subject: {subject}\n\n"
            f"From: {message.get('from_name') or ''} <{message.get('from_email') or ''}>\n\n"
            f"Body:\n{body[:6000]}"
        )
        try:
            raw = complete_json(user_prompt, system=_BREAKDOWN_SYSTEM, max_tokens=1200)
            for item in _parse_ai_tasks(raw)[:5]:
                title = str(item.get("title") or "").strip()
                if not title:
                    continue
                drafts.append(
                    GmailTaskDraft(
                        title=title[:120],
                        note=str(item.get("note") or "").strip()[:500],
                        category=_normalize_category(item.get("category")),
                        assignee=_normalize_assignee(item.get("assignee")) or suggest_assignee(message),
                        priority=_normalize_priority(item.get("priority")),
                        billable=bool(item.get("billable", True)),
                        project_related=bool(item.get("project_related", False)),
                        confidence="high",
                    )
                )
        except Exception:
            drafts = []

    if not drafts:
        drafts = _heuristic_breakdown(message)
        for idx, draft in enumerate(drafts):
            if draft.confidence == "medium":
                drafts[idx] = draft.model_copy(update={"confidence": "low"})

    return GmailEmailBreakdown(
        gmail_message_id=message_id,
        subject=subject,
        configured=configured,
        tasks=drafts,
        email_url=gmail_message_url(message_id),
        proposal_brief=proposal_brief_hint(message),
    )
