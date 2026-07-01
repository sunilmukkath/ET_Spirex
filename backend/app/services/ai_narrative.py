"""AI narrative for report slides — Anthropic Claude or Azure OpenAI.

Claude.ai (consumer) subscriptions do not include API access; set ANTHROPIC_API_KEY
from https://console.anthropic.com. Azure OpenAI is pay-as-you-go (trial credits for
new Azure accounts only — not permanently free).
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are a senior market research analyst writing slide bullets for Elastic Tree.
Rules:
- Use ONLY numbers and facts present in the data JSON. Never invent statistics.
- Write 3–4 concise bullet points (max 20 words each).
- Lead with the most important pattern; note sample size if n is small (<100).
- British English, professional tone, no hype.
- Return plain text only: one bullet per line, each line starting with "• "."""

SLIDE_PLAN_SYSTEM_PROMPT = """You are a senior market research analyst building a client presentation deck for Elastic Tree.
Rules:
- Use ONLY numbers and facts present in the sections JSON. Never invent statistics.
- Return valid JSON only (no markdown fences).
- Schema:
{"slides":[{"section_id":"...","title":"short slide title","bullets":["bullet 1","bullet 2"],"speaker_notes":"optional presenter note"}]}
- One slide object per section_id provided, in the same order.
- 3–4 bullets per slide, max 20 words each, British English.
- Titles should be insight-led, not just question codes."""


def ai_status() -> dict[str, Any]:
    provider = settings.resolved_ai_provider
    return {
        "configured": provider is not None,
        "provider": provider,
        "model": settings.resolved_ai_model if provider else None,
        "hints": {
            "anthropic": "Set ANTHROPIC_API_KEY from console.anthropic.com (separate from claude.ai Pro).",
            "azure": "Set AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, and AZURE_OPENAI_DEPLOYMENT.",
        },
    }


def profile_context(result: dict[str, Any]) -> dict[str, Any]:
    var = result.get("variable") or {}
    ctx: dict[str, Any] = {
        "type": "profile",
        "question_code": var.get("code"),
        "question_text": var.get("text"),
        "base_n": result.get("base_n"),
        "analysis_type": result.get("analysis_type"),
    }
    if result.get("scale_metrics"):
        ctx["scale_metrics"] = result["scale_metrics"]
    if result.get("values"):
        ctx["distribution"] = [
            {
                "label": row.get("label"),
                "count": row.get("count"),
                "percentage": row.get("percentage"),
            }
            for row in (result["values"] or [])[:15]
        ]
    if result.get("analysis_type") == "numeric":
        for key in ("count", "mean", "median", "std", "min", "max"):
            if result.get(key) is not None:
                ctx[key] = result[key]
    if result.get("error"):
        ctx["error"] = result["error"]
    return ctx


def banner_context(result: dict[str, Any]) -> dict[str, Any]:
    tables = result.get("tables") or [result]
    summarized = []
    for table in tables[:3]:
        if table.get("error"):
            continue
        row_var = table.get("row_variable") or {}
        rows_out = []
        for row in (table.get("rows") or [])[:10]:
            cells = row.get("cells") or []
            row_entry: dict[str, Any] = {"label": row.get("label") or row.get("code")}
            if row.get("is_total"):
                row_entry["is_total"] = True
            if cells:
                row_entry["total_col_pct"] = cells[0].get("col_pct") if cells else None
                if len(cells) > 1:
                    row_entry["banner_col_pcts"] = [
                        {"header": (table.get("headers") or [{}])[i + 1].get("label"), "col_pct": c.get("col_pct")}
                        for i, c in enumerate(cells[1:6])
                        if i + 1 < len(table.get("headers") or [])
                    ]
            rows_out.append(row_entry)
        summarized.append(
            {
                "row_question": row_var.get("text") or row_var.get("code"),
                "banners": [
                    b.get("text") or b.get("code")
                    for b in (table.get("banner_variables") or [])
                ],
                "rows": rows_out,
            }
        )
    return {"type": "banner", "tables": summarized, "confidence_level": result.get("confidence_level")}


def complete_custom(
    user_prompt: str,
    *,
    system: str,
    max_tokens: int = 1024,
) -> str | None:
    return complete_chat(
        [{"role": "user", "content": user_prompt}],
        system=system,
        max_tokens=max_tokens,
    )


def complete_chat(
    messages: list[dict[str, str]],
    *,
    system: str,
    max_tokens: int = 1024,
) -> str | None:
    provider = settings.resolved_ai_provider
    if not provider:
        return None
    cleaned = [
        {"role": m["role"], "content": m["content"]}
        for m in messages
        if m.get("role") in {"user", "assistant"} and str(m.get("content") or "").strip()
    ]
    if not cleaned:
        return None
    try:
        if provider == "anthropic":
            return _anthropic_chat(cleaned, system=system, max_tokens=max_tokens)
        if provider == "azure":
            return _azure_chat(cleaned, system=system, max_tokens=max_tokens)
    except Exception as exc:
        logger.warning("AI completion failed: %s", exc)
        raise
    return None


