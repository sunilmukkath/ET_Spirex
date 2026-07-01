"""Personal (non-project) tasks — billable admin, training, internal work, etc."""

from __future__ import annotations

import json
import time
import uuid
from pathlib import Path
from typing import Any

from app.models.project_workflow import ProjectTask, TaskCategory, TaskPriority

_DATA_DIR = Path(__file__).resolve().parents[2] / "data" / "personal_tasks"


def _path(username: str) -> Path:
    safe = "".join(c if c.isalnum() else "_" for c in username)
    _DATA_DIR.mkdir(parents=True, exist_ok=True)
    return _DATA_DIR / f"{safe}.json"


def _load(username: str) -> list[dict[str, Any]]:
    path = _path(username)
    if not path.is_file():
        return []
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
        return raw if isinstance(raw, list) else []
    except (OSError, json.JSONDecodeError):
        return []


def _save(username: str, tasks: list[dict[str, Any]]) -> None:
    _path(username).write_text(json.dumps(tasks, indent=2), encoding="utf-8")


def _iter_all_personal_tasks() -> list[tuple[str, ProjectTask]]:
    """Yield (owner_username, task) from every personal task file."""
    if not _DATA_DIR.is_dir():
        return []
    out: list[tuple[str, ProjectTask]] = []
    for path in sorted(_DATA_DIR.glob("*.json")):
        owner = path.stem
        for raw in _load(owner):
            try:
                out.append((owner, ProjectTask.model_validate(raw)))
            except Exception:
                continue
    return out


def list_personal_tasks(username: str, *, include_done: bool = False) -> list[ProjectTask]:
    rows = _load(username)
    out: list[ProjectTask] = []
    for raw in rows:
        try:
            task = ProjectTask.model_validate(raw)
        except Exception:
            continue
        if not include_done and task.status == "done":
            continue
        out.append(task)
    out.sort(key=lambda t: (t.due_date or "9999", t.title.lower()))
    return out


def create_personal_task(
    username: str,
    *,
    title: str,
    description: str = "",
    category: TaskCategory = "general",
    assignee: str | None = None,
    priority: TaskPriority = "medium",
    due_date: str | None = None,
    billable: bool = False,
    gmail_message_id: str | None = None,
    gmail_thread_id: str | None = None,
    default_assignee_to_owner: bool = True,
) -> ProjectTask:
    now = time.time()
    normalized_assignee = assignee.strip() if assignee else None
    if not normalized_assignee and default_assignee_to_owner:
        normalized_assignee = username
    task = ProjectTask(
        id=uuid.uuid4().hex[:12],
        title=title.strip(),
        description=description.strip(),
        category=category,
        assignee=normalized_assignee,
        status="todo",
        priority=priority,
        due_date=due_date,
        created_by=username,
        created_at=now,
        updated_at=now,
        source="email" if gmail_message_id else "manual",
        gmail_message_id=gmail_message_id,
        gmail_thread_id=gmail_thread_id,
        billable=billable,
    )
    rows = _load(username)
    rows.append(task.model_dump())
    _save(username, rows)
    return task


def list_personal_task_rows(username: str) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for task in list_personal_tasks(username):
        if task.assignee and task.assignee != username:
            continue
        rows.append(
            {
                "survey_id": None,
                "task": task.model_dump(),
                "phase": None,
                "client_name": "",
                "project_code": "",
                "personal": True,
            }
        )
    return rows


def list_assigned_personal_task_rows(username: str) -> list[dict[str, Any]]:
    """Personal tasks assigned to username (across all owners' files)."""
    rows: list[dict[str, Any]] = []
    seen: set[str] = set()
    for _owner, task in _iter_all_personal_tasks():
        if task.status == "done":
            continue
        if (task.assignee or "").strip() != username:
            continue
        if task.id in seen:
            continue
        seen.add(task.id)
        rows.append(
            {
                "survey_id": None,
                "task": task.model_dump(),
                "phase": None,
                "client_name": "",
                "project_code": "",
                "personal": True,
            }
        )
    return rows


def list_unassigned_personal_task_rows() -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    seen: set[str] = set()
    for _owner, task in _iter_all_personal_tasks():
        if task.status == "done":
            continue
        if (task.assignee or "").strip():
            continue
        if task.id in seen:
            continue
        seen.add(task.id)
        rows.append(
            {
                "survey_id": None,
                "task": task.model_dump(),
                "phase": None,
                "client_name": "",
                "project_code": "",
                "personal": True,
            }
        )
    return rows


def get_personal_task(username: str, task_id: str) -> ProjectTask | None:
    for raw in _load(username):
        if str(raw.get("id")) == task_id:
            try:
                return ProjectTask.model_validate(raw)
            except Exception:
                return None
    return None
