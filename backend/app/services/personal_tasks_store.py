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
) -> ProjectTask:
    now = time.time()
    owner = assignee or username
    task = ProjectTask(
        id=uuid.uuid4().hex[:12],
        title=title.strip(),
        description=description.strip(),
        category=category,
        assignee=owner,
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