def generate_narrative(context: dict[str, Any]) -> str | None:
    user_prompt = (
        "Write slide bullets interpreting this survey analysis data.\n\n"
        f"```json\n{json.dumps(context, ensure_ascii=False, indent=2)}\n```"
    )
    return complete_custom(user_prompt, system=SYSTEM_PROMPT, max_tokens=512)


def generate_slide_plan(sections: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Return slide plan items: section_id, title, bullets, speaker_notes."""
    provider = settings.resolved_ai_provider
    if not provider:
        return []

    user_prompt = (
        "Create a slide plan for this multi-section research report.\n\n"
        f"```json\n{json.dumps({'sections': sections}, ensure_ascii=False, indent=2)}\n```"
    )

    if provider == "anthropic":
        raw = _anthropic_complete(user_prompt, system=SLIDE_PLAN_SYSTEM_PROMPT, max_tokens=2048)
    elif provider == "azure":
        raw = _azure_complete(user_prompt, system=SLIDE_PLAN_SYSTEM_PROMPT, max_tokens=2048)
    else:
        return []

    return _parse_slide_plan(raw, sections)


def _parse_slide_plan(raw: str, sections: list[dict[str, Any]]) -> list[dict[str, Any]]:
    text = raw.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        logger.warning("Slide plan JSON parse failed: %s", raw[:200])
        return _fallback_slide_plan(sections)

    slides = data.get("slides") if isinstance(data, dict) else None
    if not isinstance(slides, list):
        return _fallback_slide_plan(sections)

    by_id = {str(s.get("section_id")): s for s in slides if isinstance(s, dict)}
    out: list[dict[str, Any]] = []
    for sec in sections:
        sid = str(sec.get("section_id") or "")
        item = by_id.get(sid) or {}
        bullets = item.get("bullets") if isinstance(item.get("bullets"), list) else []
        out.append(
            {
                "section_id": sid,
                "title": str(item.get("title") or sec.get("label") or "Slide"),
                "bullets": [str(b).strip() for b in bullets if str(b).strip()],
                "speaker_notes": str(item.get("speaker_notes") or "").strip(),
            }
        )
    return out


def _fallback_slide_plan(sections: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        {
            "section_id": str(s.get("section_id") or ""),
            "title": str(s.get("label") or "Slide"),
            "bullets": [],
            "speaker_notes": "",
        }
        for s in sections
    ]


def _anthropic_complete(user_prompt: str, *, system: str = SYSTEM_PROMPT, max_tokens: int = 512) -> str:
    return _anthropic_chat([{"role": "user", "content": user_prompt}], system=system, max_tokens=max_tokens)


def _anthropic_chat(
    messages: list[dict[str, str]],
    *,
    system: str = SYSTEM_PROMPT,
    max_tokens: int = 512,
) -> str:
    key = settings.anthropic_api_key
    model = settings.anthropic_model
    with httpx.Client(timeout=90.0) as client:
        res = client.post(
            "https://api.anthropic.com/v1/messages",
            headers={
                "x-api-key": key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            json={
                "model": model,
                "max_tokens": max_tokens,
                "system": system,
                "messages": messages,
            },
        )
        res.raise_for_status()
        data = res.json()
        parts = data.get("content") or []
        text = "".join(p.get("text", "") for p in parts if p.get("type") == "text")
        return text.strip()


def _azure_complete(user_prompt: str, *, system: str = SYSTEM_PROMPT, max_tokens: int = 512) -> str:
    return _azure_chat([{"role": "user", "content": user_prompt}], system=system, max_tokens=max_tokens)


def _azure_chat(
    messages: list[dict[str, str]],
    *,
    system: str = SYSTEM_PROMPT,
    max_tokens: int = 512,
) -> str:
    endpoint = settings.azure_openai_endpoint.rstrip("/")
    deployment = settings.azure_openai_deployment
    version = settings.azure_openai_api_version
    url = f"{endpoint}/openai/deployments/{deployment}/chat/completions?api-version={version}"
    with httpx.Client(timeout=90.0) as client:
        res = client.post(
            url,
            headers={"api-key": settings.azure_openai_api_key, "content-type": "application/json"},
            json={
                "messages": [{"role": "system", "content": system}, *messages],
                "max_tokens": max_tokens,
                "temperature": 0.3,
            },
        )
        res.raise_for_status()
        data = res.json()
        return (data["choices"][0]["message"]["content"] or "").strip()
