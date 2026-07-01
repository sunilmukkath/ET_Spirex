from typing import Literal

from pydantic import BaseModel, Field

from app.models.project_requirements import ProjectRequirements
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
TranslationStatus = Literal["not_started", "in_progress", "review", "complete"]
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
ActivityType = Literal[
    "phase_change",
    "task_created",
    "task_updated",
    "task_comment",
    "member_added",
    "member_removed",
    "note",
]


class TaskComment(BaseModel):
    id: str
    author: str
    body: str
    created_at: float


class ProjectActivity(BaseModel):
    id: str
    type: ActivityType
    message: str
    actor: str | None = None
    created_at: float
    task_id: str | None = None


class TranslationRow(BaseModel):
    id: str
    language: str
    label: str = ""
    status: TranslationStatus = "not_started"
    notes: str = ""
    updated_at: float | None = None


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
    comments: list[TaskComment] = Field(default_factory=list)
    source: Literal["manual", "email", "pilot"] = "manual"
    gmail_message_id: str | None = None
    gmail_thread_id: str | None = None


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
    activities: list[ProjectActivity] = Field(default_factory=list)
    translations: list[TranslationRow] = Field(default_factory=list)
    pilot_tasks_seeded: bool = False
    requirements: ProjectRequirements = Field(default_factory=ProjectRequirements)


MAX_ACTIVITIES = 200


class ProjectActivityCreate(BaseModel):
    message: str


class TaskCommentCreate(BaseModel):
    body: str


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
