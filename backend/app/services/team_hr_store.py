"""Team directory — staff profiles, contact details, and workload."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from app.db.session import database_enabled, session_scope
from app.models.team_hr import (
    LoadLevel,
    StaffMemberOut,
    StaffProfile,
    StaffProfileUpdate,
    StaffTaskPreview,
    StaffWorkload,
    TeamDirectoryOut,
)
from app.models.team_registry import GlobalRole
from app.services.auth import VALID_USERS
from app.services.personal_tasks_store import list_personal_tasks
from app.services.project_workflow_store import get_project_workflow
from app.services.super_admin import email_for_username
from app.services.team_registry_store import get_global_role, get_team_registry

_DATA_DIR = Path(__file__).resolve().parents[2] / "data" / "team"
_STAFF_PATH = _DATA_DIR / "staff.json"

_WORKFLOW_DIR = Path(__file__).resolve().parents[2] / "data" / "workflows"

_DEFAULT_TITLES: dict[str, str] = {
    "Sunil": "Founder & Director",
    "Tony": "Operations Lead",
    "Ravi": "Research Manager",
    "Aneena": "Project Manager",
    "Shilaja": "Fieldwork Lead",
    "Palani": "Programming Lead",
    "Bagya": "Finance & Admin",
    "Ambika": "Project Manager",
    "Venisha": "Research Analyst",
    "Samara": "Research Analyst",
}


def _default_email(username: str) -> str:
    mapped = email_for_username(username)
    if mapped:
        return mapped
    slug = username.strip().lower()
    return f"{slug}@elastictree.com" if slug else ""


def _default_profile(username: str) -> StaffProfile:
    return StaffProfile(
        username=username,
        full_name=username,
        email=_default_email(username),
        phone="",
        job_title=_DEFAULT_TITLES.get(username, "Team member"),
        department="Research",
        location="Chennai",
        employee_id=f"ET-{username[:3].upper()}{len(username):02d}",
        manager="Sunil" if username != "Sunil" else None,
        status="active",
    )


def _load_staff_raw() -> dict[str, dict[str, Any]]:
    if not _STAFF_PATH.is_file():
        return {}
    try:
        raw = json.loads(_STAFF_PATH.read_text(encoding="utf-8"))
        if isinstance(raw, dict):
            return {str(k): v for k, v in raw.items() if isinstance(v, dict)}
    except (OSError, json.JSONDecodeError):
        pass
    return {}


def _save_staff_raw(data: dict[str, dict[str, Any]]) -> None:
    _DATA_DIR.mkdir(parents=True, exist_ok=True)
    _STAFF_PATH.write_text(json.dumps(data, indent=2), encoding="utf-8")


def get_staff_profile(username: str) -> StaffProfile | None:
    clean = username.strip()
    if clean not in VALID_USERS:
        return None
    raw = _load_staff_raw().get(clean)
    base = _default_profile(clean)
    if not raw:
        return base
    merged = base.model_dump()
    for key, value in raw.items():
        if key == "username":
            continue
        if value is not None:
            merged[key] = value
    return StaffProfile(**merged)


def update_staff_profile(username: str, body: StaffProfileUpdate) -> StaffProfile | None:
    clean = username.strip()
    if clean not in VALID_USERS:
        return None
    data = _load_staff_raw()
    current = get_staff_profile(clean)
    if not current:
        return None
    patch = body.model_dump(exclude_unset=True)
    updated = current.model_copy(update=patch)
    data[clean] = updated.model_dump()
    _save_staff_raw(data)
    return updated


def _survey_title(survey_id: int, workflow) -> str:
    client = (workflow.client_name or "").strip()
    code = (workflow.project_code or "").strip()
    if client and code:
        return f"{client} — {code}"
    if client:
        return client
    if code:
        return code
    return f"Survey {survey_id}"


def _collect_open_tasks(username: str) -> list[dict[str, Any]]:
    assignee = username.strip()
    if not assignee:
        return []
    rows: list[dict[str, Any]] = []

    if _WORKFLOW_DIR.is_dir():
        from app.services.project_workflow_store import _iter_workflow_refs, _load_workflow_file

        for ref, survey_id in _iter_workflow_refs():
            workflow = _load_workflow_file(ref.storage_path())
            for task in workflow.tasks:
                if (task.assignee or "").strip() != assignee or task.status == "done":
                    continue
                rows.append(
                    {
                        "task_id": task.id,
                        "title": task.title,
                        "priority": task.priority,
                        "status": task.status,
                        "category": task.category,
                        "due_date": task.due_date,
                        "personal": False,
                        "survey_id": survey_id,
                        "project_id": ref.project_id,
                        "survey_title": _survey_title(survey_id or 0, workflow),
                    }
                )

    if _DATA_DIR.parent.joinpath("personal_tasks").is_dir():
        seen_ids: set[str] = {str(row["task_id"]) for row in rows}
        for member in VALID_USERS:
            for task in list_personal_tasks(member, include_done=False):
                if (task.assignee or member).strip() != assignee:
                    continue
                if task.id in seen_ids:
                    continue
                seen_ids.add(task.id)
                rows.append(
                    {
                        "task_id": task.id,
                        "title": task.title,
                        "priority": task.priority,
                        "status": task.status,
                        "category": task.category,
                        "due_date": task.due_date,
                        "personal": True,
                        "survey_id": None,
                        "survey_title": "General activity",
                    }
                )

    rows.sort(
        key=lambda row: (
            0 if row.get("priority") == "high" else 1 if row.get("priority") == "medium" else 2,
            row.get("due_date") or "9999",
            str(row.get("title") or "").lower(),
        )
    )
    return rows


def _pm_projects_owned(username: str) -> int:
    if not database_enabled():
        return 0
    try:
        from sqlalchemy import select

        from app.db.models import Project

        with session_scope() as session:
            rows = session.scalars(select(Project)).all()
            count = 0
            for row in rows:
                owner = row.owner.name if row.owner else None
                if owner != username:
                    continue
                if str(row.stage or "").strip().lower() == "delivered":
                    continue
                count += 1
            return count
    except Exception:
        return 0


def _load_level(open_tasks: int, high_priority: int) -> tuple[LoadLevel, str]:
    if open_tasks >= 12 or high_priority >= 4:
        return "overloaded", "Overloaded"
    if open_tasks >= 8 or high_priority >= 3:
        return "busy", "Busy"
    if open_tasks >= 4 or high_priority >= 1:
        return "balanced", "Balanced"
    return "light", "Light load"


def build_workload(username: str) -> tuple[StaffWorkload, list[StaffTaskPreview]]:
    rows = _collect_open_tasks(username)
    high = sum(1 for row in rows if row.get("priority") == "high")
    personal = sum(1 for row in rows if row.get("personal"))
    project = len(rows) - personal
    pm_owned = _pm_projects_owned(username)
    level, label = _load_level(len(rows), high)
    workload = StaffWorkload(
        open_tasks=len(rows),
        high_priority=high,
        personal_tasks=personal,
        project_tasks=project,
        pm_projects_owned=pm_owned,
        load_level=level,
        load_label=label,
    )
    preview = [StaffTaskPreview(**row) for row in rows[:8]]
    return workload, preview


def _role_for(username: str) -> GlobalRole:
    return get_global_role(username)


def get_staff_member(username: str) -> StaffMemberOut | None:
    profile = get_staff_profile(username)
    if not profile:
        return None
    workload, preview = build_workload(username)
    return StaffMemberOut(
        profile=profile,
        role=_role_for(username),
        scout_id=profile.username,
        workload=workload,
        open_tasks_preview=preview,
    )


def get_team_directory() -> TeamDirectoryOut:
    registry = get_team_registry()
    role_map = {user.username: user.role for user in registry.users}
    members: list[StaffMemberOut] = []
    load_counts = {"light": 0, "balanced": 0, "busy": 0, "overloaded": 0}

    for username in sorted(VALID_USERS, key=str.lower):
        profile = get_staff_profile(username) or _default_profile(username)
        workload, preview = build_workload(username)
        load_counts[workload.load_level] += 1
        members.append(
            StaffMemberOut(
                profile=profile,
                role=role_map.get(username, _role_for(username)),
                scout_id=username,
                workload=workload,
                open_tasks_preview=preview,
            )
        )

    members.sort(
        key=lambda member: (
            {"overloaded": 0, "busy": 1, "balanced": 2, "light": 3}[member.workload.load_level],
            -member.workload.open_tasks,
            member.profile.username.lower(),
        )
    )

    total_open = sum(member.workload.open_tasks for member in members)
    return TeamDirectoryOut(
        members=members,
        summary={
            "headcount": len(members),
            "total_open_tasks": total_open,
            "overloaded": load_counts["overloaded"],
            "busy": load_counts["busy"],
            "balanced": load_counts["balanced"],
            "light": load_counts["light"],
        },
    )
