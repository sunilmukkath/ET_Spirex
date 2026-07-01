"""Tests for Scout task manager agent."""

from datetime import date, timedelta

from app.models.project_workflow import CreateTaskRequest
from app.services.project_workflow_store import create_manual_task, list_unassigned_tasks
from app.services.task_manager_agent import run_task_manager_agent
from app.services.task_manager_run_store import get_last_task_manager_run


def test_task_manager_heuristic_review(tmp_path, monkeypatch):
    wf_dir = tmp_path / "project_workflow"
    personal_dir = tmp_path / "personal_tasks"
    runs_dir = tmp_path / "agent_runs"
    wf_dir.mkdir()
    personal_dir.mkdir()
    runs_dir.mkdir()

    monkeypatch.setattr("app.services.project_workflow_store._DATA_DIR", wf_dir)
    monkeypatch.setattr("app.services.personal_tasks_store._DATA_DIR", personal_dir)
    monkeypatch.setattr("app.services.task_manager_run_store._DATA_DIR", runs_dir)
    monkeypatch.setattr("app.services.task_manager_run_store._LAST_RUN_PATH", runs_dir / "task_manager.json")
    monkeypatch.setattr("app.services.team_hr_store._WORKFLOW_DIR", wf_dir)

    create_manual_task(
        "Sunil",
        CreateTaskRequest(
            title="Unassigned follow-up",
            survey_id=None,
            assignee=None,
            due_date=(date.today() - timedelta(days=3)).isoformat(),
        ).model_dump(),
    )

    result = run_task_manager_agent(apply=True, username="Sunil", triggered_by="test")
    assert result.agent == "task_manager"
    assert result.unassigned_count >= 1
    assert result.applied is True
    assert get_last_task_manager_run() is not None

    remaining = list_unassigned_tasks()
    assert len(remaining) < 1 or any(
        (row["task"].get("assignee") or "").strip() for row in remaining
    )
