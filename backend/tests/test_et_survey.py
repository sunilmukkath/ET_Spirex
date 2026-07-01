"""Tests for ET native survey schema bridge."""

from app.models.et_survey import (
    EtAnswerOption,
    EtBlock,
    EtQuestion,
    EtSurveyDefinition,
    EtSurveySettings,
)
from app.services.et_survey_schema import build_et_survey_schema


def test_build_schema_from_definition(monkeypatch):
    definition = EtSurveyDefinition(
        version=1,
        settings=EtSurveySettings(),
        blocks=[
            EtBlock(
                id="b1",
                title="Main",
                sort_order=0,
                questions=[
                    EtQuestion(
                        id="q1",
                        code="Q1",
                        type="single",
                        text="Awareness?",
                        sort_order=0,
                        options=[
                            EtAnswerOption(code="1", label="Yes", sort_order=0),
                            EtAnswerOption(code="2", label="No", sort_order=1),
                        ],
                    ),
                ],
            )
        ],
    )

    class FakeSurvey:
        workspace_id = 9_000_001
        title = "Test"
        response_count = 0

    fake = FakeSurvey()
    fake.definition = definition

    monkeypatch.setattr(
        "app.services.et_survey_schema.get_et_survey",
        lambda _id: fake,
    )

    schema = build_et_survey_schema(9_000_001)
    assert schema["provider"] == "et"
    assert len(schema["variables"]) == 1
    assert schema["variables"][0]["code"] == "Q1"
    assert schema["variables"][0]["kind"] == "single"


def test_is_et_survey_id_range():
    from app.services.et_survey_registry import is_et_survey

    assert is_et_survey(9_000_000)
    assert not is_et_survey(12345)
