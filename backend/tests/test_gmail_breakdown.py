"""Tests for Gmail AI breakdown and personal tasks."""

from app.services.gmail_ai import break_down_email_message
from app.services.gmail_tasks import create_task_from_email
from app.services.personal_tasks_store import list_personal_tasks
from app.models.gmail import CreateTaskFromEmailRequest


def test_break_down_heuristic_bullets():
    message = {
        "id": "msg-1",
        "subject": "Weekly updates",
        "snippet": "",
        "body_text": "- Send client deck\n- Review Mumbai quota\n- Update invoice tracker",
        "from_name": "Client",
        "from_email": "client@example.com",
        "to_emails": [],
        "cc_emails": [],
    }
    breakdown = break_down_email_message(message)
    assert breakdown.gmail_message_id == "msg-1"
    assert len(breakdown.tasks) >= 2
    assert all(task.title for task in breakdown.tasks)


def test_create_personal_task_from_email(monkeypatch):
    monkeypatch.setattr(
        "app.services.gmail_tasks._resolve_message",
        lambda username, message_id, with_body=False: {
            "id": message_id,
            "subject": "Team admin",
            "snippet": "Please update holiday calendar",
            "thread_id": "thread-1",
            "to_emails": [],
            "cc_emails": [],
        },
    )
    result = create_task_from_email(
        "Sunil",
        "msg-admin",
        CreateTaskFromEmailRequest(
            title="Update holiday calendar",
            note="Internal HR task",
            billable=False,
        ),
    )
    assert result.personal is True
    assert result.survey_id is None
    assert result.billable is False
    tasks = list_personal_tasks("Sunil")
    assert any(t.title == "Update holiday calendar" for t in tasks)
