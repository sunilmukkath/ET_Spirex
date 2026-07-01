"""Business logic for PM projects and fieldwork tracking."""

from __future__ import annotations

from collections import defaultdict
from datetime import date
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from app.db.models import FieldworkProgress, Project, TeamMember
from app.models.project_requirements import ProjectRequirements, requirements_from_raw
from app.models.pm import (
    FieldworkDashboard,
    FieldworkEntryCreate,
    FieldworkEntryUpdate,
    PmProjectCreate,
    PmProjectOut,
    PmProjectUpdate,
    QuotaCellSummary,
)
from app.services.pm_project_sort import sort_projects


def _resolve_owner_id(session: Session, owner_id: UUID | None, owner_name: str | None) -> UUID | None:
    if owner_id is not None:
        return owner_id
    if not owner_name:
        return None
    member = session.scalar(select(TeamMember).where(TeamMember.name == owner_name))
    return member.member_id if member else None


def project_to_out(project: Project) -> PmProjectOut:
    owner_name = project.owner.name if project.owner else None
    req = requirements_from_raw(project.requirements) if project.requirements else None
    return PmProjectOut.model_validate(
        {
            **PmProjectOut.model_validate(project).model_dump(),
            "owner_name": owner_name,
            "requirements": req,
        }
    )


def list_projects(session: Session) -> list[PmProjectOut]:
    rows = session.scalars(
        select(Project).options(joinedload(Project.owner))
    ).all()
    return [project_to_out(row) for row in sort_projects(rows)]


def get_project(session: Session, project_id: UUID) -> Project | None:
    return session.scalar(
        select(Project).options(joinedload(Project.owner)).where(Project.project_id == project_id)
    )


def create_project(session: Session, body: PmProjectCreate) -> PmProjectOut:
    row = Project(
        project_name=body.project_name.strip(),
        client_id=body.client_id,
        project_type=body.project_type,
        engagement_type=body.engagement_type,
        stage=body.stage,
        owner_id=_resolve_owner_id(session, body.owner_id, body.owner_name),
        limesurvey_survey_id=body.limesurvey_survey_id,
        project_code=body.project_code,
        fiscal_year=body.fiscal_year,
        billing_month=body.billing_month,
        start_date=body.start_date,
        target_close_date=body.target_close_date,
        actual_close_date=body.actual_close_date,
        budget_estimate=body.budget_estimate,
        budget_actual=body.budget_actual,
        project_value_inr=body.project_value_inr,
        status_notes=body.status_notes,
        requirements=body.requirements.model_dump() if body.requirements else None,
    )
    session.add(row)
    session.flush()
    session.refresh(row, attribute_names=["owner"])
    return project_to_out(row)


def update_project(session: Session, project_id: UUID, body: PmProjectUpdate) -> Project | None:
    row = session.get(Project, project_id)
    if not row:
        return None
    data = body.model_dump(exclude_unset=True)
    owner_name = data.pop("owner_name", None)
    if "owner_id" in data or owner_name is not None:
        row.owner_id = _resolve_owner_id(
            session,
            data.pop("owner_id", row.owner_id),
            owner_name,
        )
    for key, value in data.items():
        if key == "requirements" and value is not None:
            if isinstance(value, ProjectRequirements):
                setattr(row, key, value.model_dump())
            else:
                setattr(row, key, value)
        else:
            setattr(row, key, value)
    session.flush()
    session.refresh(row, attribute_names=["owner"])
    return row


def list_fieldwork_entries(session: Session, project_id: UUID) -> list[FieldworkProgress]:
    return list(
        session.scalars(
            select(FieldworkProgress)
            .where(FieldworkProgress.project_id == project_id)
            .order_by(FieldworkProgress.entry_date.desc())
        ).all()
    )


def _prior_entry_before(
    session: Session, project_id: UUID, entry_date: date
) -> FieldworkProgress | None:
    return session.scalar(
        select(FieldworkProgress)
        .where(
            FieldworkProgress.project_id == project_id,
            FieldworkProgress.entry_date < entry_date,
        )
        .order_by(FieldworkProgress.entry_date.desc())
        .limit(1)
    )


def _auto_cumulative(session: Session, project_id: UUID, entry_date: date, completes_today: int) -> int:
    prior = _prior_entry_before(session, project_id, entry_date)
    base = prior.cumulative_completes if prior else 0
    return base + completes_today


