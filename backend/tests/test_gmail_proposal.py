"""Tests for proposal / brief detection and pipeline creation from email."""

from uuid import uuid4

from app.models.gmail import CreatePipelineFromEmailRequest
from app.services.gmail_ai import break_down_email_message
from app.services.gmail_proposal import is_proposal_or_brief, proposal_brief_hint, suggest_project_name


def test_detect_proposal_brief_in_subject():
    message = {
        "id": "msg-brief",
        "subject": "New client brief — Brand tracker Q3",
        "body_text": "Please find attached the research brief with objectives and sample design.",
        "from_name": "Priya Sharma",
        "from_email": "priya@acmecorp.com",
    }
    assert is_proposal_or_brief(message) is True
    hint = proposal_brief_hint(message)
    assert hint.detected is True
    assert "Brand tracker" in hint.project_name or "brief" in hint.project_name.lower()
    assert hint.client_name


def test_breakdown_includes_proposal_hint():
    message = {
        "id": "msg-rfp",
        "subject": "RFP: Customer satisfaction study",
        "snippet": "",
        "body_text": "We would like Elastic Tree to submit a proposal for a CSAT study across 8 cities.",
        "from_name": "Client Lead",
        "from_email": "lead@brandco.in",
        "to_emails": [],
        "cc_emails": [],
    }
    breakdown = break_down_email_message(message)
    assert breakdown.proposal_brief is not None
    assert breakdown.proposal_brief.detected is True
    assert suggest_project_name(message)


def test_create_pipeline_from_email(monkeypatch):
    pid = uuid4()
    prop_id = uuid4()
    cid = uuid4()
    created_tasks: list[str] = []

    class FakeProject:
        project_id = pid
        project_name = "CSAT study"

    class FakeProposal:
        proposal_id = prop_id

    def fake_create_project(session, body):
        assert body.stage == "Proposal"
        assert body.project_name == "CSAT study"
        assert body.owner_name == "Sunil"
        assert body.requirements is not None
        assert "CSAT" in body.requirements.summary
        return FakeProject()

    def fake_create_proposal(session, body):
        assert body.project_id == pid
        return FakeProposal()

    def fake_create_task(username, message_id, body, *, survey_title=""):
        created_tasks.append(body.title or "")
        from app.models.gmail import CreateTaskFromEmailResponse

        return CreateTaskFromEmailResponse(
            survey_id=None,
            task_id="t1",
            task_title=body.title or "",
            assignee=body.assignee,
            gmail_message_id=message_id,
            personal=True,
            billable=True,
            email_url="",
        )

    monkeypatch.setattr("app.services.gmail_pipeline.database_enabled", lambda: True)
    monkeypatch.setattr(
        "app.services.gmail_pipeline._resolve_message",
        lambda username, message_id, with_body=False: {
            "id": message_id,
            "subject": "RFP: CSAT study",
            "body_text": "Please submit a proposal for a CSAT study.",
            "from_name": "Client",
            "from_email": "client@example.com",
            "thread_id": "thread-1",
        },
    )
    monkeypatch.setattr("app.services.gmail_pipeline.pm_store.create_project", fake_create_project)
    monkeypatch.setattr("app.services.gmail_pipeline.pm_ops_store.create_proposal", fake_create_proposal)
    monkeypatch.setattr("app.services.gmail_pipeline._find_or_create_client", lambda *args, **kwargs: cid)
    monkeypatch.setattr("app.services.gmail_pipeline.create_task_from_email", fake_create_task)
    monkeypatch.setattr(
        "app.services.gmail_pipeline.session_scope",
        lambda: _FakeSessionScope(),
    )
    monkeypatch.setattr(
        "app.services.gmail_pipeline.gmail_store.link_message_to_pm_project",
        lambda *args, **kwargs: None,
    )

    from app.services.gmail_pipeline import create_pipeline_from_email

    result = create_pipeline_from_email(
        "Sunil",
        "msg-rfp",
        CreatePipelineFromEmailRequest(
            project_name="CSAT study",
            client_name="Client Co",
            owner_name="Sunil",
            create_tasks=True,
        ),
    )
    assert result.project_id == str(pid)
    assert result.proposal_id == str(prop_id)
    assert result.tasks_created == 3
    assert len(created_tasks) == 3


class _FakeSessionScope:
    def __enter__(self):
        return object()

    def __exit__(self, *args):
        return False
