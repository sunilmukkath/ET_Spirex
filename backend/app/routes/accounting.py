"""Accounting API — chart of accounts, AR/AP, Zoho migration."""

from __future__ import annotations

from collections.abc import Generator

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
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
from app.models.accounting import (
    AcctAccountCreate,
    AcctAccountOut,
    AcctBillCreate,
    AcctBillOut,
    AcctContactCreate,
    AcctContactOut,
    AcctDashboard,
    AcctOrgOut,
    AcctPaymentCreate,
    AcctPaymentOut,
    AcctSalesInvoiceCreate,
    AcctSalesInvoiceOut,
    ZohoImportPreview,
    ZohoImportResult,
)
from app.services import accounting_store
from app.services.zoho_import import import_zoho_data, list_zoho_modules, preview_zoho_import

router = APIRouter(prefix="/accounting", tags=["accounting"])


def _require_db() -> None:
    if not database_enabled():
        raise HTTPException(
            status_code=503,
            detail="Accounting requires DATABASE_URL (Postgres PM spine).",
        )
    if database_init_failed():
        raise HTTPException(status_code=503, detail=get_database_init_error() or "Database init failed")
    if not is_database_ready():
        try:
            ensure_database_ready()
        except Exception as exc:
            raise HTTPException(status_code=503, detail=str(exc)) from exc


def get_db() -> Generator[Session, None, None]:
    _require_db()
    yield from _get_db_session()


@router.get("/org", response_model=AcctOrgOut)
def get_org(session: Session = Depends(get_db)) -> AcctOrgOut:
    try:
        return accounting_store.get_org(session)
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/dashboard", response_model=AcctDashboard)
def get_dashboard(session: Session = Depends(get_db)) -> AcctDashboard:
    try:
        return accounting_store.dashboard(session)
    except SQLAlchemyError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/accounts", response_model=list[AcctAccountOut])
def list_accounts(session: Session = Depends(get_db)) -> list[AcctAccountOut]:
    return accounting_store.list_accounts(session)


@router.post("/accounts", response_model=AcctAccountOut)
def create_account(body: AcctAccountCreate, session: Session = Depends(get_db)) -> AcctAccountOut:
    return accounting_store.create_account(session, body)


@router.get("/contacts", response_model=list[AcctContactOut])
def list_contacts(
    contact_type: str | None = None, session: Session = Depends(get_db)
) -> list[AcctContactOut]:
    return accounting_store.list_contacts(session, contact_type)


@router.post("/contacts", response_model=AcctContactOut)
def create_contact(body: AcctContactCreate, session: Session = Depends(get_db)) -> AcctContactOut:
    return accounting_store.create_contact(session, body)


@router.get("/invoices", response_model=list[AcctSalesInvoiceOut])
def list_invoices(session: Session = Depends(get_db)) -> list[AcctSalesInvoiceOut]:
    return accounting_store.list_sales_invoices(session)


@router.post("/invoices", response_model=AcctSalesInvoiceOut)
def create_invoice(
    body: AcctSalesInvoiceCreate, session: Session = Depends(get_db)
) -> AcctSalesInvoiceOut:
    return accounting_store.create_sales_invoice(session, body)


@router.get("/bills", response_model=list[AcctBillOut])
def list_bills(session: Session = Depends(get_db)) -> list[AcctBillOut]:
    return accounting_store.list_bills(session)


@router.post("/bills", response_model=AcctBillOut)
def create_bill(body: AcctBillCreate, session: Session = Depends(get_db)) -> AcctBillOut:
    return accounting_store.create_bill(session, body)


@router.get("/payments", response_model=list[AcctPaymentOut])
def list_payments(session: Session = Depends(get_db)) -> list[AcctPaymentOut]:
    return accounting_store.list_payments(session)


@router.post("/payments", response_model=AcctPaymentOut)
def create_payment(body: AcctPaymentCreate, session: Session = Depends(get_db)) -> AcctPaymentOut:
    return accounting_store.create_payment(session, body)


@router.get("/zoho/modules")
def zoho_modules() -> list[dict]:
    return list_zoho_modules()


@router.post("/zoho/preview", response_model=ZohoImportPreview)
async def zoho_preview(
    module: str,
    file: UploadFile = File(...),
    session: Session = Depends(get_db),
) -> ZohoImportPreview:
    data = await file.read()
    try:
        return preview_zoho_import(session, module, data, file.filename or "import.csv")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/zoho/import", response_model=ZohoImportResult)
async def zoho_import(
    module: str,
    file: UploadFile = File(...),
    session: Session = Depends(get_db),
) -> ZohoImportResult:
    data = await file.read()
    try:
        return import_zoho_data(session, module, data, file.filename or "import.csv")
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
