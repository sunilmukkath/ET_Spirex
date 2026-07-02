"""ET Scout floating research copilot."""

from __future__ import annotations

import json
from typing import Any

from app.models.assistant import AssistantChatRequest, AssistantChatResponse, AssistantMessage
from app.services.ai_narrative import ai_status, complete_chat, format_ai_error
from app.services.auth import get_valid_users

ASSISTANT_SYSTEM = """You are Scout — a helpful assistant inside Elastic Tree's research workspace (ET Scout).

You help Elastic Tree team members with:
- Navigating ET Scout (Home, Projects/LimeSurvey dashboard, My work, Operations, Fieldwork, Settings, survey workspace tabs)
- Quant research: crosstabs, charts, QC, quotas, fielding, weighting, exports
- Qual research: transcript library, thematic summaries
- PM workflow: proposals, tasks, CRM, finance, project stages
- Gmail inbox → tasks integration
- Report builder and AI narratives

Rules:
- Be concise, practical, and friendly. Use short paragraphs or bullets.
- British English. Professional market-research tone.
- If you do not know something specific about their data, say what they should click or check — do not invent survey results or client facts.
- Suggest concrete next steps and in-app paths (e.g. "/dashboard", "/my-work", "Workflow tab on a study").
- You cannot execute actions — only guide the user.
- Never share passwords or ask for secrets."""

_FALLBACK_NOT_CONFIGURED = (
    "AI is not configured on this server yet. Ask your admin to set ANTHROPIC_API_KEY or Azure OpenAI "
    "variables in Railway, then try again. You can still use ET Scout manually — open **Settings** for connection status."
)


def _context_block(context: dict[str, Any], username: str) -> str:
    lines = [f"Signed-in user: {username}"]
    if context.get("pathname"):
        lines.append(f"Current page path: {context['pathname']}")
    if context.get("survey_id"):
        lines.append(f"Survey workspace ID (LimeSurvey): {context['survey_id']}")
    if context.get("search"):
        lines.append(f"URL query: {context['search']}")
    if context.get("page_hint"):
        lines.append(f"Page hint: {context['page_hint']}")
    lines.append(f"Known team usernames: {', '.join(sorted(get_valid_users()))}")
    return "Context:\n" + "\n".join(f"- {line}" for line in lines)


def _trim_history(history: list[AssistantMessage], *, limit: int = 10) -> list[AssistantMessage]:
    return history[-limit:]


def run_assistant_chat(username: str, body: AssistantChatRequest) -> AssistantChatResponse:
    user_text = str(body.message or "").strip()
    if not user_text:
        return AssistantChatResponse(
            reply="Ask a question about ET Scout, your study, or what to do next.",
            configured=ai_status().get("configured", False),
        )

    status = ai_status()
    if not status.get("configured"):
        return AssistantChatResponse(reply=_FALLBACK_NOT_CONFIGURED, configured=False)

    context = body.context if isinstance(body.context, dict) else {}
    preamble = _context_block(context, username)
    messages: list[dict[str, str]] = []

    for item in _trim_history(body.history):
        role = item.role if item.role in {"user", "assistant"} else "user"
        content = str(item.content or "").strip()
        if content:
            messages.append({"role": role, "content": content})

    messages.append(
        {
            "role": "user",
            "content": f"{preamble}\n\nUser question:\n{user_text}",
        }
    )

    try:
        reply = complete_chat(messages, system=ASSISTANT_SYSTEM, max_tokens=900)
    except Exception as exc:
        detail = format_ai_error(exc)
        return AssistantChatResponse(
            reply=f"Sorry — the AI request failed. {detail}",
            configured=True,
        )

    if not reply:
        return AssistantChatResponse(
            reply="I could not generate a reply. Please try rephrasing your question.",
            configured=True,
        )

    return AssistantChatResponse(reply=reply.strip(), configured=True)
