from __future__ import annotations

import json
import time
import uuid
from pathlib import Path
from typing import Any

from app.models.project_workflow import (
    ProjectMember,
    ProjectTask,
    ProjectWorkflow,
    normalize_module_ids,
)
from app.models.team_registry import PROJECT_MODULES
from app.services.team_registry_store import get_global_role, is_global_admin, is_global_manager_or_above

_DATA_DIR = Path(__file__).resolve().parents[2] / "data" / "project_workflow"


def _path(survey_id: int) -> Path:
    _DATA_DIR.mkdir(parents=True, exist_ok=True)
    return _DATA_DIR / f"{survey_id}.json"


def _normalize_task(raw: dict[str, Any]) -> ProjectTask | None:
    title = str(raw.get("title") or "").strip()
    if not title:
        return None
    task_id = str(raw.get("id") or "").strip() or uuid.uuid4().hex[:12]
    category = str(raw.get("category") or "general").strip().lower()
    if category not in {
        "programming",
        "field",
        "research",
        "finance",
        "client_request",
        "general",
    }:
        category = "general"
    status = str(raw.get("status") or "todo").strip().lower()
    if status not in {"todo", "in_progress", "blocked", "done"}:
        status = "todo"
    priority = str(raw.get("priority") or "medium").strip().lower()
    if priority not in {"low", "medium", "high"}:
        priority = "medium"
    assignee = str(raw.get("assignee") or "").strip() or None
    due_date = str(raw.get("due_date") or "").strip() or None
    return ProjectTask(
        id=task_id,
        title=title,
        description=str(raw.get("description") or "").strip(),
        category=category,  # type: ignore[arg-type]
        assignee=assignee,
        status=status,  # type: ignore[arg-type]
        priority=priority,  # type: ignore[arg-type]
        due_date=due_date,
        created_by=str(raw.get("created_by") or "").strip() or None,
        created_at=float(raw["created_at"]) if raw.get("created_at") is not None else None,
        updated_at=float(raw["updated_at"]) if raw.get("updated_at") is not None else None,
    )


def _normalize_workflow(raw: dict[str, Any] | None) -> ProjectWorkflow:
    if not raw:
        return ProjectWorkflow()

    members: list[ProjectMember] = []
    seen_users: set[str] = set()
    for item in raw.get("members") or []:
        if not isinstance(item, dict):
            continue
        username = str(item.get("username") or "").strip()
        if not username or username in seen_users:
            continue
        seen_users.add(username)
        project_role = str(item.get("project_role") or "contributor").strip().lower()
        if project_role not in {"lead", "contributor"}:
            project_role = "contributor"
        members.append(
            ProjectMember(
                username=username,
                project_role=project_role,  # type: ignore[arg-type]
                is_project_manager=bool(item.get("is_project_manager")),
                modules=normalize_module_ids(item.get("modules")),
            )
        )

    tasks: list[ProjectTask] = []
    for item in raw.get("tasks") or []:
        if not isinstance(item, dict):
            continue
        task = _normalize_task(item)
        if task:
            tasks.append(task)

    tasks.sort(key=lambda t: (t.status != "done", t.due_date or "9999", t.title.lower()))

    return ProjectWorkflow(
        members=members,
        tasks=tasks,
        notes=str(raw.get("notes") or "").strip(),
    )


def get_project_workflow(survey_id: int) -> ProjectWorkflow:
    path = _path(survey_id)
    if not path.is_file():
        return ProjectWorkflow()
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return ProjectWorkflow()
    return _normalize_workflow(raw)


def set_project_workflow(survey_id: int, workflow: ProjectWorkflow) -> ProjectWorkflow:
    normalized = _normalize_workflow(workflow.model_dump())
    _path(survey_id).write_text(
        json.dumps(normalized.model_dump(), indent=2),
        encoding="utf-8",
    )
    return normalized


def _find_member(workflow: ProjectWorkflow, username: str | None) -> ProjectMember | None:
    if not username:
        return None
    for member in workflow.members:
        if member.username == username:
            return member
    return None


def is_project_manager(username: str | None, survey_id: int) -> bool:
    if is_global_admin(username):
        return True
    member = _find_member(get_project_workflow(survey_id), username)
    return bool(member and member.is_project_manager)


def can_manage_project_team(username: str | None, survey_id: int) -> bool:
    if is_global_admin(username) or is_global_manager_or_above(username):
        return True
    return is_project_manager(username, survey_id)


def can_access_module(username: str | None, survey_id: int, module: str) -> bool:
    key = str(module).strip().lower()
    if key not in PROJECT_MODULES:
        return False
    if is_global_admin(username):
        return True
    workflow = get_project_workflow(survey_id)
    member = _find_member(workflow, username)
    if not member:
        return is_global_manager_or_above(username)
    if member.is_project_manager or member.project_role == "lead":
        return True
    if not member.modules:
        return False
    return key in member.modules


def workflow_access_summary(username: str | None, survey_id: int) -> dict[str, Any]:
    workflow = get_project_workflow(survey_id)
    member = _find_member(workflow, username)
    global_role = get_global_role(username)
    manage_team = can_manage_project_team(username, survey_id)
    modules = (
        list(PROJECT_MODULES)
        if is_global_admin(username)
        or (member and (member.is_project_manager or member.project_role == "lead"))
        else (member.modules if member else [])
    )
    if is_global_manager_or_above(username) and not member:
        modules = list(PROJECT_MODULES)

    return {
        "username": username,
        "global_role": global_role,
        "is_project_manager": is_project_manager(username, survey_id),
        "can_manage_team": manage_team,
        "project_role": member.project_role if member else None,
        "modules": modules,
        "assigned_tasks": sum(1 for t in workflow.tasks if t.assignee == username and t.status != "done"),
        "open_tasks": sum(1 for t in workflow.tasks if t.status != "done"),
    }


def touch_task(
    task: ProjectTask,
    *,
    editor: str | None,
    is_new: bool = False,
) -> ProjectTask:
    now = time.time()
    data = task.model_dump()
    if is_new:
        data["created_by"] = editor
        data["created_at"] = now
    data["updated_at"] = now
    return ProjectTask(**data)
