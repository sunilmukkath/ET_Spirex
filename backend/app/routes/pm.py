"""Project management API — Postgres spine (projects + fieldwork)."""

from __future__ import annotations

import io
import time
from uuid import UUID

from collections.abc import Generator

from fastapi import APIRouter, Depends, File, Header, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.db.session import (
    database_enabled,
    database_init_failed,
    ensure_database_ready,
    get_database_init_error,
    get_db as _get_db_session,
    is_database_ready,
)
from app.models.pm import (
    AgentBriefRequest,
    AgentBriefResponse,
    AgentDraftResponse,
    BudgetLineCreate,
    BudgetLineOut,
    ClientCreate,
    ClientOut,
    ClientUpdate,
    FieldworkDashboard,
    FieldworkEntryCreate,
    FieldworkEntryOut,
    FieldworkEntryUpdate,
    FinanceSummary,
    InvoiceCreate,
    InvoiceOut,
    LinkSurveyRequest,
    MarketingActivityCreate,
    MarketingActivityOut,
    PipelineOverview,
    PmImportResult,
    PmProjectCreate,
    PmProjectOut,
    PmProjectUpdate,
    ProposalCreate,
    ProposalOut,
    SurveyInstrumentCreate,
    SurveyInstrumentOut,
    SurveyLinkOut,
    TeamMemberOut,
)
from app.models.project_requirements import ProjectRequirements
from app.services import pm_ops_store, pm_store
from app.services.pm_import import import_projects_from_sheet, project_import_template_xlsx
from app.services.crm_agent import run_crm_agent
from app.services.finance_agent import run_finance_agent
from app.services.proposal_agent import run_proposal_writing_agent
from app.services.auth import get_session
from app.db.models import TeamMember
from sqlalchemy import select

router = APIRouter(prefix="/pm", tags=["project-management"])


def _require_db() -> None:
    if not database_enabled():
        raise HTTPException(
            status_code=503,
            detail="Project management database is not configured. Set DATABASE_URL.",
        )


def _extract_token(authorization: str | None) -> str | None:
    if not authorization:
        return None
    if authorization.lower().startswith("bearer "):
        return authorization[7:].strip()
    return authorization.strip()


def require_auth(authorization: str | None = Header(default=None)) -> str:
    record = get_session(_extract_token(authorization))
    if not record:
        raise HTTPException(status_code=401, detail="Not signed in")
    return record.username


def get_pm_db() -> Generator[Session, None, None]:
    _require_db()
    if database_init_failed():
        raise HTTPException(
            status_code=503,
            detail=f"Project database unavailable: {get_database_init_error()}",
        )
    try:
        ensure_database_ready()
    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=503,
            detail=f"Project database unavailable: {exc}",
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail=f"Project database not ready: {exc}",
        ) from exc
    yield from _get_db_session()


@router.get("/status")
def pm_status():
    enabled = database_enabled()
    ready = is_database_ready() if enabled else False
    failed = database_init_failed() if enabled else False
    error = get_database_init_error() if enabled and (failed or not ready) else None
    return {"enabled": enabled, "ready": ready, "failed": failed, "error": error}


@router.get("/team-members", response_model=list[TeamMemberOut])
def pm_team_members(
    _: str = Depends(require_auth),
    session: Session = Depends(get_pm_db),
):
    rows = session.scalars(select(TeamMember).order_by(TeamMember.name)).all()
    return [TeamMemberOut.model_validate(row) for row in rows]


@router.get("/projects", response_model=list[PmProjectOut])
def pm_list_projects(
    _: str = Depends(require_auth),
    session: Session = Depends(get_pm_db),
):
    return pm_store.list_projects(session)


@router.post("/projects", response_model=PmProjectOut, status_code=201)
def pm_create_project(
    body: PmProjectCreate,
    _: str = Depends(require_auth),
    session: Session = Depends(get_pm_db),
):
    return pm_store.create_project(session, body)


@router.get("/projects/import/template")
def pm_project_import_template(_: str = Depends(require_auth)):
    data = project_import_template_xlsx()
    return StreamingResponse(
        io.BytesIO(data),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="et_scout_project_import_template.xlsx"'},
    )


@router.post("/projects/import", response_model=PmImportResult)
async def pm_import_projects(
    file: UploadFile = File(...),
    _: str = Depends(require_auth),
    session: Session = Depends(get_pm_db),
):
    filename = file.filename or "upload.xlsx"
    lower = filename.lower()
    if not lower.endswith((".xlsx", ".xlsm", ".csv")):
        raise HTTPException(status_code=400, detail="Upload .xlsx or .csv project sheet")
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")
    try:
        return import_projects_from_sheet(session, data, filename=filename)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/projects/{project_id}", response_model=PmProjectOut)
def pm_get_project(
    project_id: UUID,
    _: str = Depends(require_auth),
    session: Session = Depends(get_pm_db),
):
    row = pm_store.get_project(session, project_id)
    if not row:
        raise HTTPException(status_code=404, detail="Project not found")
    return pm_store.project_to_out(row)


