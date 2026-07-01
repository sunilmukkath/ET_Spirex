"""Create workflow and personal tasks from Gmail messages."""

from __future__ import annotations

import re
import time
import uuid
from typing import Any

from app.models.gmail import (
    CreateTaskFromEmailRequest,
    CreateTaskFromEmailResponse,
    CreateTasksFromEmailBatchRequest,
    CreateTasksFromEmailBatchResponse,
    GmailEmailBreakdown,
    GmailMessageSummary,
)
from app.models.project_workflow import ProjectTask
from app.services import gmail_store
from app.services.gmail_client import (
    GmailNotConnectedError,
    ensure_credentials,
    fetch_inbox_messages,
    fetch_message_detail,
    get_profile_email,
    is_gmail_configured,
)
from app.services.gmail_suggest import suggest_task_from_message
from app.services.personal_tasks_store import create_personal_task, get_personal_task
from app.services.project_workflow_store import add_task_to_workflow, get_project_workflow


def gmail_message_url(message_id: str) -> str:
    return f"https://mail.google.com/mail/u/0/#inbox/{message_id}"


def _resolve_message(username: str, message_id: str, *, with_body: bool = False) -> dict[str, Any]:
    cache = gmail_store.get_inbox_cache(username)
    message = next((m for m in cache.get("messages") or [] if m.get("id") == message_id), None)
    if message and (not with_body or message.get("body_text")):
        return message
    if with_body:
        try:
            detail = fetch_message_detail(username, message_id)
            messages = list(cache.get("messages") or [])
            replaced = False
            for idx, item in enumerate(messages):
                if item.get("id") == message_id:
                    messages[idx] = {**item, **detail}
                    replaced = True
                    break
            if not replaced:
                messages.insert(0, detail)
            gmail_store.save_inbox_cache(username, messages)
            return detail
        except Exception:
            if message:
                return message
    if message:
        return message
    messages = fetch_inbox_messages(username)
    gmail_store.save_inbox_cache(username, messages)
    message = next((m for m in messages if m.get("id") == message_id), None)
    if not message:
        raise ValueError("Email not found in inbox.")
    if with_body:
        return _resolve_message(username, message_id, with_body=True)
    return message


def break_down_email(username: str, message_id: str) -> GmailEmailBreakdown:
    from app.services.gmail_ai import break_down_email_message

    message = _resolve_message(username, message_id, with_body=True)
    return break_down_email_message(message)


def enrich_messages(username: str, messages: list[dict[str, Any]]) -> list[GmailMessageSummary]:
    out: list[GmailMessageSummary] = []
    for msg in messages:
        links = gmail_store.get_message_links(msg["id"])
        first = links[0] if links else None
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
                has_task=bool(links),
                task_count=len(links),
                linked_survey_id=int(first["survey_id"]) if first and first.get("survey_id") is not None else None,
                linked_task_id=str(first["task_id"]) if first else None,
                email_url=gmail_message_url(msg["id"]),
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
        from app.services.gmail_mail import process_scheduled_sends

        process_scheduled_sends(username)
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
    if not gmail_store.get_tokens(username):
        return {
            "configured": True,
            "connected": False,
            "email": None,
            "last_sync_at": None,
            "message": "Connect your Elastic Tree Gmail account to turn emails into tasks.",
        }
    if ensure_credentials(username) is None:
        return {
            "configured": True,
            "connected": False,
            "email": None,
            "last_sync_at": None,
            "message": "Gmail access expired — sign in with Google again or reconnect once.",
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


def _survey_title_for(survey_id: int) -> str:
    workflow = get_project_workflow(survey_id)
    client = workflow.client_name.strip()
    code = workflow.project_code.strip()
    if client and code:
        return f"{client} — {code}"
    if client:
        return client
    if code:
        return code
    return f"Survey {survey_id}"


def _find_project_task(survey_id: int, task_id: str) -> ProjectTask | None:
    workflow = get_project_workflow(survey_id)
    return next((t for t in workflow.tasks if t.id == task_id), None)


def create_task_from_email(
    username: str,
    message_id: str,
    body: CreateTaskFromEmailRequest,
    *,
    survey_title: str = "",
) -> CreateTaskFromEmailResponse:
    message = _resolve_message(username, message_id)
    suggestion = suggest_task_from_message(message)
    title = (body.title or suggestion.title).strip()
    if not title:
        raise ValueError("Task title is required.")
    note = (body.note or body.description or suggestion.description or "").strip()
    billable = suggestion.category != "general" if body.billable is None else body.billable
    assignee = body.assignee or suggestion.assignee or username
    email_url = gmail_message_url(message_id)

    if body.survey_id is None:
        created = create_personal_task(
            username,
            title=title,
            description=note,
            category=body.category or suggestion.category,
            assignee=assignee,
            priority=body.priority or suggestion.priority,
            due_date=body.due_date,
            billable=billable,
            gmail_message_id=message_id,
            gmail_thread_id=str(message.get("thread_id") or "") or None,
        )
        gmail_store.link_message_to_task(
            message_id,
            survey_id=None,
            task_id=created.id,
            created_by=username,
            personal=True,
        )
        return CreateTaskFromEmailResponse(
            survey_id=None,
            task_id=created.id,
            task_title=created.title,
            assignee=created.assignee,
            gmail_message_id=message_id,
            survey_title="General activity",
            personal=True,
            billable=created.billable,
            email_url=email_url,
        )

    task = ProjectTask(
        id=uuid.uuid4().hex[:12],
        title=title,
        description=note,
        category=body.category or suggestion.category,
        assignee=assignee,
        status="todo",
        priority=body.priority or suggestion.priority,
        due_date=body.due_date,
        source="email",
        gmail_message_id=message_id,
        gmail_thread_id=str(message.get("thread_id") or "") or None,
        billable=billable,
    )

    _, created = add_task_to_workflow(body.survey_id, task, editor=username)
    gmail_store.link_message_to_task(
        message_id,
        survey_id=body.survey_id,
        task_id=created.id,
        created_by=username,
        personal=False,
    )

    return CreateTaskFromEmailResponse(
        survey_id=body.survey_id,
        task_id=created.id,
        task_title=created.title,
        assignee=created.assignee,
        gmail_message_id=message_id,
        survey_title=survey_title or _survey_title_for(body.survey_id),
        personal=False,
        billable=created.billable,
        email_url=email_url,
    )


def create_tasks_from_email_batch(
    username: str,
    message_id: str,
    body: CreateTasksFromEmailBatchRequest,
) -> CreateTasksFromEmailBatchResponse:
    if not body.tasks:
        raise ValueError("Add at least one task.")
    created_rows: list[CreateTaskFromEmailResponse] = []
    for item in body.tasks:
        created_rows.append(
            create_task_from_email(
                username,
                message_id,
                CreateTaskFromEmailRequest(
                    survey_id=item.survey_id,
                    title=item.title,
                    note=item.note,
                    category=item.category,
                    assignee=item.assignee,
                    priority=item.priority,
                    billable=item.billable,
                ),
            )
        )
    return CreateTasksFromEmailBatchResponse(created=created_rows, count=len(created_rows))



def find_linked_task(link: dict[str, Any]) -> ProjectTask | None:
    if link.get("personal"):
        owner = str(link.get("created_by") or "")
        task_id = str(link.get("task_id") or "")
        if owner and task_id:
            return get_personal_task(owner, task_id)
        return None
    survey_id = link.get("survey_id")
    task_id = str(link.get("task_id") or "")
    if survey_id is None or not task_id:
        return None
    return _find_project_task(int(survey_id), task_id)
