"""Gmail integration models."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from app.models.project_workflow import TaskCategory, TaskPriority


class GmailConnectionStatus(BaseModel):
    configured: bool
    connected: bool
    email: str | None = None
    last_sync_at: float | None = None
    message: str = ""


class GmailMessageSummary(BaseModel):
    id: str
    thread_id: str
    subject: str
    from_name: str
    from_email: str
    to_emails: list[str] = Field(default_factory=list)
    cc_emails: list[str] = Field(default_factory=list)
    snippet: str = ""
    internal_date: int | None = None
    is_unread: bool = False
    has_task: bool = False
    task_count: int = 0
    linked_survey_id: int | None = None
    linked_task_id: str | None = None
    email_url: str = ""


class GmailTaskSuggestion(BaseModel):
    title: str
    description: str = ""
    category: TaskCategory = "general"
    assignee: str | None = None
    priority: TaskPriority = "medium"
    confidence: Literal["high", "medium", "low"] = "medium"


class GmailTaskDraft(BaseModel):
    title: str
    note: str = ""
    category: TaskCategory = "general"
    assignee: str | None = None
    priority: TaskPriority = "medium"
    billable: bool = True
    project_related: bool = False
    survey_id: int | None = None
    confidence: Literal["high", "medium", "low"] = "medium"


class GmailProposalBriefHint(BaseModel):
    detected: bool = False
    project_name: str = ""
    client_name: str = ""
    assignee: str | None = None
    confidence: Literal["high", "medium", "low"] = "medium"


class GmailEmailBreakdown(BaseModel):
    gmail_message_id: str
    subject: str
    configured: bool
    tasks: list[GmailTaskDraft] = Field(default_factory=list)
    email_url: str = ""
    proposal_brief: GmailProposalBriefHint | None = None


class CreateTaskFromEmailItem(BaseModel):
    title: str
    note: str | None = None
    survey_id: int | None = None
    category: TaskCategory | None = None
    assignee: str | None = None
    priority: TaskPriority | None = None
    billable: bool = True


class CreatePipelineFromEmailRequest(BaseModel):
    project_name: str
    client_name: str | None = None
    owner_name: str | None = None
    project_type: Literal["quant", "qual", "mixed"] = "quant"
    engagement_type: Literal["tracking", "ad-hoc"] = "ad-hoc"
    create_tasks: bool = True
    tasks: list[CreateTaskFromEmailItem] = Field(default_factory=list)


class CreatePipelineFromEmailResponse(BaseModel):
    project_id: str
    project_name: str
    client_name: str | None = None
    owner_name: str | None = None
    assignee: str | None = None
    proposal_id: str | None = None
    tasks_created: int = 0
    operations_url: str = "/operations?tab=pipeline"
    email_url: str = ""


class CreateTaskFromEmailRequest(BaseModel):
    survey_id: int | None = None
    title: str | None = None
    description: str | None = None
    note: str | None = None
    category: TaskCategory | None = None
    assignee: str | None = None
    priority: TaskPriority | None = None
    due_date: str | None = None
    billable: bool | None = None


class CreateTasksFromEmailBatchRequest(BaseModel):
    tasks: list[CreateTaskFromEmailItem] = Field(default_factory=list)


class CreateTaskFromEmailResponse(BaseModel):
    survey_id: int | None
    task_id: str
    task_title: str
    assignee: str | None = None
    gmail_message_id: str
    survey_title: str = ""
    personal: bool = False
    billable: bool = True
    email_url: str = ""


class CreateTasksFromEmailBatchResponse(BaseModel):
    created: list[CreateTaskFromEmailResponse] = Field(default_factory=list)
    count: int = 0


class GmailMessageDetail(BaseModel):
    id: str
    thread_id: str
    subject: str
    from_name: str
    from_email: str
    to_emails: list[str] = Field(default_factory=list)
    cc_emails: list[str] = Field(default_factory=list)
    body_text: str = ""
    snippet: str = ""
    internal_date: int | None = None
    is_unread: bool = False
    message_id_header: str = ""
    has_task: bool = False
    task_count: int = 0
    email_url: str = ""


class GmailSendEmailRequest(BaseModel):
    to: str
    subject: str
    body_text: str
    reply_to_message_id: str | None = None
    scheduled_at: float | None = None


class GmailSendEmailResponse(BaseModel):
    ok: bool
    scheduled: bool = False
    scheduled_id: str | None = None
    scheduled_at: float | None = None
    gmail_message_id: str | None = None
    thread_id: str | None = None
    message: str = ""


class GmailScheduledSend(BaseModel):
    id: str
    to: str
    subject: str
    body_text: str
    scheduled_at: float
    status: Literal["pending", "sent", "overdue"] = "pending"
