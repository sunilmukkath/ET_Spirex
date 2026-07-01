"""PM operations — clients, finance, proposals, survey links, marketing, pipeline."""

from __future__ import annotations

from collections import defaultdict
from decimal import Decimal
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.config import settings
from app.db.models import (
    BudgetLineItem,
    Client,
    FieldworkProgress,
    Invoice,
    MarketingActivity,
    Project,
    Proposal,
    SurveyInstrument,
)
from app.services.pm_project_sort import sort_projects
from app.models.pm import (
    BudgetLineCreate,
    BudgetLineOut,
    ClientCreate,
    ClientOut,
    ClientUpdate,
    FinanceSummary,
    InvoiceCreate,
    InvoiceOut,
    MarketingActivityCreate,
    MarketingActivityOut,
    PipelineOverview,
    PipelineProjectOut,
    ProposalCreate,
    ProposalOut,
    SurveyInstrumentCreate,
    SurveyInstrumentOut,
    SurveyLinkOut,
)
from app.services.pm_store import project_to_out


def _decimal_sum(values: list[Decimal | None]) -> Decimal | None:
    nums = [v for v in values if v is not None]
    if not nums:
        return None
    return sum(nums, start=Decimal("0"))


def list_clients(session: Session) -> list[ClientOut]:
    rows = session.scalars(select(Client).order_by(Client.client_name)).all()
    counts = dict(
        session.execute(
            select(Project.client_id, func.count()).group_by(Project.client_id)
        ).all()
    )
    out: list[ClientOut] = []
    for row in rows:
        item = ClientOut.model_validate(row)
        item.project_count = int(counts.get(row.client_id, 0))
        out.append(item)
    return out


def create_client(session: Session, body: ClientCreate) -> ClientOut:
    row = Client(
        client_name=body.client_name.strip(),
        sector=body.sector,
        contact_person=body.contact_person,
        contact_email=body.contact_email,
        repeat_client=body.repeat_client,
        notes=body.notes,
    )
    session.add(row)
    session.flush()
    return ClientOut.model_validate(row)


def update_client(session: Session, client_id: UUID, body: ClientUpdate) -> Client | None:
    row = session.get(Client, client_id)
    if not row:
        return None
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(row, key, value)
    session.flush()
    return row


def list_proposals(session: Session, project_id: UUID | None = None) -> list[ProposalOut]:
    stmt = select(Proposal).order_by(Proposal.updated_at.desc())
    if project_id:
        stmt = stmt.where(Proposal.project_id == project_id)
    rows = session.scalars(stmt).all()
    return [ProposalOut.model_validate(r) for r in rows]


def create_proposal(session: Session, body: ProposalCreate) -> ProposalOut | None:
    if not session.get(Project, body.project_id):
        return None
    latest = session.scalar(
        select(func.max(Proposal.version)).where(Proposal.project_id == body.project_id)
    )
    version = int(latest or 0) + 1
    row = Proposal(
        project_id=body.project_id,
        version=version,
        methodology_summary=body.methodology_summary,
        sample_size=body.sample_size,
        budget_breakdown=body.budget_breakdown,
        status=body.status,
    )
    session.add(row)
    session.flush()
    return ProposalOut.model_validate(row)


def finance_summary(session: Session, project_id: UUID) -> FinanceSummary | None:
    project = session.get(Project, project_id)
    if not project:
        return None
    lines = session.scalars(
        select(BudgetLineItem).where(BudgetLineItem.project_id == project_id)
    ).all()
    invoices = session.scalars(
        select(Invoice).where(Invoice.project_id == project_id).order_by(Invoice.invoice_date.desc())
    ).all()
    line_out = [BudgetLineOut.model_validate(l) for l in lines]
    inv_out = [InvoiceOut.model_validate(i) for i in invoices]
    total_est = _decimal_sum([l.estimated_cost for l in lines])
    total_act = _decimal_sum([l.actual_cost for l in lines])
    total_inv = _decimal_sum([i.amount for i in invoices])
    paid = _decimal_sum([i.amount for i in invoices if i.paid_status == "paid"])
    outstanding = None
    if total_inv is not None and paid is not None:
        outstanding = total_inv - paid
    margin = None
    if project.budget_estimate and project.budget_actual and project.budget_estimate > 0:
        margin = float(
            (project.budget_estimate - project.budget_actual) / project.budget_estimate * 100
        )
    return FinanceSummary(
        project_id=project.project_id,
        project_name=project.project_name,
        budget_estimate=project.budget_estimate,
        budget_actual=project.budget_actual,
        project_value_inr=project.project_value_inr,
        fiscal_year=project.fiscal_year,
        billing_month=project.billing_month,
        total_estimated_lines=total_est,
        total_actual_lines=total_act,
        total_invoiced=total_inv,
        total_paid=paid,
        total_outstanding=outstanding,
        margin_pct=margin,
        budget_lines=line_out,
        invoices=inv_out,
    )


