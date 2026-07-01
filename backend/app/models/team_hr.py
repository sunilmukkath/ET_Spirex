"""Team / HR staff directory models."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from app.models.team_registry import GlobalRole

StaffStatus = Literal["active", "away", "inactive"]
LoadLevel = Literal["light", "balanced", "busy", "overloaded"]


class StaffProfile(BaseModel):
    username: str
    full_name: str = ""
    email: str = ""
    phone: str = ""
    job_title: str = ""
    department: str = "Research"
    location: str = ""
    employee_id: str = ""
    manager: str | None = None
    start_date: str | None = None
    notes: str = ""
    status: StaffStatus = "active"


class StaffProfileUpdate(BaseModel):
    full_name: str | None = None
    email: str | None = None
    phone: str | None = None
    job_title: str | None = None
    department: str | None = None
    location: str | None = None
    employee_id: str | None = None
    manager: str | None = None
    start_date: str | None = None
    notes: str | None = None
    status: StaffStatus | None = None


class StaffTaskPreview(BaseModel):
    task_id: str
    title: str
    priority: str = "medium"
    status: str = "todo"
    category: str = "general"
    due_date: str | None = None
    personal: bool = False
    survey_id: int | None = None
    survey_title: str = ""


class StaffWorkload(BaseModel):
    open_tasks: int = 0
    high_priority: int = 0
    personal_tasks: int = 0
    project_tasks: int = 0
    pm_projects_owned: int = 0
    load_level: LoadLevel = "light"
    load_label: str = "Light load"


class StaffMemberOut(BaseModel):
    profile: StaffProfile
    role: GlobalRole = "member"
    scout_id: str = ""
    workload: StaffWorkload = Field(default_factory=StaffWorkload)
    open_tasks_preview: list[StaffTaskPreview] = Field(default_factory=list)


class TeamDirectoryOut(BaseModel):
    members: list[StaffMemberOut] = Field(default_factory=list)
    summary: dict[str, int | str] = Field(default_factory=dict)
