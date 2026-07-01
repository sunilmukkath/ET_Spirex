"""Tests for survey link matching agent."""

from uuid import uuid4

from app.models.pm import SurveyLinkSuggestion
from app.services.survey_link_agent import _heuristic_suggestions, _merge_suggestions


def test_heuristic_exact_title_match():
    pid = uuid4()
    projects = [
        {
            "project_id": str(pid),
            "project_name": "UK Brand Tracker Wave 3",
            "client_name": "Acme",
        }
    ]
    surveys = [{"id": 12345, "title": "UK Brand Tracker Wave 3"}]
    suggestions = _heuristic_suggestions(projects, surveys)
    assert len(suggestions) == 1
    assert suggestions[0].limesurvey_survey_id == 12345
    assert suggestions[0].confidence == "high"


def test_heuristic_client_keyword_match():
    pid = uuid4()
    projects = [
        {
            "project_id": str(pid),
            "project_name": "Q2 Ad Tracking",
            "client_name": "Nestlé",
        }
    ]
    surveys = [{"id": 99, "title": "Nestlé Ad Tracker 2024 Q2"}]
    suggestions = _heuristic_suggestions(projects, surveys)
    assert len(suggestions) == 1
    assert suggestions[0].limesurvey_survey_id == 99
    assert suggestions[0].confidence in ("medium", "high")


def test_merge_prefers_higher_confidence():
    pid = uuid4()
    low = SurveyLinkSuggestion(
        project_id=pid,
        project_name="Test",
        limesurvey_survey_id=1,
        survey_title="A",
        confidence="low",
        reason="low",
    )
    high = SurveyLinkSuggestion(
        project_id=pid,
        project_name="Test",
        limesurvey_survey_id=2,
        survey_title="B",
        confidence="high",
        reason="high",
    )
    merged = _merge_suggestions([low], [high])
    assert len(merged) == 1
    assert merged[0].confidence == "high"
    assert merged[0].limesurvey_survey_id == 2
