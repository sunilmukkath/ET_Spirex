"""Tests for ET Scout floating assistant."""

from app.models.assistant import AssistantChatRequest
from app.services.assistant import run_assistant_chat


def test_assistant_not_configured():
    body = AssistantChatRequest(message="How do I open crosstabs?")
    result = run_assistant_chat("Sunil", body)
    assert result.configured is False
    assert "not configured" in result.reply.lower()


def test_assistant_empty_message():
    body = AssistantChatRequest(message="   ")
    result = run_assistant_chat("Sunil", body)
    assert "ask a question" in result.reply.lower()
