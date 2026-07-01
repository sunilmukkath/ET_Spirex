"""Accounting store — chart of accounts, AR/AP, payments, dashboard."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import Session, joinedload

from app.db.models import (
    AcctAccount,
    AcctBill,
    AcctBillLine,
    AcctContact,
    AcctJournalEntry,
    AcctJournalLine,
    AcctOrganization,
    AcctPayment,
    AcctSalesInvoice,
    AcctSalesInvoiceLine,
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
    AcctSalesInvoiceLineOut,
    AcctBillLineOut,
)

DEFAULT_COA: list[tuple[str, str, str]] = [
    ("1000", "Cash", "asset"),
    ("1100", "Bank", "asset"),
    ("1200", "Accounts Receivable", "asset"),
    ("2000", "Accounts Payable", "liability"),
    ("2100", "GST Payable", "liability"),
    ("3000", "Owner's Equity", "equity"),
    ("4000", "Service Income", "income"),
    ("4100", "Other Income", "income"),
    ("5000", "Fieldwork Expense", "expense"),
    ("5100", "Recruitment Expense", "expense"),
    ("5200", "Analysis Expense", "expense"),
    ("5300", "Office & Admin", "expense"),
    ("5400", "Salaries & Wages", "expense"),
]


def ensure_org(session: Session) -> AcctOrganization:
    org = session.scalar(select(AcctOrganization).limit(1))
    if org:
        return org
    org = AcctOrganization(name="Elastic Tree", base_currency="INR", fiscal_year_start_month=4)
    session.add(org)
    session.flush()
    for code, name, acct_type in DEFAULT_COA:
        session.add(
            AcctAccount(org_id=org.org_id, code=code, name=name, account_type=acct_type)
        )
    session.flush()
    return org


def get_org(session: Session) -> AcctOrgOut:
    return AcctOrgOut.model_validate(ensure_org(session))


def list_accounts(session: Session) -> list[AcctAccountOut]:
    org = ensure_org(session)
    rows = session.scalars(
        select(AcctAccount)
        .where(AcctAccount.org_id == org.org_id)
        .order_by(AcctAccount.code)
    ).all()
    return [AcctAccountOut.model_validate(r) for r in rows]


def create_account(session: Session, body: AcctAccountCreate) -> AcctAccountOut:
    org = ensure_org(session)
    row = AcctAccount(
        org_id=org.org_id,
        code=body.code.strip(),
        name=body.name.strip(),
        account_type=body.account_type,
        parent_account_id=body.parent_account_id,
        description=body.description,
    )
    session.add(row)
    session.flush()
    return AcctAccountOut.model_validate(row)


def list_contacts(session: Session, contact_type: str | None = None) -> list[AcctContactOut]:
    org = ensure_org(session)
    stmt = select(AcctContact).where(AcctContact.org_id == org.org_id).order_by(AcctContact.display_name)
    if contact_type:
        stmt = stmt.where(AcctContact.contact_type == contact_type)
    return [AcctContactOut.model_validate(r) for r in session.scalars(stmt).all()]


def create_contact(session: Session, body: AcctContactCreate) -> AcctContactOut:
    org = ensure_org(session)
    row = AcctContact(
        org_id=org.org_id,
        contact_type=body.contact_type,
        display_name=body.display_name.strip(),
        company_name=body.company_name,
        email=body.email,
        phone=body.phone,
        tax_id=body.tax_id,
    )
    session.add(row)
    session.flush()
    return AcctContactOut.model_validate(row)


def _line_totals(lines: list) -> tuple[Decimal, Decimal, Decimal]:
    subtotal = Decimal("0")
    tax_total = Decimal("0")
    for line in lines:
        base = Decimal(str(line.quantity)) * Decimal(str(line.rate))
        tax = base * Decimal(str(line.tax_percent)) / Decimal("100")
        subtotal += base
        tax_total += tax
    return subtotal, tax_total, subtotal + tax_total


def _invoice_status(total: Decimal, paid: Decimal, due: date | None) -> str:
    if paid >= total and total > 0:
        return "paid"
    if due and due < date.today() and paid < total:
        return "overdue"
    if paid > 0:
        return "partial"
    return "sent"


def create_sales_invoice(session: Session, body: AcctSalesInvoiceCreate) -> AcctSalesInvoiceOut:
    org = ensure_org(session)
    subtotal, tax_total, total = _line_totals(body.lines) if body.lines else (Decimal("0"), Decimal("0"), Decimal("0"))
    row = AcctSalesInvoice(
        org_id=org.org_id,
        invoice_number=body.invoice_number.strip(),
        contact_id=body.contact_id,
        project_id=body.project_id,
        status="draft",
        invoice_date=body.invoice_date,
        due_date=body.due_date,
        currency=body.currency,
        subtotal=subtotal,
        tax_total=tax_total,
        total=total,
        notes=body.notes,
    )
    session.add(row)
    session.flush()
    for line in body.lines:
        base = line.quantity * line.rate
        tax = base * line.tax_percent / Decimal("100")
        session.add(
            AcctSalesInvoiceLine(
                sales_invoice_id=row.sales_invoice_id,
                account_id=line.account_id,
                description=line.description,
                quantity=line.quantity,
                rate=line.rate,
                tax_percent=line.tax_percent,
                line_total=base + tax,
            )
        )
    row.status = _invoice_status(total, Decimal("0"), body.due_date)
    session.flush()
    return sales_invoice_to_out(session, row)


def sales_invoice_to_out(session: Session, row: AcctSalesInvoice) -> AcctSalesInvoiceOut:
    contact_name = None
    if row.contact_id:
        c = session.get(AcctContact, row.contact_id)
        contact_name = c.display_name if c else None
    lines = session.scalars(
        select(AcctSalesInvoiceLine).where(AcctSalesInvoiceLine.sales_invoice_id == row.sales_invoice_id)
    ).all()
    return AcctSalesInvoiceOut(
        sales_invoice_id=row.sales_invoice_id,
        invoice_number=row.invoice_number,
        contact_id=row.contact_id,
        contact_name=contact_name,
        project_id=row.project_id,
        status=row.status,
        invoice_date=row.invoice_date,
        due_date=row.due_date,
        currency=row.currency,
        subtotal=row.subtotal,
        tax_total=row.tax_total,
        total=row.total,
        amount_paid=row.amount_paid,
        balance=row.total - row.amount_paid,
        notes=row.notes,
        lines=[AcctSalesInvoiceLineOut.model_validate(ln) for ln in lines],
    )


def list_sales_invoices(session: Session) -> list[AcctSalesInvoiceOut]:
    org = ensure_org(session)
    rows = session.scalars(
        select(AcctSalesInvoice)
        .where(AcctSalesInvoice.org_id == org.org_id)
        .order_by(AcctSalesInvoice.invoice_date.desc().nullslast())
    ).all()
    return [sales_invoice_to_out(session, r) for r in rows]


def create_bill(session: Session, body: AcctBillCreate) -> AcctBillOut:
    org = ensure_org(session)
    subtotal, tax_total, total = _line_totals(body.lines) if body.lines else (Decimal("0"), Decimal("0"), Decimal("0"))
    row = AcctBill(
        org_id=org.org_id,
        bill_number=body.bill_number.strip(),
        contact_id=body.contact_id,
        project_id=body.project_id,
        status="open",
        bill_date=body.bill_date,
        due_date=body.due_date,
        currency=body.currency,
        subtotal=subtotal,
        tax_total=tax_total,
        total=total,
        notes=body.notes,
    )
    session.add(row)
    session.flush()
    for line in body.lines:
        base = line.quantity * line.rate
        tax = base * line.tax_percent / Decimal("100")
        session.add(
            AcctBillLine(
                bill_id=row.bill_id,
                account_id=line.account_id,
                description=line.description,
                quantity=line.quantity,
                rate=line.rate,
                tax_percent=line.tax_percent,
                line_total=base + tax,
            )
        )
    session.flush()
    return bill_to_out(session, row)


def bill_to_out(session: Session, row: AcctBill) -> AcctBillOut:
    contact_name = None
    if row.contact_id:
        c = session.get(AcctContact, row.contact_id)
        contact_name = c.display_name if c else None
    lines = session.scalars(select(AcctBillLine).where(AcctBillLine.bill_id == row.bill_id)).all()
    return AcctBillOut(
        bill_id=row.bill_id,
        bill_number=row.bill_number,
        contact_id=row.contact_id,
        contact_name=contact_name,
        project_id=row.project_id,
        status=row.status,
        bill_date=row.bill_date,
        due_date=row.due_date,
        currency=row.currency,
        subtotal=row.subtotal,
        tax_total=row.tax_total,
        total=row.total,
        amount_paid=row.amount_paid,
        balance=row.total - row.amount_paid,
        notes=row.notes,
        lines=[AcctBillLineOut.model_validate(ln) for ln in lines],
    )


def list_bills(session: Session) -> list[AcctBillOut]:
    org = ensure_org(session)
    rows = session.scalars(
        select(AcctBill).where(AcctBill.org_id == org.org_id).order_by(AcctBill.bill_date.desc().nullslast())
    ).all()
    return [bill_to_out(session, r) for r in rows]


def create_payment(session: Session, body: AcctPaymentCreate) -> AcctPaymentOut:
    org = ensure_org(session)
    row = AcctPayment(
        org_id=org.org_id,
        payment_type=body.payment_type,
        contact_id=body.contact_id,
        amount=body.amount,
        payment_date=body.payment_date or date.today(),
        payment_mode=body.payment_mode,
        reference_number=body.reference_number,
    )
    session.add(row)
    session.flush()
    contact_name = None
    if row.contact_id:
        c = session.get(AcctContact, row.contact_id)
        contact_name = c.display_name if c else None
    return AcctPaymentOut(
        payment_id=row.payment_id,
        payment_type=row.payment_type,
        contact_id=row.contact_id,
        contact_name=contact_name,
        amount=row.amount,
        payment_date=row.payment_date,
        payment_mode=row.payment_mode,
        reference_number=row.reference_number,
    )


def list_payments(session: Session) -> list[AcctPaymentOut]:
    org = ensure_org(session)
    rows = session.scalars(
        select(AcctPayment)
        .where(AcctPayment.org_id == org.org_id)
        .order_by(AcctPayment.payment_date.desc().nullslast())
    ).all()
    out: list[AcctPaymentOut] = []
    for row in rows:
        contact_name = None
        if row.contact_id:
            c = session.get(AcctContact, row.contact_id)
            contact_name = c.display_name if c else None
        out.append(
            AcctPaymentOut(
                payment_id=row.payment_id,
                payment_type=row.payment_type,
                contact_id=row.contact_id,
                contact_name=contact_name,
                amount=row.amount,
                payment_date=row.payment_date,
                payment_mode=row.payment_mode,
                reference_number=row.reference_number,
            )
        )
    return out


def dashboard(session: Session) -> AcctDashboard:
    org = ensure_org(session)
    receivables = session.scalar(
        select(func.coalesce(func.sum(AcctSalesInvoice.total - AcctSalesInvoice.amount_paid), 0)).where(
            AcctSalesInvoice.org_id == org.org_id
        )
    ) or Decimal("0")
    payables = session.scalar(
        select(func.coalesce(func.sum(AcctBill.total - AcctBill.amount_paid), 0)).where(
            AcctBill.org_id == org.org_id
        )
    ) or Decimal("0")
    today = date.today()
    month_start = today.replace(day=1)
    income_mtd = session.scalar(
        select(func.coalesce(func.sum(AcctSalesInvoice.total), 0)).where(
            AcctSalesInvoice.org_id == org.org_id,
            AcctSalesInvoice.invoice_date >= month_start,
        )
    ) or Decimal("0")
    expense_mtd = session.scalar(
        select(func.coalesce(func.sum(AcctBill.total), 0)).where(
            AcctBill.org_id == org.org_id, AcctBill.bill_date >= month_start
        )
    ) or Decimal("0")
    payments_in = session.scalar(
        select(func.coalesce(func.sum(AcctPayment.amount), 0)).where(
            AcctPayment.org_id == org.org_id, AcctPayment.payment_type == "received"
        )
    ) or Decimal("0")
    payments_out = session.scalar(
        select(func.coalesce(func.sum(AcctPayment.amount), 0)).where(
            AcctPayment.org_id == org.org_id, AcctPayment.payment_type == "made"
        )
    ) or Decimal("0")
    return AcctDashboard(
        total_receivables=Decimal(str(receivables)),
        total_payables=Decimal(str(payables)),
        income_mtd=Decimal(str(income_mtd)),
        expense_mtd=Decimal(str(expense_mtd)),
        cash_balance=Decimal(str(payments_in)) - Decimal(str(payments_out)),
        invoice_count=session.scalar(
            select(func.count()).select_from(AcctSalesInvoice).where(AcctSalesInvoice.org_id == org.org_id)
        )
        or 0,
        bill_count=session.scalar(
            select(func.count()).select_from(AcctBill).where(AcctBill.org_id == org.org_id)
        )
        or 0,
        contact_count=session.scalar(
            select(func.count()).select_from(AcctContact).where(AcctContact.org_id == org.org_id)
        )
        or 0,
        account_count=session.scalar(
            select(func.count()).select_from(AcctAccount).where(AcctAccount.org_id == org.org_id)
        )
        or 0,
    )


def find_account_by_name_or_code(session: Session, org_id: UUID, key: str) -> AcctAccount | None:
    key = key.strip().lower()
    if not key:
        return None
    rows = session.scalars(select(AcctAccount).where(AcctAccount.org_id == org_id)).all()
    for row in rows:
        if row.code.lower() == key or row.name.lower() == key:
            return row
    return None


def find_contact_by_name(session: Session, org_id: UUID, name: str) -> AcctContact | None:
    name = name.strip().lower()
    if not name:
        return None
    rows = session.scalars(select(AcctContact).where(AcctContact.org_id == org_id)).all()
    for row in rows:
        if row.display_name.lower() == name:
            return row
        if row.company_name and row.company_name.lower() == name:
            return row
    return None
