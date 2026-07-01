"""Tests for Gmail → task suggestions."""

from app.services.gmail_tasks import suggest_assignee, suggest_category, suggest_task_from_message


def test_suggest_assignee_from_subject():
    msg = {
        "subject": "Nestlé tracker — please review quota for Shilaja",
        "snippet": "",
        "to_emails": [],
        "cc_emails": [],
    }
    assert suggest_assignee(msg) == "Shilaja"


def test_suggest_assignee_from_assign_to_pattern():
    msg = {
        "subject": "FW: Client brief",
        "snippet": "Assign to Sunil by EOD",
        "to_emails": [],
        "cc_emails": [],
    }
    assert suggest_assignee(msg) == "Sunil"


def test_suggest_category_client_request():
    msg = {
        "subject": "Client approval needed on proposal",
        "snippet": "Please send revised deck",
        "to_emails": [],
        "cc_emails": [],
    }
    assert suggest_category(msg) == "client_request"


def test_suggest_task_from_message():
    suggestion = suggest_task_from_message(
        {
            "subject": "Field update — Mumbai lagging",
            "snippet": "Vendor reports 12 completes today",
            "to_emails": [],
            "cc_emails": [],
        }
    )
    assert suggestion.title.startswith("Field update")
    assert suggestion.category == "field"
