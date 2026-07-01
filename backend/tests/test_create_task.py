"""Manual task creation — project-linked and general."""

from app.services.personal_tasks_store import list_unassigned_personal_task_rows
from app.services.project_workflow_store import create_manual_task, list_my_tasks, list_unassigned_tasks


def test_create_general_unassigned_task(monkeypatch, tmp_path):
    personal_dir = tmp_path / "personal_tasks"
    personal_dir.mkdir()
    monkeypatch.setattr("app.services.personal_tasks_store._DATA_DIR", personal_dir)

    row = create_manual_task(
        "Sunil",
        {"title": "Check finance page", "survey_id": None, "assignee": None},
    )
    assert row["personal"] is True
    assert row["task"]["title"] == "Check finance page"
    assert row["task"]["assignee"] is None

    unassigned = list_unassigned_personal_task_rows()
    assert len(unassigned) == 1
    assert unassigned[0]["task"]["title"] == "Check finance page"


def test_create_general_assigned_task(monkeypatch, tmp_path):
    personal_dir = tmp_path / "personal_tasks"
    personal_dir.mkdir()
    workflow_dir = tmp_path / "project_workflow"
    workflow_dir.mkdir()
    monkeypatch.setattr("app.services.personal_tasks_store._DATA_DIR", personal_dir)
    monkeypatch.setattr("app.services.project_workflow_store._DATA_DIR", workflow_dir)

    create_manual_task(
        "Sunil",
        {"title": "Review deck", "survey_id": None, "assignee": "Aneena"},
    )
    mine = list_my_tasks("Aneena")
    personal = [r for r in mine if r.get("personal")]
    assert any(r["task"]["title"] == "Review deck" for r in personal)
