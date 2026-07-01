from __future__ import annotations

import json
import time
import uuid
from pathlib import Path
from typing import Any

from app.models.project_workflow import (
    ProjectActivity,
    ProjectMember,
    ProjectTask,
    ProjectWorkflow,
    TaskComment,
    TranslationRow,
    normalize_module_ids,
)
from app.models.project_requirements import requirements_from_raw
from app.services.team_registry_store import get_global_role, is_global_admin, is_global_manager_or_above

_DATA_DIR = Path(__file__).resolve().parents[2] / "data" / "project_workflow"


def _path(survey_id: int) -> Path:
    _DATA_DIR.mkdir(parents=True, exist_ok=True)
    return _DATA_DIR / f"{survey_id}.json"


def _normalize_comment(raw: dict[str, Any]) -> TaskComment | None:
    body = str(raw.get("body") or "").strip()
    if not body:
        return None
    comment_id = str(raw.get("id") or "").strip() or uuid.uuid4().hex[:12]
    author = str(raw.get("author") or "").strip() or "unknown"
    created_at = float(raw["created_at"]) if raw.get("created_at") is not None else time.time()
    return TaskComment(id=comment_id, author=author, body=body, created_at=created_at)


def _normalize_activity(raw: dict[str, Any]) -> ProjectActivity | None:
    message = str(raw.get("message") or "").strip()
    if not message:
        return None
    activity_id = str(raw.get("id") or "").strip() or uuid.uuid4().hex[:12]
    activity_type = str(raw.get("type") or "note").strip().lower()
    if activity_type not in {
        "phase_change",
        "task_created",
        "task_updated",
        "task_comment",
        "member_added",
        "member_removed",
        "note",
    }:
        activity_type = "note"
    created_at = float(raw["created_at"]) if raw.get("created_at") is not None else time.time()
    task_id = str(raw.get("task_id") or "").strip() or None
    actor = str(raw.get("actor") or "").strip() or None
    return ProjectActivity(
        id=activity_id,
        type=activity_type,  # type: ignore[arg-type]
        message=message,
        actor=actor,
        created_at=created_at,
        task_id=task_id,
    )


