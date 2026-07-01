"""Task manager agent — periodic review and safe auto-updates."""

from __future__ import annotations

from pydantic import BaseModel, Field


class TaskManagerUpdate(BaseModel):
    task_id: str
    survey_id: int | None = None
    personal: bool = False
    field: str
    old_value: str | None = None
    new_value: str | None = None
    reason: str


class TaskManagerAgentRequest(BaseModel):
    apply: bool = False
    username: str | None = None


class TaskManagerAgentResponse(BaseModel):
    agent: str = "task_manager"
    configured: bool = False
    summary: str
    actions: list[str] = Field(default_factory=list)
    risks: list[str] = Field(default_factory=list)
    ran_at: float
    applied: bool = False
    updates: list[TaskManagerUpdate] = Field(default_factory=list)
    unassigned_count: int = 0
    overdue_count: int = 0
    stale_count: int = 0
    email_review_count: int = 0
    next_run_hint: str | None = None


class TaskAssignRequest(BaseModel):
    assignee: str
