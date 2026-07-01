"""AI health and error formatting."""

import httpx

from app.services.ai_narrative import format_ai_error, probe_ai_connection


def test_format_ai_error_retired_model():
    request = httpx.Request("POST", "https://api.anthropic.com/v1/messages")
    response = httpx.Response(
        404,
        request=request,
        json={"error": {"type": "not_found_error", "message": "model: claude-sonnet-4-20250514"}},
    )
    exc = httpx.HTTPStatusError("model not found", request=request, response=response)
    msg = format_ai_error(exc)
    assert "unavailable" in msg.lower() or "retired" in msg.lower()


def test_probe_not_configured(monkeypatch):
    monkeypatch.setattr(
        "app.services.ai_narrative.ai_status",
        lambda: {"configured": False, "provider": None, "model": None, "hints": {}},
    )
    result = probe_ai_connection()
    assert result["ok"] is False
    assert result["configured"] is False
