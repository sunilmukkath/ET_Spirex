"""Pydantic schemas for the ET project management API."""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.models.project_requirements import ProjectRequirements

ProjectType = Literal["quant", "qual", "mixed"]
EngagementType = Literal["tracking", "ad-hoc"]
ProjectStage = Literal[
    "Proposal",
    "Budgeting",
    "Vendor Setup",
    "Deployment Prep",
    "Fieldwork/Data Collection",
    "QC",
    "Analysis",
    "Reporting",
    "Close-out",
    "Delivered",
]


class TeamMemberOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    member_id: UUID
    name: str
    role: str


class PmProjectCreate(BaseModel):
    project_name: str
    client_id: UUID | None = None
    project_type: ProjectType
    engagement_type: EngagementType
    stage: ProjectStage = "Proposal"
    owner_id: UUID | None = None
    owner_name: str | None = None
    limesurvey_survey_id: int | None = None
    start_date: date | None = None
    target_close_date: date | None = None
    actual_close_date: date | None = None
    budget_estimate: Decimal | None = None
    budget_actual: Decimal | None = None
    status_notes: str | None = None
    requirements: ProjectRequirements | None = None


class PmProjectUpdate(BaseModel):
    project_name: str | None = None
    client_id: UUID | None = None
    project_type: ProjectType | None = None
    engagement_type: EngagementType | None = None
    stage: ProjectStage | None = None
    owner_id: UUID | None = None
    owner_name: str | None = None
    limesurvey_survey_id: int | None = None
    start_date: date | None = None
    target_close_date: date | None = None
    actual_close_date: date | None = None
    budget_estimate: Decimal | None = None
    budget_actual: Decimal | None = None
    status_notes: str | None = None
    requirements: ProjectRequirements | None = None


class PmProjectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    project_id: UUID
    project_name: str
    client_id: UUID | None
    project_type: str
    engagement_type: str
    stage: str
    owner_id: UUID | None
    owner_name: str | None = None
    limesurvey_survey_id: int | None
    start_date: date | None
    target_close_date: date | None
    actual_close_date: date | None
    budget_estimate: Decimal | None
    budget_actual: Decimal | None
    status_notes: str | None
    requirements: ProjectRequirements | None = None
    created_at: datetime
    updated_at: datetime


class FieldworkEntryCreate(BaseModel):
    entry_date: date
    completes_today: int = 0
    cumulative_completes: int | None = None
    target_completes: int | None = None
    quota_cell: dict[str, Any] | None = None
    rejects_today: int = 0
    reject_reason: str | None = None
    flagged_for_qc: bool = False


class FieldworkEntryUpdate(BaseModel):
    entry_date: date | None = None
    completes_today: int | None = None
    cumulative_completes: int | None = None
    target_completes: int | None = None
    quota_cell: dict[str, Any] | None = None
    rejects_today: int | None = None
    reject_reason: str | None = None
    flagged_for_qc: bool | None = None


class FieldworkEntryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    entry_id: UUID
    project_id: UUID
    entry_date: date
    completes_today: int
    cumulative_completes: int
    target_completes: int | None
    quota_cell: dict[str, Any] | None
    rejects_today: int
    reject_reason: str | None
    flagged_for_qc: bool
    created_at: datetime
    updated_at: datetime


class QuotaCellSummary(BaseModel):
    cell_key: str
    label: str
    cumulative_completes: int
    target_completes: int | None
    pct_complete: float | None


class FieldworkDashboard(BaseModel):
    project_id: UUID
    project_name: str
    latest_entry_date: date | None
    cumulative_completes: int
    target_completes: int | None
    pct_complete: float | None
    rejects_today: int
    flagged_for_qc: bool
    quota_cells: list[QuotaCellSummary] = Field(default_factory=list)
    daily_series: list[FieldworkEntryOut] = Field(default_factory=list)


# --- Clients / CRM ---


class ClientCreate(BaseModel):
    client_name: str
    sector: str | None = None
    contact_person: str | None = None
    contact_email: str | None = None
    repeat_client: bool = False
    notes: str | None = None


class ClientUpdate(BaseModel):
    client_name: str | None = None
    sector: str | None = None
    contact_person: str | None = None
    contact_email: str | None = None
    repeat_client: bool | None = None
    notes: str | None = None


class ClientOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    client_id: UUID
    client_name: str
    sector: str | None
    contact_person: str | None
    contact_email: str | None
    repeat_client: bool
    notes: str | None
    created_at: datetime
    updated_at: datetime
    project_count: int = 0


# --- Proposals ---


class ProposalCreate(BaseModel):
    project_id: UUID
    methodology_summary: str | None = None
    sample_size: int | None = None
    budget_breakdown: dict[str, Any] | None = None
    status: Literal["draft", "sent", "approved", "revised"] = "draft"


class ProposalOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    proposal_id: UUID
    project_id: UUID
    version: int
    methodology_summary: str | None
    sample_size: int | None
    budget_breakdown: dict[str, Any] | None
    status: str
    sent_date: date | None
    approved_date: date | None
    created_at: datetime
    updated_at: datetime


# --- Finance ---


class BudgetLineCreate(BaseModel):
    project_id: UUID
    category: str
    estimated_cost: Decimal | None = None
    actual_cost: Decimal | None = None


class BudgetLineOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    line_id: UUID
    project_id: UUID
    category: str
    estimated_cost: Decimal | None
    actual_cost: Decimal | None
    invoice_id: UUID | None
    created_at: datetime
    updated_at: datetime


class InvoiceCreate(BaseModel):
    project_id: UUID
    client_id: UUID | None = None
    amount: Decimal
    invoice_date: date | None = None
    due_date: date | None = None
    paid_status: str = "pending"


class InvoiceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    invoice_id: UUID
    project_id: UUID
    client_id: UUID | None
    amount: Decimal
    invoice_date: date | None
    due_date: date | None
    paid_status: str
    payment_date: date | None
    created_at: datetime
    updated_at: datetime


class FinanceSummary(BaseModel):
    project_id: UUID
    project_name: str
    budget_estimate: Decimal | None
    budget_actual: Decimal | None
    total_estimated_lines: Decimal | None
    total_actual_lines: Decimal | None
    total_invoiced: Decimal | None
    total_paid: Decimal | None
    total_outstanding: Decimal | None
    margin_pct: float | None
    budget_lines: list[BudgetLineOut] = Field(default_factory=list)
    invoices: list[InvoiceOut] = Field(default_factory=list)


# --- Survey instruments / programming ---


class SurveyInstrumentCreate(BaseModel):
    project_id: UUID
    limesurvey_survey_id: int | None = None
    questionnaire_file_path: str | None = None
    pilot_status: str | None = None


class SurveyInstrumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    instrument_id: UUID
    project_id: UUID
    version: int
    limesurvey_survey_id: int | None
    questionnaire_file_path: str | None
    pilot_status: str | None
    approved_by: UUID | None
    approved_date: date | None
    created_at: datetime
    updated_at: datetime


class SurveyLinkOut(BaseModel):
    project_id: UUID
    project_name: str
    client_name: str | None
    stage: str
    limesurvey_survey_id: int | None
    survey_url: str | None = None


class LinkSurveyRequest(BaseModel):
    limesurvey_survey_id: int | None = None


# --- Marketing ---


class MarketingActivityCreate(BaseModel):
    client_id: UUID | None = None
    project_id: UUID | None = None
    activity_type: Literal["outreach", "campaign", "event", "nurture", "proposal_followup"]
    title: str
    status: Literal["planned", "active", "completed", "cancelled"] = "planned"
    owner_name: str | None = None
    due_date: date | None = None
    notes: str | None = None


class MarketingActivityOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    activity_id: UUID
    client_id: UUID | None
    project_id: UUID | None
    activity_type: str
    title: str
    status: str
    owner_name: str | None
    due_date: date | None
    notes: str | None
    created_at: datetime
    updated_at: datetime


# --- Pipeline ---


class PipelineProjectOut(PmProjectOut):
    client_name: str | None = None
    proposal_status: str | None = None
    has_survey_link: bool = False


class PipelineOverview(BaseModel):
    stages: list[dict[str, Any]]
    projects: list[PipelineProjectOut]
    unlinked_survey_ids: list[int] = Field(default_factory=list)


class PmImportRowResult(BaseModel):
    row_number: int
    project_name: str
    status: Literal["created", "skipped", "error"]
    project_id: UUID | None = None
    limesurvey_survey_id: int | None = None
    message: str | None = None


class PmImportResult(BaseModel):
    total_rows: int
    created: int
    skipped: int
    errors: int
    rows: list[PmImportRowResult] = Field(default_factory=list)


# --- Agent I/O ---


class AgentBriefRequest(BaseModel):
    project_id: UUID | None = None
    client_id: UUID | None = None
    context: str | None = None


class AgentBriefResponse(BaseModel):
    agent: str
    configured: bool
    summary: str
    actions: list[str] = Field(default_factory=list)
    risks: list[str] = Field(default_factory=list)


class AgentDraftSection(BaseModel):
    heading: str
    body: str


class AgentDraftResponse(BaseModel):
    agent: str
    configured: bool
    title: str
    draft_markdown: str
    sections: list[AgentDraftSection] = Field(default_factory=list)
    actions: list[str] = Field(default_factory=list)
