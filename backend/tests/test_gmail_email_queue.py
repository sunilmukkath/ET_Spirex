"""Email tasks without clear assignee land in the new queue."""

from app.models.gmail import CreateTaskFromEmailRequest
from app.services.gmail_tasks import create_task_from_email
from app.services.project_workflow_store import list_unassigned_tasks


def test_email_task_without_assignee_goes_to_new_queue(tmp_path, monkeypatch):
    personal_dir = tmp_path / "personal_tasks"
    gmail_dir = tmp_path / "gmail"
    personal_dir.mkdir()
    gmail_dir.mkdir()

    monkeypatch.setattr("app.services.personal_tasks_store._DATA_DIR", personal_dir)
    monkeypatch.setattr("app.services.gmail_store._DATA_DIR", gmail_dir)
    monkeypatch.setattr("app.services.gmail_store._links_path", lambda: gmail_dir / "email_task_links.json")

    message = {
        "id": "msg-99",
        "thread_id": "thr-1",
        "subject": "General admin follow-up",
        "snippet": "Please handle when you can",
        "to_emails": [],
        "cc_emails": [],
    }

    monkeypatch.setattr(
        "app.services.gmail_tasks._resolve_message",
        lambda _user, _mid, with_body=False: message,
    )

    result = create_task_from_email(
        "Sunil",
        "msg-99",
        CreateTaskFromEmailRequest(title="Admin follow-up", assignee=None),
    )
    assert result.assignee is None
    assert result.personal is True

    rows = list_unassigned_tasks()
    assert any(row["task"]["id"] == result.task_id for row in rows)