def create_budget_line(session: Session, body: BudgetLineCreate) -> BudgetLineOut | None:
    if not session.get(Project, body.project_id):
        return None
    row = BudgetLineItem(
        project_id=body.project_id,
        category=body.category.strip(),
        estimated_cost=body.estimated_cost,
        actual_cost=body.actual_cost,
    )
    session.add(row)
    session.flush()
    return BudgetLineOut.model_validate(row)


def create_invoice(session: Session, body: InvoiceCreate) -> InvoiceOut | None:
    if not session.get(Project, body.project_id):
        return None
    row = Invoice(
        project_id=body.project_id,
        client_id=body.client_id,
        amount=body.amount,
        invoice_date=body.invoice_date,
        due_date=body.due_date,
        paid_status=body.paid_status,
    )
    session.add(row)
    session.flush()
    return InvoiceOut.model_validate(row)


def list_survey_links(session: Session) -> list[SurveyLinkOut]:
    rows = sort_projects(
        session.scalars(
            select(Project).options(joinedload(Project.client))
        ).all()
    )
    base = settings.limesurvey_url.rstrip("/")
    out: list[SurveyLinkOut] = []
    for row in rows:
        client_name = row.client.client_name if row.client else None
        sid = row.limesurvey_survey_id
        survey_url = f"{base}/index.php/{sid}" if sid and base else None
        out.append(
            SurveyLinkOut(
                project_id=row.project_id,
                project_name=row.project_name,
                client_name=client_name,
                stage=row.stage,
                limesurvey_survey_id=sid,
                survey_url=survey_url,
            )
        )
    return out


def link_survey(
    session: Session, project_id: UUID, survey_id: int | None
) -> Project | None:
    row = session.get(Project, project_id)
    if not row:
        return None
    if survey_id is not None:
        conflict = session.scalar(
            select(Project).where(
                Project.limesurvey_survey_id == survey_id,
                Project.project_id != project_id,
            )
        )
        if conflict:
            raise ValueError(f"Survey {survey_id} is already linked to project {conflict.project_name}")
    row.limesurvey_survey_id = survey_id
    session.flush()
    instrument = session.scalar(
        select(SurveyInstrument)
        .where(SurveyInstrument.project_id == project_id)
        .order_by(SurveyInstrument.version.desc())
        .limit(1)
    )
    if survey_id is not None:
        if instrument:
            instrument.limesurvey_survey_id = survey_id
        else:
            session.add(
                SurveyInstrument(
                    project_id=project_id,
                    version=1,
                    limesurvey_survey_id=survey_id,
                    pilot_status="draft",
                )
            )
    session.flush()
    return row


def list_instruments(session: Session, project_id: UUID) -> list[SurveyInstrumentOut]:
    rows = session.scalars(
        select(SurveyInstrument)
        .where(SurveyInstrument.project_id == project_id)
        .order_by(SurveyInstrument.version.desc())
    ).all()
    return [SurveyInstrumentOut.model_validate(r) for r in rows]


def create_instrument(session: Session, body: SurveyInstrumentCreate) -> SurveyInstrumentOut | None:
    project = session.get(Project, body.project_id)
    if not project:
        return None
    latest = session.scalar(
        select(func.max(SurveyInstrument.version)).where(
            SurveyInstrument.project_id == body.project_id
        )
    )
    version = int(latest or 0) + 1
    row = SurveyInstrument(
        project_id=body.project_id,
        version=version,
        limesurvey_survey_id=body.limesurvey_survey_id,
        questionnaire_file_path=body.questionnaire_file_path,
        pilot_status=body.pilot_status or "draft",
    )
    session.add(row)
    if body.limesurvey_survey_id and not project.limesurvey_survey_id:
        project.limesurvey_survey_id = body.limesurvey_survey_id
    session.flush()
    return SurveyInstrumentOut.model_validate(row)


