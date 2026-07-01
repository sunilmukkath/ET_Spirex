"""Tests for user preferences and project requirements."""

from app.models.project_requirements import ProjectRequirements, requirements_from_raw
from app.models.user_preferences import UserPreferences, UserPreferencesUpdate
from app.services.user_preferences_store import get_user_preferences, set_user_preferences


def test_user_preferences_defaults():
    prefs = get_user_preferences("test_user_prefs_a")
    assert prefs.dashboard_view_mode == "strips"
    assert prefs.default_completion_status == "complete"


def test_user_preferences_save_and_merge():
    username = "test_user_prefs_b"
    updated = set_user_preferences(
        username,
        UserPreferencesUpdate(dashboard_view_mode="table", ai_narrative_default=True),
    )
    assert updated.dashboard_view_mode == "table"
    assert updated.ai_narrative_default is True
    assert updated.dashboard_sort_key == "newest"
    loaded = get_user_preferences(username)
    assert loaded.model_dump() == updated.model_dump()


def test_requirements_from_raw():
    req = requirements_from_raw(
        {
            "summary": "Brand tracker",
            "objectives": "Measure awareness",
            "methodology": "",
        }
    )
    assert req.summary == "Brand tracker"
    assert req.objectives == "Measure awareness"
    assert req.methodology == ""


def test_requirements_model_roundtrip():
    req = ProjectRequirements(summary="Test", deliverables="Deck + tables")
    data = req.model_dump()
    again = ProjectRequirements.model_validate(data)
    assert again.summary == "Test"
    assert again.deliverables == "Deck + tables"
