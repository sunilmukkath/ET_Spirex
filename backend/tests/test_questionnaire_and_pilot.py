from app.models.project_workflow import ProjectWorkflow
from app.services.pilot_checklist import seed_pilot_tasks
from app.services.project_workflow_store import _normalize_workflow
from app.services.questionnaire_spec import questionnaire_spec_docx, questionnaire_spec_excel


def test_pilot_checklist_seeds_once():
    workflow = ProjectWorkflow(phase="pilot")
    updated = seed_pilot_tasks(workflow, editor="Sunil")
    assert updated.pilot_tasks_seeded
    assert len(updated.tasks) == 4
    again = seed_pilot_tasks(updated, editor="Sunil")
    assert len(again.tasks) == 4


def test_translations_normalize():
    workflow = _normalize_workflow(
        {
            "translations": [
                {"language": "hi", "label": "Hindi", "status": "review", "notes": "Agency A"},
                {"language": "", "label": "skip"},
            ]
        }
    )
    assert len(workflow.translations) == 1
    assert workflow.translations[0].language == "hi"
    assert workflow.translations[0].status == "review"


def test_questionnaire_spec_exports():
    schema = {
        "variables": [
            {
                "id": "q1",
                "code": "Q1",
                "text": "Satisfaction?",
                "type_label": "List (radio)",
                "kind": "single",
                "group_id": 1,
                "group_title": "Main",
                "answer_options": [{"code": "1", "label": "Yes"}],
            }
        ],
        "groups": [{"id": 1, "title": "Main"}],
    }
    assert len(questionnaire_spec_excel(schema, title="Demo")) > 500
    assert len(questionnaire_spec_docx(schema, title="Demo")) > 500