def list_marketing(session: Session) -> list[MarketingActivityOut]:
    rows = session.scalars(
        select(MarketingActivity).order_by(MarketingActivity.due_date.asc().nullslast())
    ).all()
    return [MarketingActivityOut.model_validate(r) for r in rows]


def create_marketing(session: Session, body: MarketingActivityCreate) -> MarketingActivityOut:
    row = MarketingActivity(
        client_id=body.client_id,
        project_id=body.project_id,
        activity_type=body.activity_type,
        title=body.title.strip(),
        status=body.status,
        owner_name=body.owner_name,
        due_date=body.due_date,
        notes=body.notes,
    )
    session.add(row)
    session.flush()
    return MarketingActivityOut.model_validate(row)


STAGE_ORDER = [
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

_DATA_COLLECTION_STAGES = frozenset(
    {
        "Deployment Prep",
        "Fieldwork/Data Collection",
        "QC",
    }
)


def _latest_fieldwork_by_project(session: Session, project_ids: list[UUID]) -> dict[UUID, FieldworkProgress]:
    if not project_ids:
        return {}
    rows = session.scalars(
        select(FieldworkProgress)
        .where(FieldworkProgress.project_id.in_(project_ids))
        .order_by(FieldworkProgress.entry_date.desc(), FieldworkProgress.updated_at.desc())
    ).all()
    latest: dict[UUID, FieldworkProgress] = {}
    for row in rows:
        if row.project_id not in latest:
            latest[row.project_id] = row
    return latest


def _data_collection_status(stage: str, entry: FieldworkProgress | None) -> tuple[str, float | None]:
    clean_stage = (stage or "").strip()
    if clean_stage == "Delivered":
        return "Delivered", 100.0 if entry else None
    if clean_stage not in _DATA_COLLECTION_STAGES:
        return "Not started", None
    if not entry:
        if clean_stage == "Deployment Prep":
            return "Prep — no field log", None
        if clean_stage == "QC":
            return "QC — no field log", None
        return "Live — no entries", None
    cumulative = int(entry.cumulative_completes or 0)
    target = entry.target_completes
    pct = round(100 * cumulative / int(target), 1) if target and int(target) > 0 else None
    if clean_stage == "QC":
        label = f"QC · {cumulative}"
        if target:
            label += f" / {int(target)}"
        if pct is not None:
            label += f" ({pct}%)"
        return label, pct
    if target:
        label = f"{cumulative} / {int(target)}"
        if pct is not None:
            label += f" ({pct}%)"
        return label, pct
    return f"{cumulative} completes logged", None


def pipeline_overview(session: Session, linked_survey_ids: list[int] | None = None) -> PipelineOverview:
    rows = sort_projects(
        session.scalars(
            select(Project).options(joinedload(Project.client))
        ).all()
    )
    proposal_status: dict[UUID, str] = {}
    for prop in session.scalars(select(Proposal)).all():
        cur = proposal_status.get(prop.project_id)
        if not cur or prop.version > 0:
            proposal_status[prop.project_id] = prop.status

    projects: list[PipelineProjectOut] = []
    linked = set()
    project_ids = [row.project_id for row in rows]
    fieldwork_latest = _latest_fieldwork_by_project(session, project_ids)
    for row in rows:
        base = project_to_out(row)
        fw = fieldwork_latest.get(row.project_id)
        dc_status, dc_pct = _data_collection_status(row.stage, fw)
        p = PipelineProjectOut(
            **base.model_dump(),
            client_name=row.client.client_name if row.client else None,
            proposal_status=proposal_status.get(row.project_id),
            has_survey_link=row.limesurvey_survey_id is not None,
            data_collection_status=dc_status,
            data_collection_pct=dc_pct,
        )
        projects.append(p)
        if row.limesurvey_survey_id:
            linked.add(row.limesurvey_survey_id)

    stage_counts: dict[str, int] = defaultdict(int)
    for p in projects:
        stage_counts[p.stage] += 1
    stages = [{"stage": s, "count": stage_counts.get(s, 0)} for s in STAGE_ORDER]

    unlinked: list[int] = []
    if linked_survey_ids:
        unlinked = [sid for sid in linked_survey_ids if sid not in linked]

    return PipelineOverview(stages=stages, projects=projects, unlinked_survey_ids=unlinked)