@router.patch("/projects/{project_id}", response_model=PmProjectOut)
def pm_update_project(
    project_id: UUID,
    body: PmProjectUpdate,
    _: str = Depends(require_auth),
    session: Session = Depends(get_pm_db),
):
    row = pm_store.update_project(session, project_id, body)
    if not row:
        raise HTTPException(status_code=404, detail="Project not found")
    return pm_store.project_to_out(row)


@router.put("/projects/{project_id}/requirements", response_model=PmProjectOut)
def pm_update_project_requirements(
    project_id: UUID,
    body: ProjectRequirements,
    username: str = Depends(require_auth),
    session: Session = Depends(get_pm_db),
):
    payload = body.model_dump()
    payload["updated_at"] = time.time()
    payload["updated_by"] = username
    row = pm_store.update_project(
        session,
        project_id,
        PmProjectUpdate(requirements=ProjectRequirements.model_validate(payload)),
    )
    if not row:
        raise HTTPException(status_code=404, detail="Project not found")
    return pm_store.project_to_out(row)


@router.get("/projects/{project_id}/fieldwork", response_model=list[FieldworkEntryOut])
def pm_list_fieldwork(
    project_id: UUID,
    _: str = Depends(require_auth),
    session: Session = Depends(get_pm_db),
):
    if not pm_store.get_project(session, project_id):
        raise HTTPException(status_code=404, detail="Project not found")
    rows = pm_store.list_fieldwork_entries(session, project_id)
    return [FieldworkEntryOut.model_validate(row) for row in rows]


@router.post("/projects/{project_id}/fieldwork", response_model=FieldworkEntryOut, status_code=201)
def pm_create_fieldwork(
    project_id: UUID,
    body: FieldworkEntryCreate,
    _: str = Depends(require_auth),
    session: Session = Depends(get_pm_db),
):
    row = pm_store.create_fieldwork_entry(session, project_id, body)
    if not row:
        raise HTTPException(status_code=404, detail="Project not found")
    return FieldworkEntryOut.model_validate(row)


@router.patch("/projects/{project_id}/fieldwork/{entry_id}", response_model=FieldworkEntryOut)
def pm_update_fieldwork(
    project_id: UUID,
    entry_id: UUID,
    body: FieldworkEntryUpdate,
    _: str = Depends(require_auth),
    session: Session = Depends(get_pm_db),
):
    row = pm_store.update_fieldwork_entry(session, project_id, entry_id, body)
    if not row:
        raise HTTPException(status_code=404, detail="Fieldwork entry not found")
    return FieldworkEntryOut.model_validate(row)


@router.delete("/projects/{project_id}/fieldwork/{entry_id}")
def pm_delete_fieldwork(
    project_id: UUID,
    entry_id: UUID,
    _: str = Depends(require_auth),
    session: Session = Depends(get_pm_db),
):
    if not pm_store.delete_fieldwork_entry(session, project_id, entry_id):
        raise HTTPException(status_code=404, detail="Fieldwork entry not found")
    return {"ok": True}


@router.get("/projects/{project_id}/fieldwork/dashboard", response_model=FieldworkDashboard)
def pm_fieldwork_dashboard(
    project_id: UUID,
    _: str = Depends(require_auth),
    session: Session = Depends(get_pm_db),
):
    dashboard = pm_store.build_fieldwork_dashboard(session, project_id)
    if not dashboard:
        raise HTTPException(status_code=404, detail="Project not found")
    return dashboard


# --- Pipeline & survey links ---


@router.get("/pipeline", response_model=PipelineOverview)
def pm_pipeline(
    _: str = Depends(require_auth),
    session: Session = Depends(get_pm_db),
):
    survey_ids: list[int] = []
    try:
        from app.lime_client import list_projects

        survey_ids = [int(p["id"]) for p in list_projects() if p.get("id")]
    except Exception:
        pass
    return pm_ops_store.pipeline_overview(session, survey_ids)


@router.get("/survey-links", response_model=list[SurveyLinkOut])
def pm_survey_links(
    _: str = Depends(require_auth),
    session: Session = Depends(get_pm_db),
):
    return pm_ops_store.list_survey_links(session)


@router.post("/projects/{project_id}/link-survey", response_model=PmProjectOut)
def pm_link_survey(
    project_id: UUID,
    body: LinkSurveyRequest,
    _: str = Depends(require_auth),
    session: Session = Depends(get_pm_db),
):
    try:
        row = pm_ops_store.link_survey(session, project_id, body.limesurvey_survey_id)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    if not row:
        raise HTTPException(status_code=404, detail="Project not found")
    refreshed = pm_store.get_project(session, project_id)
    return pm_store.project_to_out(refreshed)


# --- Clients / CRM ---


@router.get("/clients", response_model=list[ClientOut])
def pm_list_clients(
    _: str = Depends(require_auth),
    session: Session = Depends(get_pm_db),
):
    return pm_ops_store.list_clients(session)