def _normalize_translation(raw: dict[str, Any]) -> TranslationRow | None:
    language = str(raw.get("language") or "").strip()
    if not language:
        return None
    row_id = str(raw.get("id") or "").strip() or uuid.uuid4().hex[:12]
    status = str(raw.get("status") or "not_started").strip().lower()
    if status not in {"not_started", "in_progress", "review", "complete"}:
        status = "not_started"
    updated_at = float(raw["updated_at"]) if raw.get("updated_at") is not None else None
    return TranslationRow(
        id=row_id,
        language=language,
        label=str(raw.get("label") or "").strip(),
        status=status,  # type: ignore[arg-type]
        notes=str(raw.get("notes") or "").strip(),
        updated_at=updated_at,
    )


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
    source = str(raw.get("source") or "manual").strip().lower()
    if source not in {"manual", "email", "pilot"}:
        source = "manual"
    gmail_message_id = str(raw.get("gmail_message_id") or "").strip() or None
    gmail_thread_id = str(raw.get("gmail_thread_id") or "").strip() or None
    comments: list[TaskComment] = []
    for item in raw.get("comments") or []:
        if isinstance(item, dict):
            comment = _normalize_comment(item)
            if comment:
                comments.append(comment)
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
        comments=comments,
        source=source,  # type: ignore[arg-type]
        gmail_message_id=gmail_message_id,
        gmail_thread_id=gmail_thread_id,
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

    phase = str(raw.get("phase") or "field").strip().lower()
    if phase not in {
        "proposal",
        "design",
        "pilot",
        "field",
        "analysis",
        "delivery",
        "closed",
    }:
        phase = "field"
    study_type = str(raw.get("study_type") or "quant").strip().lower()
    if study_type not in {"quant", "qual", "mixed"}:
        study_type = "quant"
    target_field_start = str(raw.get("target_field_start") or "").strip() or None
    target_delivery = str(raw.get("target_delivery") or "").strip() or None

    activities: list[ProjectActivity] = []
    for item in raw.get("activities") or []:
        if isinstance(item, dict):
            activity = _normalize_activity(item)
            if activity:
                activities.append(activity)
    activities.sort(key=lambda a: a.created_at, reverse=True)

    from app.models.project_workflow import MAX_ACTIVITIES

    if len(activities) > MAX_ACTIVITIES:
        activities = activities[:MAX_ACTIVITIES]

    translations: list[TranslationRow] = []
    for item in raw.get("translations") or []:
        if isinstance(item, dict):
            row = _normalize_translation(item)
            if row:
                translations.append(row)

    return ProjectWorkflow(
        phase=phase,  # type: ignore[arg-type]
        study_type=study_type,  # type: ignore[arg-type]
        client_name=str(raw.get("client_name") or "").strip(),
        project_code=str(raw.get("project_code") or "").strip(),
        target_field_start=target_field_start,
        target_delivery=target_delivery,
        members=members,
        tasks=tasks,
        notes=str(raw.get("notes") or "").strip(),
        activities=activities,
        translations=translations,
        pilot_tasks_seeded=bool(raw.get("pilot_tasks_seeded")),
        requirements=requirements_from_raw(raw.get("requirements")),
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


def set_project_workflow(
    survey_id: int,
    workflow: ProjectWorkflow,
    *,
    editor: str | None = None,
) -> ProjectWorkflow:
    from app.services.pilot_checklist import seed_pilot_tasks
    from app.services.workflow_activity import append_activities, diff_workflow_activities

    previous = get_project_workflow(survey_id)
    normalized = _normalize_workflow(workflow.model_dump())
    normalized = seed_pilot_tasks(normalized, editor=editor)
    events = diff_workflow_activities(previous, normalized, editor=editor)
    if events:
        normalized = append_activities(normalized, events)
    _path(survey_id).write_text(
        json.dumps(normalized.model_dump(), indent=2),
        encoding="utf-8",
    )
    return normalized


def add_manual_activity(survey_id: int, *, actor: str, message: str) -> ProjectWorkflow:
    from app.services.workflow_activity import _new_activity, append_activities

    workflow = get_project_workflow(survey_id)
    updated = append_activities(
        workflow,
        [_new_activity("note", message, actor=actor)],
    )
    _path(survey_id).write_text(
        json.dumps(updated.model_dump(), indent=2),
        encoding="utf-8",
    )
    return updated


def add_task_comment(
    survey_id: int,
    task_id: str,
    *,
    author: str,
    body: str,
) -> ProjectWorkflow:
    from app.services.workflow_activity import _new_activity, append_activities

    workflow = get_project_workflow(survey_id)
    text = body.strip()
    if not text:
        raise ValueError("Comment body required")

    found = False
    tasks: list[ProjectTask] = []
    for task in workflow.tasks:
        if task.id != task_id:
            tasks.append(task)
            continue
        found = True
        comment = TaskComment(
            id=uuid.uuid4().hex[:12],
            author=author,
            body=text,
            created_at=time.time(),
        )
        tasks.append(
            ProjectTask(
                **{
                    **task.model_dump(),
                    "comments": [*task.comments, comment],
                    "updated_at": time.time(),
                }
            )
        )
    if not found:
        raise ValueError("Task not found")

    data = workflow.model_dump()
    data["tasks"] = [t.model_dump() for t in tasks]
    interim = ProjectWorkflow(**data)
    task_title = next(t.title for t in interim.tasks if t.id == task_id)
    preview = text[:80] + ("…" if len(text) > 80 else "")
    updated = append_activities(
        interim,
        [
            _new_activity(
                "task_comment",
                f"Comment on “{task_title}”: {preview}",
                actor=author,
                task_id=task_id,
            )
        ],
    )
    _path(survey_id).write_text(
        json.dumps(updated.model_dump(), indent=2),
        encoding="utf-8",
    )
    return updated


def add_task_to_workflow(
    survey_id: int,
    task: ProjectTask,
    *,
    editor: str,
) -> tuple[ProjectWorkflow, ProjectTask]:
    from app.services.workflow_activity import _new_activity, append_activities

    workflow = get_project_workflow(survey_id)
    if task.gmail_message_id:
        for existing in workflow.tasks:
            if existing.gmail_message_id == task.gmail_message_id:
                raise ValueError("A task already exists for this email on this project.")

    created = touch_task(task, editor=editor, is_new=True)
    data = workflow.model_dump()
    data["tasks"] = [*(t.model_dump() for t in workflow.tasks), created.model_dump()]
    interim = ProjectWorkflow(**data)
    updated = append_activities(
        interim,
        [
            _new_activity(
                "task_created",
                f"Task created: “{created.title}”"
                + (f" → {created.assignee}" if created.assignee else "")
                + (" (from email)" if created.source == "email" else ""),
                actor=editor,
                task_id=created.id,
            )
        ],
    )
    _path(survey_id).write_text(
        json.dumps(updated.model_dump(), indent=2),
        encoding="utf-8",
    )
    saved_task = next(t for t in updated.tasks if t.id == created.id)
    return updated, saved_task


def list_my_tasks(username: str) -> list[dict[str, Any]]:
    if not username:
        return []
    out: list[dict[str, Any]] = []
    if _DATA_DIR.is_dir():
        for path in sorted(_DATA_DIR.glob("*.json")):
            try:
                survey_id = int(path.stem)
            except ValueError:
                continue
            workflow = get_project_workflow(survey_id)
            for task in workflow.tasks:
                if task.assignee != username or task.status == "done":
                    continue
                out.append(_task_row(survey_id, workflow, task))
    from app.services.personal_tasks_store import list_personal_task_rows

    out.extend(list_personal_task_rows(username))
    out.sort(
        key=lambda row: (
            row["task"].get("due_date") or "9999",
            row["task"].get("title", "").lower(),
        )
    )
    return out


def list_unassigned_tasks() -> list[dict[str, Any]]:
    """Open tasks with no assignee — team inbox for new work."""
    out: list[dict[str, Any]] = []
    if not _DATA_DIR.is_dir():
        return []
    for path in sorted(_DATA_DIR.glob("*.json")):
        try:
            survey_id = int(path.stem)
        except ValueError:
            continue
        workflow = get_project_workflow(survey_id)
        for task in workflow.tasks:
            if task.assignee or task.status == "done":
                continue
            out.append(_task_row(survey_id, workflow, task))
    out.sort(
        key=lambda row: (
            -(row["task"].get("created_at") or 0),
            row["task"].get("title", "").lower(),
        )
    )
    return out


def list_team_assigned_tasks(viewer_username: str | None) -> list[dict[str, Any]]:
    """Open tasks assigned to a teammate (not the viewer)."""
    viewer = (viewer_username or "").strip()
    out: list[dict[str, Any]] = []
    if not _DATA_DIR.is_dir():
        return []
    for path in sorted(_DATA_DIR.glob("*.json")):
        try:
            survey_id = int(path.stem)
        except ValueError:
            continue
        workflow = get_project_workflow(survey_id)
        for task in workflow.tasks:
            assignee = (task.assignee or "").strip()
            if not assignee or assignee == viewer or task.status == "done":
                continue
            out.append(_task_row(survey_id, workflow, task))
    out.sort(
        key=lambda row: (
            (row["task"].get("assignee") or "").lower(),
            row["task"].get("due_date") or "9999",
            row["task"].get("title", "").lower(),
        )
    )
    return out


def _task_row(survey_id: int, workflow: ProjectWorkflow, task: ProjectTask) -> dict[str, Any]:
    return {
        "survey_id": survey_id,
        "task": task.model_dump(),
        "phase": workflow.phase,
        "client_name": workflow.client_name,
        "project_code": workflow.project_code,
    }


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
