"""Read, send, reply, and schedule Gmail messages."""

from __future__ import annotations

import time
import uuid
from typing import Any

from app.models.gmail import (
    GmailMessageDetail,
    GmailScheduledSend,
    GmailSendEmailRequest,
    GmailSendEmailResponse,
)
from app.services import gmail_store
from app.services.gmail_client import mark_message_read, send_email_message


def get_message_detail(username: str, message_id: str, *, mark_read: bool = True) -> GmailMessageDetail:
    from app.services.gmail_tasks import _resolve_message, gmail_message_url

    message = _resolve_message(username, message_id, with_body=True)
    if mark_read and message.get("is_unread"):
        try:
            mark_message_read(username, message_id, read=True)
            message["is_unread"] = False
            cache = gmail_store.get_inbox_cache(username)
            messages = list(cache.get("messages") or [])
            for idx, item in enumerate(messages):
                if item.get("id") == message_id:
                    messages[idx] = {**item, "is_unread": False}
                    break
            gmail_store.save_inbox_cache(username, messages)
        except Exception:
            pass
    links = gmail_store.get_message_links(message_id)
    return GmailMessageDetail(
        id=message["id"],
        thread_id=message.get("thread_id") or "",
        subject=message.get("subject") or "(no subject)",
        from_name=message.get("from_name") or "",
        from_email=message.get("from_email") or "",
        to_emails=message.get("to_emails") or [],
        cc_emails=message.get("cc_emails") or [],
        body_text=message.get("body_text") or message.get("snippet") or "",
        snippet=message.get("snippet") or "",
        internal_date=message.get("internal_date"),
        is_unread=message.get("is_unread", False),
        message_id_header=message.get("message_id_header") or "",
        has_task=bool(links),
        task_count=len(links),
        email_url=gmail_message_url(message_id),
    )


def send_gmail_message(username: str, body: GmailSendEmailRequest) -> GmailSendEmailResponse:
    from app.services.gmail_tasks import _resolve_message

    thread_id: str | None = None
    in_reply_to: str | None = None
    references: str | None = None
    subject = body.subject.strip()
    to = body.to.strip()

    if body.reply_to_message_id:
        original = _resolve_message(username, body.reply_to_message_id, with_body=True)
        thread_id = original.get("thread_id") or None
        in_reply_to = original.get("message_id_header") or None
        references = in_reply_to
        if not to:
            to = original.get("from_email") or ""
        if not subject.lower().startswith("re:"):
            subject = f"Re: {original.get('subject') or subject}"

    if body.scheduled_at and body.scheduled_at > time.time() + 30:
        item = {
            "id": str(uuid.uuid4()),
            "to": to,
            "subject": subject,
            "body_text": body.body_text,
            "scheduled_at": body.scheduled_at,
            "reply_to_message_id": body.reply_to_message_id,
            "thread_id": thread_id,
            "in_reply_to": in_reply_to,
            "references": references,
            "created_at": time.time(),
        }
        gmail_store.add_scheduled_send(username, item)
        return GmailSendEmailResponse(
            ok=True,
            scheduled=True,
            scheduled_id=item["id"],
            scheduled_at=body.scheduled_at,
            message="Email scheduled",
        )

    result = send_email_message(
        username,
        to=to,
        subject=subject,
        body_text=body.body_text,
        thread_id=thread_id,
        in_reply_to=in_reply_to,
        references=references,
    )
    return GmailSendEmailResponse(
        ok=True,
        scheduled=False,
        gmail_message_id=str(result.get("id") or ""),
        thread_id=str(result.get("threadId") or thread_id or ""),
        message="Email sent",
    )


def list_scheduled(username: str) -> list[GmailScheduledSend]:
    now = time.time()
    items = gmail_store.list_scheduled_sends(username)
    return [
        GmailScheduledSend(
            id=str(item.get("id") or ""),
            to=str(item.get("to") or ""),
            subject=str(item.get("subject") or ""),
            body_text=str(item.get("body_text") or ""),
            scheduled_at=float(item.get("scheduled_at") or 0),
            status="sent" if item.get("sent_at") else ("overdue" if float(item.get("scheduled_at") or 0) < now else "pending"),
        )
        for item in items
        if item.get("id")
    ]


def process_scheduled_sends(username: str) -> int:
    """Send due scheduled emails; returns count sent."""
    now = time.time()
    items = gmail_store.list_scheduled_sends(username)
    remaining: list[dict[str, Any]] = []
    sent_count = 0
    for item in items:
        if item.get("sent_at"):
            remaining.append(item)
            continue
        scheduled_at = float(item.get("scheduled_at") or 0)
        if scheduled_at > now:
            remaining.append(item)
            continue
        try:
            send_email_message(
                username,
                to=str(item.get("to") or ""),
                subject=str(item.get("subject") or ""),
                body_text=str(item.get("body_text") or ""),
                thread_id=item.get("thread_id"),
                in_reply_to=item.get("in_reply_to"),
                references=item.get("references"),
            )
            item["sent_at"] = now
            sent_count += 1
        except Exception:
            remaining.append(item)
            continue
        remaining.append(item)
    gmail_store.save_scheduled_sends(username, remaining)
    return sent_count
