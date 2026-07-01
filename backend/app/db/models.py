"""SQLAlchemy ORM models for the ET project management spine."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship
from sqlalchemy.types import JSON


class Base(DeclarativeBase):
    pass


def _uuid_pk() -> Mapped[uuid.UUID]:
    return mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)


def _json_type():
    return JSON().with_variant(JSONB, "postgresql")


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class TeamMember(Base, TimestampMixin):
    __tablename__ = "team_members"

    member_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    role: Mapped[str] = mapped_column(String(80), nullable=False, default="researcher")
    active_project_ids: Mapped[list[Any]] = mapped_column(_json_type(), default=list)

    owned_projects: Mapped[list["Project"]] = relationship(back_populates="owner")


class Client(Base, TimestampMixin):
    __tablename__ = "clients"

    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    client_name: Mapped[str] = mapped_column(String(255), nullable=False)
    sector: Mapped[str | None] = mapped_column(String(80))
    contact_person: Mapped[str | None] = mapped_column(String(120))
    contact_email: Mapped[str | None] = mapped_column(String(255))
    repeat_client: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)

    projects: Mapped[list["Project"]] = relationship(back_populates="client")


class Project(Base, TimestampMixin):
    __tablename__ = "projects"

    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    project_name: Mapped[str] = mapped_column(String(255), nullable=False)
    client_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.client_id", ondelete="SET NULL")
    )
    project_type: Mapped[str] = mapped_column(String(20), nullable=False)
    engagement_type: Mapped[str] = mapped_column(String(20), nullable=False)
    stage: Mapped[str] = mapped_column(String(80), nullable=False, default="Proposal")
    owner_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("team_members.member_id", ondelete="SET NULL")
    )
    limesurvey_survey_id: Mapped[int | None] = mapped_column(Integer, unique=True)
    start_date: Mapped[date | None] = mapped_column(Date)
    target_close_date: Mapped[date | None] = mapped_column(Date)
    actual_close_date: Mapped[date | None] = mapped_column(Date)
    budget_estimate: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    budget_actual: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    status_notes: Mapped[str | None] = mapped_column(Text)
    requirements: Mapped[dict[str, Any] | None] = mapped_column(_json_type())

    client: Mapped[Client | None] = relationship(back_populates="projects")
    owner: Mapped[TeamMember | None] = relationship(back_populates="owned_projects")
    fieldwork_entries: Mapped[list["FieldworkProgress"]] = relationship(
        back_populates="project", cascade="all, delete-orphan"
    )


class Vendor(Base, TimestampMixin):
    __tablename__ = "vendors"

    vendor_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    vendor_name: Mapped[str] = mapped_column(String(255), nullable=False)
    vendor_type: Mapped[str] = mapped_column(String(40), nullable=False)
    contact_info: Mapped[str | None] = mapped_column(Text)
    rate_card: Mapped[dict[str, Any] | None] = mapped_column(_json_type())
    linked_project_ids: Mapped[list[Any]] = mapped_column(_json_type(), default=list)


class Proposal(Base, TimestampMixin):
    __tablename__ = "proposals"

    proposal_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.project_id", ondelete="CASCADE"), nullable=False
    )
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    methodology_summary: Mapped[str | None] = mapped_column(Text)
    sample_size: Mapped[int | None] = mapped_column(Integer)
    budget_breakdown: Mapped[dict[str, Any] | None] = mapped_column(_json_type())
    status: Mapped[str] = mapped_column(String(20), default="draft", nullable=False)
    sent_date: Mapped[date | None] = mapped_column(Date)
    approved_date: Mapped[date | None] = mapped_column(Date)


class BudgetLineItem(Base, TimestampMixin):
    __tablename__ = "budget_line_items"

    line_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.project_id", ondelete="CASCADE"), nullable=False
    )
    category: Mapped[str] = mapped_column(String(80), nullable=False)
    estimated_cost: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    actual_cost: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))
    invoice_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("invoices.invoice_id", ondelete="SET NULL")
    )


class Invoice(Base, TimestampMixin):
    __tablename__ = "invoices"

    invoice_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.project_id", ondelete="CASCADE"), nullable=False
    )
    client_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.client_id", ondelete="SET NULL")
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    invoice_date: Mapped[date | None] = mapped_column(Date)
    due_date: Mapped[date | None] = mapped_column(Date)
    paid_status: Mapped[str] = mapped_column(String(40), default="pending", nullable=False)
    payment_date: Mapped[date | None] = mapped_column(Date)


class SurveyInstrument(Base, TimestampMixin):
    __tablename__ = "survey_instruments"

    instrument_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.project_id", ondelete="CASCADE"), nullable=False
    )
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    limesurvey_survey_id: Mapped[int | None] = mapped_column(Integer)
    questionnaire_file_path: Mapped[str | None] = mapped_column(Text)
    pilot_status: Mapped[str | None] = mapped_column(String(40))
    approved_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("team_members.member_id", ondelete="SET NULL")
    )
    approved_date: Mapped[date | None] = mapped_column(Date)


class DiscussionGuide(Base, TimestampMixin):
    __tablename__ = "discussion_guides"

    guide_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.project_id", ondelete="CASCADE"), nullable=False
    )
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    guide_file_path: Mapped[str | None] = mapped_column(Text)
    target_respondent_profile: Mapped[str | None] = mapped_column(Text)
    approved_status: Mapped[str | None] = mapped_column(String(40))


class Recruitment(Base, TimestampMixin):
    __tablename__ = "recruitment"

    recruitment_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.project_id", ondelete="CASCADE"), nullable=False
    )
    target_quota: Mapped[dict[str, Any]] = mapped_column(_json_type(), default=dict)
    recruited_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    screener_pass_rate: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    recruiter_vendor_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("vendors.vendor_id", ondelete="SET NULL")
    )


class FieldworkProgress(Base, TimestampMixin):
    __tablename__ = "fieldwork_progress"

    entry_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.project_id", ondelete="CASCADE"), nullable=False
    )
    entry_date: Mapped[date] = mapped_column(Date, nullable=False)
    completes_today: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    cumulative_completes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    target_completes: Mapped[int | None] = mapped_column(Integer)
    quota_cell: Mapped[dict[str, Any] | None] = mapped_column(_json_type())
    rejects_today: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    reject_reason: Mapped[str | None] = mapped_column(Text)
    flagged_for_qc: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    project: Mapped[Project] = relationship(back_populates="fieldwork_entries")


class QcCheck(Base, TimestampMixin):
    __tablename__ = "qc_checks"

    check_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.project_id", ondelete="CASCADE"), nullable=False
    )
    check_type: Mapped[str] = mapped_column(String(80), nullable=False)
    respondent_id: Mapped[str | None] = mapped_column(String(120))
    result: Mapped[str] = mapped_column(String(20), nullable=False)
    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("team_members.member_id", ondelete="SET NULL")
    )
    review_date: Mapped[date | None] = mapped_column(Date)


class Transcript(Base, TimestampMixin):
    __tablename__ = "transcripts"

    transcript_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.project_id", ondelete="CASCADE"), nullable=False
    )
    respondent_id: Mapped[str | None] = mapped_column(String(120))
    session_type: Mapped[str | None] = mapped_column(String(10))
    city: Mapped[str | None] = mapped_column(String(120))
    upload_date: Mapped[date | None] = mapped_column(Date)
    file_path: Mapped[str | None] = mapped_column(Text)
    transcription_status: Mapped[str | None] = mapped_column(String(20))
    language: Mapped[str | None] = mapped_column(String(40))


class Theme(Base, TimestampMixin):
    __tablename__ = "themes"

    theme_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.project_id", ondelete="CASCADE"), nullable=False
    )
    theme_label: Mapped[str] = mapped_column(String(255), nullable=False)
    theme_description: Mapped[str | None] = mapped_column(Text)
    transcript_ids: Mapped[list[Any]] = mapped_column(_json_type(), default=list)
    auto_classified: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    confidence_score: Mapped[Decimal | None] = mapped_column(Numeric(5, 4))
    reviewed_by_human: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class AnalysisOutput(Base, TimestampMixin):
    __tablename__ = "analysis_outputs"

    output_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.project_id", ondelete="CASCADE"), nullable=False
    )
    output_type: Mapped[str] = mapped_column(String(80), nullable=False)
    file_path: Mapped[str | None] = mapped_column(Text)
    dashboard_url: Mapped[str | None] = mapped_column(Text)
    generated_date: Mapped[date | None] = mapped_column(Date)
    generated_by: Mapped[str | None] = mapped_column(String(80))


class Report(Base, TimestampMixin):
    __tablename__ = "reports"

    report_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.project_id", ondelete="CASCADE"), nullable=False
    )
    report_type: Mapped[str] = mapped_column(String(80), nullable=False)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    file_path: Mapped[str | None] = mapped_column(Text)
    template_used: Mapped[str | None] = mapped_column(String(120))
    sent_to_client_date: Mapped[date | None] = mapped_column(Date)


class MarketingActivity(Base, TimestampMixin):
    __tablename__ = "marketing_activities"

    activity_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    client_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.client_id", ondelete="SET NULL")
    )
    project_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.project_id", ondelete="SET NULL")
    )
    activity_type: Mapped[str] = mapped_column(String(40), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="planned", nullable=False)
    owner_name: Mapped[str | None] = mapped_column(String(120))
    due_date: Mapped[date | None] = mapped_column(Date)
    notes: Mapped[str | None] = mapped_column(Text)


class EtSurvey(Base, TimestampMixin):
    """ET Scout native survey instrument (replaces LimeSurvey programming over time)."""

    __tablename__ = "et_surveys"

    workspace_id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=False)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="draft", nullable=False)
    language: Mapped[str] = mapped_column(String(20), default="en", nullable=False)
    public_slug: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    definition: Mapped[dict[str, Any]] = mapped_column(_json_type(), default=dict)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    created_by: Mapped[str] = mapped_column(String(120), nullable=False)

    responses: Mapped[list["EtSurveyResponse"]] = relationship(
        back_populates="survey", cascade="all, delete-orphan"
    )


class EtSurveyResponse(Base, TimestampMixin):
    __tablename__ = "et_survey_responses"

    response_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    workspace_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("et_surveys.workspace_id", ondelete="CASCADE"), nullable=False
    )
    answers: Mapped[dict[str, Any]] = mapped_column(_json_type(), default=dict)
    complete: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    survey: Mapped[EtSurvey] = relationship(back_populates="responses")