def create_fieldwork_entry(
    session: Session, project_id: UUID, body: FieldworkEntryCreate
) -> FieldworkProgress | None:
    if not session.get(Project, project_id):
        return None

    existing = session.scalar(
        select(FieldworkProgress).where(
            FieldworkProgress.project_id == project_id,
            FieldworkProgress.entry_date == body.entry_date,
        )
    )
    cumulative = body.cumulative_completes
    if cumulative is None:
        cumulative = _auto_cumulative(session, project_id, body.entry_date, body.completes_today)

    if existing:
        existing.completes_today = body.completes_today
        existing.cumulative_completes = cumulative
        if body.target_completes is not None:
            existing.target_completes = body.target_completes
        if body.quota_cell is not None:
            existing.quota_cell = body.quota_cell
        existing.rejects_today = body.rejects_today
        existing.reject_reason = body.reject_reason
        existing.flagged_for_qc = body.flagged_for_qc
        session.flush()
        return existing

    row = FieldworkProgress(
        project_id=project_id,
        entry_date=body.entry_date,
        completes_today=body.completes_today,
        cumulative_completes=cumulative,
        target_completes=body.target_completes,
        quota_cell=body.quota_cell,
        rejects_today=body.rejects_today,
        reject_reason=body.reject_reason,
        flagged_for_qc=body.flagged_for_qc,
    )
    session.add(row)
    session.flush()
    return row


def update_fieldwork_entry(
    session: Session, project_id: UUID, entry_id: UUID, body: FieldworkEntryUpdate
) -> FieldworkProgress | None:
    row = session.scalar(
        select(FieldworkProgress).where(
            FieldworkProgress.entry_id == entry_id,
            FieldworkProgress.project_id == project_id,
        )
    )
    if not row:
        return None
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(row, key, value)
    session.flush()
    return row


def delete_fieldwork_entry(session: Session, project_id: UUID, entry_id: UUID) -> bool:
    row = session.scalar(
        select(FieldworkProgress).where(
            FieldworkProgress.entry_id == entry_id,
            FieldworkProgress.project_id == project_id,
        )
    )
    if not row:
        return False
    session.delete(row)
    return True


def build_fieldwork_dashboard(session: Session, project_id: UUID) -> FieldworkDashboard | None:
    project = session.get(Project, project_id)
    if not project:
        return None

    entries = list_fieldwork_entries(session, project_id)
    latest = entries[0] if entries else None

    cumulative = latest.cumulative_completes if latest else 0
    target = latest.target_completes if latest else None
    pct = round(100 * cumulative / target, 1) if target and target > 0 else None

    cell_totals: dict[str, dict[str, int | str | None]] = defaultdict(
        lambda: {"label": "", "cumulative": 0, "target": None}
    )
    for entry in entries:
        if not entry.quota_cell:
            continue
        cell_key = str(entry.quota_cell.get("cell_key") or entry.quota_cell.get("label") or "default")
        label = str(entry.quota_cell.get("label") or cell_key)
        completes = int(entry.quota_cell.get("completes") or entry.completes_today or 0)
        target_cell = entry.quota_cell.get("target")
        bucket = cell_totals[cell_key]
        bucket["label"] = label
        bucket["cumulative"] = int(bucket["cumulative"]) + completes
        if target_cell is not None:
            bucket["target"] = int(target_cell)

    quota_cells: list[QuotaCellSummary] = []
    for cell_key, bucket in sorted(cell_totals.items()):
        cum = int(bucket["cumulative"])
        tgt = bucket["target"]
        cell_pct = round(100 * cum / int(tgt), 1) if tgt and int(tgt) > 0 else None
        quota_cells.append(
            QuotaCellSummary(
                cell_key=cell_key,
                label=str(bucket["label"]),
                cumulative_completes=cum,
                target_completes=int(tgt) if tgt is not None else None,
                pct_complete=cell_pct,
            )
        )

    from app.models.pm import FieldworkEntryOut

    return FieldworkDashboard(
        project_id=project.project_id,
        project_name=project.project_name,
        latest_entry_date=latest.entry_date if latest else None,
        cumulative_completes=cumulative,
        target_completes=target,
        pct_complete=pct,
        rejects_today=latest.rejects_today if latest else 0,
        flagged_for_qc=latest.flagged_for_qc if latest else False,
        quota_cells=quota_cells,
        daily_series=[FieldworkEntryOut.model_validate(e) for e in reversed(entries[:14])],
    )
