"""Tests for survey programming engine — ExpressionScript, validation, export."""

from app.models.et_survey import (
    EtAnswerOption,
    EtBlock,
    EtQuestion,
    EtQuotaRule,
    EtSurveyDefinition,
    EtSurveySettings,
)
from app.services.survey_logic.expression_engine import (
    EvaluationContext,
    evaluate_expression,
    interpolate_text,
    is_relevant,
)
from app.services.survey_logic.questionnaire_markdown import questionnaire_spec_markdown
from app.services.survey_logic.spss_export import export_to_spss_syntax
from app.services.survey_logic.validator import validate_survey_logic


def _sample_definition() -> EtSurveyDefinition:
    return EtSurveyDefinition(
        blocks=[
            EtBlock(
                id="b1",
                title="Screening",
                sort_order=0,
                questions=[
                    EtQuestion(
                        id="q1",
                        code="gender",
                        type="single",
                        text="Your gender?",
                        sort_order=0,
                        options=[
                            EtAnswerOption(code="1", label="Male"),
                            EtAnswerOption(code="2", label="Female"),
                        ],
                    ),
                    EtQuestion(
                        id="q2",
                        code="age",
                        type="numeric",
                        text="Your age?",
                        sort_order=1,
                        relevance_equation="gender == '1'",
                    ),
                ],
            )
        ],
        quotas=[
            EtQuotaRule(id="q_male", label="Male cap", expression="gender == '1'", target=100),
        ],
        settings=EtSurveySettings(),
    )


def test_evaluate_expression_if_and_compare():
    ctx = EvaluationContext(
        participant_responses={"gender": "1", "age": 25},
        panel_metadata={},
        system_variables={},
    )
    assert evaluate_expression("gender == '1'", ctx) is True
    assert evaluate_expression("if(gender == '1', 'Mr.', 'Ms.')", ctx) == "Mr."
    assert evaluate_expression("age > 18 and age < 65", ctx) is True
    assert evaluate_expression("sum(1, 2, 3)", ctx) == 6


def test_interpolate_text():
    ctx = EvaluationContext(
        participant_responses={"lastname": "Smith"},
        panel_metadata={},
        system_variables={},
    )
    out = interpolate_text("Hi {lastname}, welcome.", ctx)
    assert out == "Hi Smith, welcome."


def test_is_relevant_empty_true():
    ctx = EvaluationContext(participant_responses={}, panel_metadata={}, system_variables={})
    assert is_relevant(None, ctx) is True
    assert is_relevant("", ctx) is True


def test_validate_unknown_qcode():
    defn = _sample_definition()
    defn.blocks[0].questions[1].relevance_equation = "unknown_var == 1"
    report = validate_survey_logic(defn)
    assert report["has_errors"] is True
    assert any("Unknown Qcode" in d["message"] for d in report["diagnostics"])


def test_spss_export_has_syntax_and_csv():
    defn = _sample_definition()
    out = export_to_spss_syntax(defn, [{"response_id": "R1", "gender": "1", "age": 30}])
    assert "gender" in out["csv_data"]
    assert "VARIABLE LABELS" in out["spss_syntax"]
    assert "VALUE LABELS gender" in out["spss_syntax"]


def test_questionnaire_markdown_includes_logic():
    md = questionnaire_spec_markdown(_sample_definition(), title="Test study")
    assert "# Test study" in md
    assert "SHOW IF" in md
    assert "## Quotas" in md
