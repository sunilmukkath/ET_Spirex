from typing import Literal

from pydantic import BaseModel, Field

from app.models.team_registry import PROJECT_MODULES

ProjectRole = Literal["lead", "contributor"]
ProjectPhase = Literal[
    "proposal",
    "design",
    "pilot",
    "field",
    "analysis",
    "delivery",
    "closed",
]
StudyType = Literal["quant", "qual", "mixed"]
TaskCategory = Literal[
    "programming",
    "field",
    "research",
    "finance",
    "client_request",
    "general",
]
TaskStatus = Literal["todo", "in_progress", "blocked", "done"]
TaskPriority = Literal["low", "medium", "high"]


class ProjectMember(BaseModel):
    username: str
    project_role: ProjectRole = "contributor"
    is_project_manager: bool = False
    modules: list[str] = Field(default_factory=list)


class ProjectTask(BaseModel):
    id: str
    title: str
    description: str = ""
    category: TaskCategory = "general"
    assignee: str | None = None
    status: TaskStatus = "todo"
    priority: TaskPriority = "medium"
    due_date: str | None = None
    created_by: str | None = None
    created_at: float | None = None
    updated_at: float | None = None


class ProjectWorkflow(BaseModel):
    phase: ProjectPhase = "field"
    study_type: StudyType = "quant"
    client_name: str = ""
    project_code: str = ""
    target_field_start: str | None = None
    target_delivery: str | None = None
    members: list[ProjectMember] = Field(default_factory=list)
    tasks: list[ProjectTask] = Field(default_factory=list)
    notes: str = ""


def normalize_module_ids(raw: list[str] | None) -> list[str]:
    if not raw:
        return []
    allowed = set(PROJECT_MODULES)
    out: list[str] = []
    for item in raw:
        key = str(item).strip().lower()
        if key in allowed and key not in out:
            out.append(key)
    return out
