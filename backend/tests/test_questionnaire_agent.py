"""Tests for AI questionnaire drafting."""

from app.services.questionnaire_agent import _heuristic_definition, _parse_definition_json, run_questionnaire_agent


def test_parse_definition_json_valid():
    raw = """{
      "blocks": [{
        "id": "block_main",
        "title": "Main",
        "sort_order": 0,
        "questions": [{
          "id": "q1",
          "code": "Q1",
          "type": "single",
          "text": "How often?",
          "required": true,
          "sort_order": 0,
          "options": [{"code": "1", "label": "Often", "sort_order": 0}]
        }]
      }]
    }"""
    definition = _parse_definition_json(raw)
    assert definition is not None
    assert definition.blocks[0].questions[0].code == "Q1"


def test_heuristic_definition_has_blocks():
    definition = _heuristic_definition("Brand Tracker", "UK adults brand awareness")
    assert len(definition.blocks) >= 2
    assert definition.blocks[0].questions[0].type == "display"


def test_run_questionnaire_agent_template_fallback(monkeypatch):
    monkeypatch.setattr(
        "app.services.questionnaire_agent.ai_status",
        lambda: {"configured": False},
    )
    result = run_questionnaire_agent(title="Demo", brief="Short tracker for FMCG brand")
    assert result["configured"] is False
    assert "blocks" in result["definition"]
    assert len(result["definition"]["blocks"]) >= 1
