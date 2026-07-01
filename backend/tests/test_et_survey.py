"""Tests for ET native survey schema bridge."""

from app.models.et_survey import (
    EtAnswerOption,
    EtBlock,
    EtMatrixRow,
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


def test_array_carousel_schema_columns(monkeypatch):
    definition = EtSurveyDefinition(
        version=1,
        blocks=[
            EtBlock(
                id="b1",
                title="Battery",
                sort_order=0,
                questions=[
                    EtQuestion(
                        id="q_car",
                        code="QATTR",
                        type="array_carousel",
                        text="Rate each attribute",
                        sort_order=0,
                        rows=[EtMatrixRow(code="R1", label="Quality", sort_order=0)],
                        options=[
                            EtAnswerOption(code="1", label="Low", sort_order=0),
                            EtAnswerOption(code="5", label="High", sort_order=1),
                        ],
                    ),
                ],
            )
        ],
    )

    class FakeSurvey:
        workspace_id = 9_000_002
        title = "Carousel test"
        response_count = 0

    fake = FakeSurvey()
    fake.definition = definition

    monkeypatch.setattr("app.services.et_survey_schema.get_et_survey", lambda _id: fake)
    schema = build_et_survey_schema(9_000_002)
    var = schema["variables"][0]
    assert var["et_type"] == "array_carousel"
    assert var["columns"] == ["QATTR_R1"]


def test_gps_schema_columns(monkeypatch):
    definition = EtSurveyDefinition(
        version=1,
        blocks=[
            EtBlock(
                id="b1",
                title="Field",
                sort_order=0,
                questions=[
                    EtQuestion(
                        id="q_gps",
                        code="LOC",
                        type="gps",
                        text="Share location",
                        sort_order=0,
                    ),
                ],
            )
        ],
    )

    class FakeSurvey:
        workspace_id = 9_000_003
        title = "GPS test"
        response_count = 0

    fake = FakeSurvey()
    fake.definition = definition
    monkeypatch.setattr("app.services.et_survey_schema.get_et_survey", lambda _id: fake)
    schema = build_et_survey_schema(9_000_003)
    var = schema["variables"][0]
    assert var["kind"] == "location"
    assert var["lat_column"] == "LOCGPSLat"
    assert var["lng_column"] == "LOCGPSLng"


def test_flatten_gps_and_media_answers():
    from app.services.et_survey_responses import _flatten_answers

    schema = {
        "variables": [
            {"id": "q1", "code": "LOC", "et_type": "gps"},
            {"id": "q2", "code": "PIC", "et_type": "photo"},
        ]
    }
    row = _flatten_answers(
        {
            "q1": {"lat": 51.5, "lng": -0.12},
            "q2": {"url": "/api/collector/x/media/abc.jpg", "media_id": "abc.jpg"},
        },
        schema,
    )
    assert row["LOCGPSLat"] == 51.5
    assert row["LOCGPSLng"] == -0.12
    assert row["PIC"] == "/api/collector/x/media/abc.jpg"


def test_is_et_survey_id_range():
    from app.services.et_survey_registry import is_et_survey

    assert is_et_survey(9_000_000)
    assert not is_et_survey(12345)
