from __future__ import annotations

import json
import logging
from collections import Counter
import re
from typing import Any

from app.models.qual_asset import QualAsset
from app.services.ai_narrative import complete_custom

logger = logging.getLogger(__name__)

_STOPWORDS = frozenset(
    """
    a an the and or but if in on at to for of is are was were be been being
    i you he she it we they this that these those with as from by not no yes
    so very just about into than then them their there when what which who
    would could should have has had do does did will can may might also um uh
    like really well yeah okay ok its it's i'm don't didn't doesn't
    """.split()
)

QUAL_SUMMARY_SYSTEM = """You are a qualitative research analyst at Elastic Tree Consumer Insights.
Rules:
- Summarise themes grounded ONLY in the transcript excerpts provided.
- Use British English, professional tone.
- Structure: 3–5 theme headings, each with 2–3 bullet points quoting or paraphrasing respondents.
- Note limitations if sample is small.
- Return plain text with markdown-style ## headings for themes."""


def _top_terms(texts: list[str], limit: int = 12) -> list[dict[str, Any]]:
    counter: Counter[str] = Counter()
    for text in texts:
        for word in re.findall(r"[a-zA-Z']{4,}", text.lower()):
            if word not in _STOPWORDS:
                counter[word] += 1
    return [{"term": term, "count": count} for term, count in counter.most_common(limit)]


def _excerpt_chunks(assets: list[QualAsset], max_chars: int = 12_000) -> list[dict[str, Any]]:
    chunks: list[dict[str, Any]] = []
    used = 0
    for asset in assets:
        body = asset.content.strip()
        if not body:
            continue
        take = body[: max(0, min(len(body), max_chars - used))]
        if not take:
            break
        chunks.append(
            {
                "asset_id": asset.id,
                "title": asset.title,
                "asset_type": asset.asset_type,
                "respondent_id": asset.respondent_id,
                "excerpt": take,
            }
        )
        used += len(take)
        if used >= max_chars:
            break
    return chunks


def generate_qual_summary(
    assets: list[QualAsset],
    *,
    focus: str = "",
) -> dict[str, Any]:
    if not assets:
        return {
            "summary": "No qual material uploaded yet.",
            "themes": [],
            "top_terms": [],
            "ai_used": False,
            "asset_count": 0,
        }

    texts = [a.content for a in assets if a.content.strip()]
    top_terms = _top_terms(texts)
    excerpts = _excerpt_chunks(assets)

    context: dict[str, Any] = {
        "type": "qual_thematic",
        "asset_count": len(assets),
        "total_words": sum(a.word_count for a in assets),
        "focus": focus.strip() or None,
        "excerpts": excerpts,
        "top_terms": top_terms,
    }

    ai_text: str | None = None
    ai_used = False
    try:
        prompt = (
            "Produce a thematic summary for this qual study material.\n\n"
            f"```json\n{json.dumps(context, ensure_ascii=False, indent=2)}\n```"
        )
        ai_text = complete_custom(prompt, system=QUAL_SUMMARY_SYSTEM, max_tokens=1800)
        ai_used = bool(ai_text)
    except Exception as exc:
        logger.warning("Qual AI summary failed, using fallback: %s", exc)

    if not ai_text:
        ai_text = _fallback_summary(assets, top_terms, focus)

    return {
        "summary": ai_text.strip(),
        "themes": _parse_theme_headings(ai_text),
        "top_terms": top_terms,
        "ai_used": ai_used,
        "asset_count": len(assets),
    }


def _fallback_summary(
    assets: list[QualAsset],
    top_terms: list[dict[str, Any]],
    focus: str,
) -> str:
    lines = [
        f"## Overview",
        f"• {len(assets)} qual document(s), {sum(a.word_count for a in assets):,} words total.",
    ]
    if focus:
        lines.append(f"• Review focus: {focus}")
    if top_terms:
        terms = ", ".join(t["term"] for t in top_terms[:8])
        lines.append(f"• Frequent terms: {terms}.")
    lines.append("")
    lines.append("## Next steps")
    lines.append("• Configure AI (Anthropic or Azure OpenAI) in server settings for full thematic synthesis.")
    lines.append("• Tag sessions and mark status as reviewed/coded as you progress.")
    return "\n".join(lines)


def _parse_theme_headings(text: str) -> list[str]:
    themes: list[str] = []
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith("## "):
            themes.append(stripped[3:].strip())
        elif stripped.startswith("### "):
            themes.append(stripped[4:].strip())
    return themes[:12]
