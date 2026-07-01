"""AI questionnaire drafting for ET Survey Studio."""

from __future__ import annotations

import json
import re
from typing import Any

from app.models.et_survey import EtSurveyDefinition
from app.services.ai_narrative import ai_status, complete_custom

QUESTIONNAIRE_SYSTEM = """You are Elastic Tree's senior survey programmer drafting a quant questionnaire spec.
Rules:
- British English, clear respondent-facing wording, no jargon.
- Return valid JSON only (no markdown fences).
- Schema:
{
  "blocks": [
    {
      "id": "block_screener",
      "title": "Section title",
      "description": "",
      "sort_order": 0,
      "questions": [
        {
          "id": "q1",
          "code": "Q1",
          "type": "single|multi|dropdown|yes_no|scale|numeric|text|long_text|email|date|matrix|array_carousel|ranking|display",
          "text": "Question text",
          "help_text": "",
          "required": true,
          "sort_order": 0,
          "options": [{"code":"1","label":"...","sort_order":0}],
          "rows": [{"code":"R1","label":"...","sort_order":0}],
          "scale_min": 1,
          "scale_max": 5
        }
      ]
    }
  ]
}
- Use sensible codes Q1, Q2… and section blocks (Screener, Main, Demographics).
- Include display/instruction items where helpful.
- For matrix and array_carousel questions include rows and scale_min/scale_max (or options as column labels).
- Do not invent client names unless provided in context."""


def _parse_definition_json(raw: str) -> EtSurveyDefinition | None:
    text = raw.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return None
    if not isinstance(data, dict) or not isinstance(data.get("blocks"), list):
        return None
    try:
        base = EtSurveyDefinition(version=1)
        merged = {**base.model_dump(), **data}
        return EtSurveyDefinition.model_validate(merged)
    except Exception:
        return None


def _heuristic_definition(title: str, brief: str) -> EtSurveyDefinition:
    return EtSurveyDefinition.model_validate(
        {
            "version": 1,
            "blocks": [
                {
                    "id": "block_intro",
                    "title": "Introduction",
                    "sort_order": 0,
                    "questions": [
                        {
                            "id": "q_info",
                            "code": "INFO",
                            "type": "display",
                            "text": f"Thank you for taking part in {title}.",
                            "required": False,
                            "sort_order": 0,
                        }
                    ],
                },
                {
                    "id": "block_main",
                    "title": "Main questions",
                    "sort_order": 1,
                    "questions": [
                        {
                            "id": "q1",
                            "code": "Q1",
                            "type": "scale",
                            "text": "Overall, how satisfied are you?",
                            "required": True,
                            "sort_order": 0,
                            "scale_min": 1,
                            "scale_max": 5,
                        }
                    ],
                },
            ],
            "settings": EtSurveyDefinition().settings.model_dump(),
        }
    )


def run_questionnaire_agent(
    *,
    title: str,
    brief: str,
    language: str = "en",
) -> dict[str, Any]:
    configured = bool(ai_status().get("configured"))
    payload = {"survey_title": title, "language": language, "brief": brief}

    if configured:
        raw = complete_custom(
            f"Draft questionnaire JSON:\n\n```json\n{json.dumps(payload, indent=2)}\n```",
            system=QUESTIONNAIRE_SYSTEM,
            max_tokens=3500,
        )
        if raw:
            definition = _parse_definition_json(raw)
            if definition:
                return {
                    "configured": True,
                    "definition": definition.model_dump(),
                    "message": "AI questionnaire draft ready — review and edit before publishing.",
                }

    definition = _heuristic_definition(title, brief)
    return {
        "configured": False,
        "definition": definition.model_dump(),
        "message": "Template draft created. Set ANTHROPIC_API_KEY for AI-authored questionnaires.",
    }
