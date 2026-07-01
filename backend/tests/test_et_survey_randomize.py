"""Tests for ET survey randomize_code model fields."""

from app.models.et_survey import EtBlock, EtMatrixRow, EtQuestion, EtSurveyDefinition


def test_randomize_code_fields_optional_on_load():
    """Legacy definitions without randomize_code still parse."""
    definition = EtSurveyDefinition.model_validate(
        {
            "version": 1,
            "blocks": [
                {
                    "id": "b1",
                    "title": "Main",
                    "sort_order": 0,
                    "questions": [
                        {
                            "id": "q1",
                            "code": "Q1",
                            "type": "matrix",
                            "text": "Rate",
                            "sort_order": 0,
                            "rows": [{"code": "R1", "label": "A", "sort_order": 0}],
                        }
                    ],
                }
            ],
        }
    )
    assert definition.blocks[0].randomize_code == ""
    assert definition.blocks[0].questions[0].randomize_code == ""
    assert definition.blocks[0].questions[0].rows[0].randomize_code == ""


def test_randomize_code_persists():
    definition = EtSurveyDefinition(
        version=1,
        blocks=[
            EtBlock(
                id="b1",
                title="A",
                sort_order=0,
                randomize_code="G1",
                questions=[
                    EtQuestion(
                        id="q1",
                        code="Q1",
                        type="array_carousel",
                        text="Items",
                        sort_order=0,
                        randomize_code="Q1",
                        rows=[
                            EtMatrixRow(code="R1", label="One", sort_order=0, randomize_code="S1"),
                            EtMatrixRow(code="R2", label="Two", sort_order=1, randomize_code="S1"),
                        ],
                    )
                ],
            )
        ],
    )
    data = definition.model_dump()
    assert data["blocks"][0]["randomize_code"] == "G1"
    assert data["blocks"][0]["questions"][0]["randomize_code"] == "Q1"
    assert data["blocks"][0]["questions"][0]["rows"][0]["randomize_code"] == "S1"