@router.post("/clients", response_model=ClientOut, status_code=201)
def pm_create_client(
    body: ClientCreate,
    _: str = Depends(require_auth),
    session: Session = Depends(get_pm_db),
):
    out = pm_ops_store.create_client(session, body)
    return out


@router.patch("/clients/{client_id}", response_model=ClientOut)
def pm_update_client(
    client_id: UUID,
    body: ClientUpdate,
    _: str = Depends(require_auth),
    session: Session = Depends(get_pm_db),
):
    row = pm_ops_store.update_client(session, client_id, body)
    if not row:
        raise HTTPException(status_code=404, detail="Client not found")
    return ClientOut.model_validate(row)


# --- Proposals ---


@router.get("/proposals", response_model=list[ProposalOut])
def pm_list_proposals(
    project_id: UUID | None = None,
    _: str = Depends(require_auth),
    session: Session = Depends(get_pm_db),
):
    return pm_ops_store.list_proposals(session, project_id)


@router.post("/proposals", response_model=ProposalOut, status_code=201)
def pm_create_proposal(
    body: ProposalCreate,
    _: str = Depends(require_auth),
    session: Session = Depends(get_pm_db),
):
    out = pm_ops_store.create_proposal(session, body)
    if not out:
        raise HTTPException(status_code=404, detail="Project not found")
    return out


# --- Finance ---


@router.get("/projects/{project_id}/finance", response_model=FinanceSummary)
def pm_finance_summary(
    project_id: UUID,
    _: str = Depends(require_auth),
    session: Session = Depends(get_pm_db),
):
    summary = pm_ops_store.finance_summary(session, project_id)
    if not summary:
        raise HTTPException(status_code=404, detail="Project not found")
    return summary


@router.post("/budget-lines", response_model=BudgetLineOut, status_code=201)
def pm_create_budget_line(
    body: BudgetLineCreate,
    _: str = Depends(require_auth),
    session: Session = Depends(get_pm_db),
):
    out = pm_ops_store.create_budget_line(session, body)
    if not out:
        raise HTTPException(status_code=404, detail="Project not found")
    return out


@router.post("/invoices", response_model=InvoiceOut, status_code=201)
def pm_create_invoice(
    body: InvoiceCreate,
    _: str = Depends(require_auth),
    session: Session = Depends(get_pm_db),
):
    out = pm_ops_store.create_invoice(session, body)
    if not out:
        raise HTTPException(status_code=404, detail="Project not found")
    return out


@router.post("/agents/finance", response_model=AgentBriefResponse)
def pm_finance_agent(
    body: AgentBriefRequest,
    _: str = Depends(require_auth),
    session: Session = Depends(get_pm_db),
):
    if not body.project_id:
        raise HTTPException(status_code=400, detail="project_id required")
    return run_finance_agent(session, body.project_id)


@router.post("/agents/crm", response_model=AgentBriefResponse)
def pm_crm_agent(
    body: AgentBriefRequest,
    _: str = Depends(require_auth),
    session: Session = Depends(get_pm_db),
):
    if not body.project_id and not body.client_id:
        raise HTTPException(status_code=400, detail="project_id or client_id required")
    return run_crm_agent(
        session,
        project_id=body.project_id,
        client_id=body.client_id,
        extra_context=body.context,
    )


@router.post("/agents/proposal", response_model=AgentDraftResponse)
def pm_proposal_writing_agent(
    body: AgentBriefRequest,
    _: str = Depends(require_auth),
    session: Session = Depends(get_pm_db),
):
    if not body.project_id:
        raise HTTPException(status_code=400, detail="project_id required")
    return run_proposal_writing_agent(
        session,
        body.project_id,
        extra_context=body.context,
    )


# --- Survey programming ---


@router.get("/projects/{project_id}/instruments", response_model=list[SurveyInstrumentOut])
def pm_list_instruments(
    project_id: UUID,
    _: str = Depends(require_auth),
    session: Session = Depends(get_pm_db),
):
    if not pm_store.get_project(session, project_id):
        raise HTTPException(status_code=404, detail="Project not found")
    return pm_ops_store.list_instruments(session, project_id)


@router.post("/instruments", response_model=SurveyInstrumentOut, status_code=201)
def pm_create_instrument(
    body: SurveyInstrumentCreate,
    _: str = Depends(require_auth),
    session: Session = Depends(get_pm_db),
):
    out = pm_ops_store.create_instrument(session, body)
    if not out:
        raise HTTPException(status_code=404, detail="Project not found")
    return out


# --- Marketing ---


@router.get("/marketing", response_model=list[MarketingActivityOut])
def pm_list_marketing(
    _: str = Depends(require_auth),
    session: Session = Depends(get_pm_db),
):
    return pm_ops_store.list_marketing(session)


@router.post("/marketing", response_model=MarketingActivityOut, status_code=201)
def pm_create_marketing(
    body: MarketingActivityCreate,
    _: str = Depends(require_auth),
    session: Session = Depends(get_pm_db),
):
    out = pm_ops_store.create_marketing(session, body)
    session.commit()
    return out
