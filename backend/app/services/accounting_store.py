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
    AcctEstimate,
    AcctEstimateLine,
    AcctJournalEntry,
    AcctJournalLine,
    AcctOrganization,
    AcctPayment,
    AcctPurchaseOrder,
    AcctPurchaseOrderLine,
    AcctSalesInvoice,
    AcctSalesInvoiceLine,
    AcctSalesReceipt,
    AcctSalesReceiptLine,
)
from app.models.accounting import (
    AcctAccountCreate,
    AcctAccountOut,
    AcctAgingBucket,
    AcctAgingLine,
    AcctAgingReport,
    AcctBillCreate,
    AcctBillLineOut,
    AcctBillOut,
    AcctContactCreate,
    AcctContactOut,
    AcctDashboard,
    AcctDocumentLineCreate,
    AcctEstimateCreate,
    AcctEstimateLineOut,
    AcctEstimateOut,
    AcctOrgOut,
    AcctPaymentCreate,
    AcctPaymentOut,
    AcctPurchaseOrderCreate,
    AcctPurchaseOrderLineOut,
    AcctPurchaseOrderOut,
    AcctRevenueByCustomer,
    AcctRevenueReport,
    AcctSalesInvoiceCreate,
    AcctSalesInvoiceLineOut,
    AcctSalesInvoiceOut,
    AcctSalesReceiptCreate,
    AcctSalesReceiptLineOut,
    AcctSalesReceiptOut,
    AcctSummaryReports,
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


def _add_document_lines(session: Session, parent_id: UUID, lines: list[AcctDocumentLineCreate], model, fk_field: str) -> None:
    for line in lines:
        base = line.quantity * line.rate
        tax = base * line.tax_percent / Decimal("100")
        kwargs = {
            fk_field: parent_id,
            "account_id": line.account_id,
            "description": line.description,
            "quantity": line.quantity,
            "rate": line.rate,
            "tax_percent": line.tax_percent,
            "line_total": base + tax,
        }
        session.add(model(**kwargs))


def _contact_name(session: Session, contact_id: UUID | None) -> str | None:
    if not contact_id:
        return None
    c = session.get(AcctContact, contact_id)
    return c.display_name if c else None


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
    allocations: dict[str, str] = {}
    sales_invoice_id = body.sales_invoice_id
    bill_id = body.bill_id

    if sales_invoice_id:
        inv = session.get(AcctSalesInvoice, sales_invoice_id)
        if not inv or inv.org_id != org.org_id:
            raise ValueError("Invoice not found")
        balance = inv.total - inv.amount_paid
        apply_amount = min(body.amount, balance)
        inv.amount_paid += apply_amount
        inv.status = _invoice_status(inv.total, inv.amount_paid, inv.due_date)
        allocations["sales_invoice_id"] = str(sales_invoice_id)
        allocations["applied"] = str(apply_amount)

    if bill_id:
        bill = session.get(AcctBill, bill_id)
        if not bill or bill.org_id != org.org_id:
            raise ValueError("Bill not found")
        balance = bill.total - bill.amount_paid
        apply_amount = min(body.amount, balance)
        bill.amount_paid += apply_amount
        bill.status = "paid" if bill.amount_paid >= bill.total else "open"
        allocations["bill_id"] = str(bill_id)
        allocations["applied"] = str(apply_amount)

    row = AcctPayment(
        org_id=org.org_id,
        payment_type=body.payment_type,
        contact_id=body.contact_id,
        amount=body.amount,
        payment_date=body.payment_date or date.today(),
        payment_mode=body.payment_mode,
        reference_number=body.reference_number,
        allocations=allocations or None,
    )
    session.add(row)
    session.flush()
    return AcctPaymentOut(
        payment_id=row.payment_id,
        payment_type=row.payment_type,
        contact_id=row.contact_id,
        contact_name=_contact_name(session, row.contact_id),
        amount=row.amount,
        payment_date=row.payment_date,
        payment_mode=row.payment_mode,
        reference_number=row.reference_number,
        sales_invoice_id=sales_invoice_id,
        bill_id=bill_id,
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
        sales_invoice_id = None
        bill_id = None
        if row.allocations:
            if row.allocations.get("sales_invoice_id"):
                sales_invoice_id = UUID(str(row.allocations["sales_invoice_id"]))
            if row.allocations.get("bill_id"):
                bill_id = UUID(str(row.allocations["bill_id"]))
        out.append(
            AcctPaymentOut(
                payment_id=row.payment_id,
                payment_type=row.payment_type,
                contact_id=row.contact_id,
                contact_name=_contact_name(session, row.contact_id),
                amount=row.amount,
                payment_date=row.payment_date,
                payment_mode=row.payment_mode,
                reference_number=row.reference_number,
                sales_invoice_id=sales_invoice_id,
                bill_id=bill_id,
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
        estimate_count=session.scalar(
            select(func.count()).select_from(AcctEstimate).where(AcctEstimate.org_id == org.org_id)
        )
        or 0,
        sales_receipt_count=session.scalar(
            select(func.count()).select_from(AcctSalesReceipt).where(AcctSalesReceipt.org_id == org.org_id)
        )
        or 0,
        purchase_order_count=session.scalar(
            select(func.count()).select_from(AcctPurchaseOrder).where(AcctPurchaseOrder.org_id == org.org_id)
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


# ── Estimates ─────────────────────────────────────────────────────────────────


def create_estimate(session: Session, body: AcctEstimateCreate) -> AcctEstimateOut:
    org = ensure_org(session)
    subtotal, tax_total, total = _line_totals(body.lines) if body.lines else (Decimal("0"), Decimal("0"), Decimal("0"))
    row = AcctEstimate(
        org_id=org.org_id,
        estimate_number=body.estimate_number.strip(),
        contact_id=body.contact_id,
        project_id=body.project_id,
        status="sent",
        estimate_date=body.estimate_date or date.today(),
        expiry_date=body.expiry_date,
        currency=body.currency,
        subtotal=subtotal,
        tax_total=tax_total,
        total=total,
        notes=body.notes,
    )
    session.add(row)
    session.flush()
    _add_document_lines(session, row.estimate_id, body.lines, AcctEstimateLine, "estimate_id")
    session.flush()
    return estimate_to_out(session, row)


def estimate_to_out(session: Session, row: AcctEstimate) -> AcctEstimateOut:
    lines = session.scalars(
        select(AcctEstimateLine).where(AcctEstimateLine.estimate_id == row.estimate_id)
    ).all()
    return AcctEstimateOut(
        estimate_id=row.estimate_id,
        estimate_number=row.estimate_number,
        contact_id=row.contact_id,
        contact_name=_contact_name(session, row.contact_id),
        project_id=row.project_id,
        status=row.status,
        estimate_date=row.estimate_date,
        expiry_date=row.expiry_date,
        currency=row.currency,
        subtotal=row.subtotal,
        tax_total=row.tax_total,
        total=row.total,
        notes=row.notes,
        lines=[AcctEstimateLineOut.model_validate(ln) for ln in lines],
    )


def list_estimates(session: Session) -> list[AcctEstimateOut]:
    org = ensure_org(session)
    rows = session.scalars(
        select(AcctEstimate)
        .where(AcctEstimate.org_id == org.org_id)
        .order_by(AcctEstimate.estimate_date.desc().nullslast())
    ).all()
    return [estimate_to_out(session, r) for r in rows]


# ── Sales receipts ────────────────────────────────────────────────────────────


def create_sales_receipt(session: Session, body: AcctSalesReceiptCreate) -> AcctSalesReceiptOut:
    org = ensure_org(session)
    subtotal, tax_total, total = _line_totals(body.lines) if body.lines else (Decimal("0"), Decimal("0"), Decimal("0"))
    row = AcctSalesReceipt(
        org_id=org.org_id,
        receipt_number=body.receipt_number.strip(),
        contact_id=body.contact_id,
        project_id=body.project_id,
        status="paid",
        receipt_date=body.receipt_date or date.today(),
        payment_mode=body.payment_mode,
        currency=body.currency,
        subtotal=subtotal,
        tax_total=tax_total,
        total=total,
        notes=body.notes,
    )
    session.add(row)
    session.flush()
    _add_document_lines(session, row.sales_receipt_id, body.lines, AcctSalesReceiptLine, "sales_receipt_id")
    session.flush()
    return sales_receipt_to_out(session, row)


def sales_receipt_to_out(session: Session, row: AcctSalesReceipt) -> AcctSalesReceiptOut:
    lines = session.scalars(
        select(AcctSalesReceiptLine).where(AcctSalesReceiptLine.sales_receipt_id == row.sales_receipt_id)
    ).all()
    return AcctSalesReceiptOut(
        sales_receipt_id=row.sales_receipt_id,
        receipt_number=row.receipt_number,
        contact_id=row.contact_id,
        contact_name=_contact_name(session, row.contact_id),
        project_id=row.project_id,
        status=row.status,
        receipt_date=row.receipt_date,
        payment_mode=row.payment_mode,
        currency=row.currency,
        subtotal=row.subtotal,
        tax_total=row.tax_total,
        total=row.total,
        notes=row.notes,
        lines=[AcctSalesReceiptLineOut.model_validate(ln) for ln in lines],
    )


def list_sales_receipts(session: Session) -> list[AcctSalesReceiptOut]:
    org = ensure_org(session)
    rows = session.scalars(
        select(AcctSalesReceipt)
        .where(AcctSalesReceipt.org_id == org.org_id)
        .order_by(AcctSalesReceipt.receipt_date.desc().nullslast())
    ).all()
    return [sales_receipt_to_out(session, r) for r in rows]


# ── Purchase orders ───────────────────────────────────────────────────────────


def create_purchase_order(session: Session, body: AcctPurchaseOrderCreate) -> AcctPurchaseOrderOut:
    org = ensure_org(session)
    subtotal, tax_total, total = _line_totals(body.lines) if body.lines else (Decimal("0"), Decimal("0"), Decimal("0"))
    row = AcctPurchaseOrder(
        org_id=org.org_id,
        po_number=body.po_number.strip(),
        contact_id=body.contact_id,
        project_id=body.project_id,
        status="open",
        po_date=body.po_date or date.today(),
        expected_date=body.expected_date,
        currency=body.currency,
        subtotal=subtotal,
        tax_total=tax_total,
        total=total,
        notes=body.notes,
    )
    session.add(row)
    session.flush()
    _add_document_lines(session, row.purchase_order_id, body.lines, AcctPurchaseOrderLine, "purchase_order_id")
    session.flush()
    return purchase_order_to_out(session, row)


def purchase_order_to_out(session: Session, row: AcctPurchaseOrder) -> AcctPurchaseOrderOut:
    lines = session.scalars(
        select(AcctPurchaseOrderLine).where(AcctPurchaseOrderLine.purchase_order_id == row.purchase_order_id)
    ).all()
    return AcctPurchaseOrderOut(
        purchase_order_id=row.purchase_order_id,
        po_number=row.po_number,
        contact_id=row.contact_id,
        contact_name=_contact_name(session, row.contact_id),
        project_id=row.project_id,
        status=row.status,
        po_date=row.po_date,
        expected_date=row.expected_date,
        currency=row.currency,
        subtotal=row.subtotal,
        tax_total=row.tax_total,
        total=row.total,
        notes=row.notes,
        lines=[AcctPurchaseOrderLineOut.model_validate(ln) for ln in lines],
    )


def list_purchase_orders(session: Session) -> list[AcctPurchaseOrderOut]:
    org = ensure_org(session)
    rows = session.scalars(
        select(AcctPurchaseOrder)
        .where(AcctPurchaseOrder.org_id == org.org_id)
        .order_by(AcctPurchaseOrder.po_date.desc().nullslast())
    ).all()
    return [purchase_order_to_out(session, r) for r in rows]


# ── Aging & revenue reports ───────────────────────────────────────────────────

_AGING_BUCKETS: list[tuple[str, str]] = [
    ("current", "Current"),
    ("1_30", "1–30 days"),
    ("31_60", "31–60 days"),
    ("61_90", "61–90 days"),
    ("over_90", "90+ days"),
]


def _aging_bucket(due: date | None, ref: date) -> str:
    if not due:
        return "current"
    days = (ref - due).days
    if days <= 0:
        return "current"
    if days <= 30:
        return "1_30"
    if days <= 60:
        return "31_60"
    if days <= 90:
        return "61_90"
    return "over_90"


def _build_aging_report(
    lines: list[AcctAgingLine],
) -> AcctAgingReport:
    bucket_totals: dict[str, Decimal] = {b[0]: Decimal("0") for b in _AGING_BUCKETS}
    bucket_counts: dict[str, int] = {b[0]: 0 for b in _AGING_BUCKETS}
    for line in lines:
        bucket_totals[line.bucket] += line.balance
        bucket_counts[line.bucket] += 1
    buckets = [
        AcctAgingBucket(bucket=key, label=label, amount=bucket_totals[key], count=bucket_counts[key])
        for key, label in _AGING_BUCKETS
    ]
    total = sum((ln.balance for ln in lines), Decimal("0"))
    return AcctAgingReport(buckets=buckets, lines=lines, total_outstanding=total)


def receivables_aging(session: Session) -> AcctAgingReport:
    org = ensure_org(session)
    today = date.today()
    rows = session.scalars(
        select(AcctSalesInvoice).where(
            AcctSalesInvoice.org_id == org.org_id,
            AcctSalesInvoice.total > AcctSalesInvoice.amount_paid,
        )
    ).all()
    lines: list[AcctAgingLine] = []
    for inv in rows:
        balance = inv.total - inv.amount_paid
        if balance <= 0:
            continue
        due = inv.due_date or inv.invoice_date
        days_overdue = max(0, (today - due).days) if due else 0
        bucket = _aging_bucket(due, today)
        lines.append(
            AcctAgingLine(
                document_id=inv.sales_invoice_id,
                document_number=inv.invoice_number,
                contact_name=_contact_name(session, inv.contact_id),
                document_date=inv.invoice_date,
                due_date=due,
                days_overdue=days_overdue,
                balance=balance,
                bucket=bucket,
            )
        )
    lines.sort(key=lambda x: x.days_overdue, reverse=True)
    return _build_aging_report(lines)


def payables_aging(session: Session) -> AcctAgingReport:
    org = ensure_org(session)
    today = date.today()
    rows = session.scalars(
        select(AcctBill).where(
            AcctBill.org_id == org.org_id,
            AcctBill.total > AcctBill.amount_paid,
        )
    ).all()
    lines: list[AcctAgingLine] = []
    for bill in rows:
        balance = bill.total - bill.amount_paid
        if balance <= 0:
            continue
        due = bill.due_date or bill.bill_date
        days_overdue = max(0, (today - due).days) if due else 0
        bucket = _aging_bucket(due, today)
        lines.append(
            AcctAgingLine(
                document_id=bill.bill_id,
                document_number=bill.bill_number,
                contact_name=_contact_name(session, bill.contact_id),
                document_date=bill.bill_date,
                due_date=due,
                days_overdue=days_overdue,
                balance=balance,
                bucket=bucket,
            )
        )
    lines.sort(key=lambda x: x.days_overdue, reverse=True)
    return _build_aging_report(lines)


def _fiscal_year_start(today: date, start_month: int) -> date:
    if today.month >= start_month:
        return date(today.year, start_month, 1)
    return date(today.year - 1, start_month, 1)


def revenue_report(session: Session) -> AcctRevenueReport:
    org = ensure_org(session)
    today = date.today()
    month_start = today.replace(day=1)
    year_start = _fiscal_year_start(today, org.fiscal_year_start_month)

    invoices = session.scalars(select(AcctSalesInvoice).where(AcctSalesInvoice.org_id == org.org_id)).all()
    receipts = session.scalars(select(AcctSalesReceipt).where(AcctSalesReceipt.org_id == org.org_id)).all()
    payments = session.scalars(
        select(AcctPayment).where(
            AcctPayment.org_id == org.org_id,
            AcctPayment.payment_type == "received",
        )
    ).all()
    bills = session.scalars(select(AcctBill).where(AcctBill.org_id == org.org_id)).all()

    invoiced_mtd = Decimal("0")
    invoiced_ytd = Decimal("0")
    for inv in invoices:
        if inv.invoice_date and inv.invoice_date >= month_start:
            invoiced_mtd += inv.total
        if inv.invoice_date and inv.invoice_date >= year_start:
            invoiced_ytd += inv.total

    collected_mtd = Decimal("0")
    collected_ytd = Decimal("0")
    for pay in payments:
        if pay.payment_date and pay.payment_date >= month_start:
            collected_mtd += pay.amount
        if pay.payment_date and pay.payment_date >= year_start:
            collected_ytd += pay.amount

    sales_receipts_mtd = Decimal("0")
    sales_receipts_ytd = Decimal("0")
    for rcpt in receipts:
        if rcpt.receipt_date and rcpt.receipt_date >= month_start:
            sales_receipts_mtd += rcpt.total
        if rcpt.receipt_date and rcpt.receipt_date >= year_start:
            sales_receipts_ytd += rcpt.total

    expense_mtd = Decimal("0")
    expense_ytd = Decimal("0")
    for bill in bills:
        if bill.bill_date and bill.bill_date >= month_start:
            expense_mtd += bill.total
        if bill.bill_date and bill.bill_date >= year_start:
            expense_ytd += bill.total

    receivables = Decimal("0")
    payables = Decimal("0")
    customer_map: dict[str, AcctRevenueByCustomer] = {}

    def _cust_key(contact_id: UUID | None, name: str | None) -> str:
        return str(contact_id) if contact_id else (name or "Unknown")

    for inv in invoices:
        balance = inv.total - inv.amount_paid
        receivables += balance
        key = _cust_key(inv.contact_id, _contact_name(session, inv.contact_id))
        if key not in customer_map:
            customer_map[key] = AcctRevenueByCustomer(
                contact_id=inv.contact_id,
                contact_name=_contact_name(session, inv.contact_id) or "Unknown",
                invoiced_mtd=Decimal("0"),
                invoiced_ytd=Decimal("0"),
                collected_mtd=Decimal("0"),
                collected_ytd=Decimal("0"),
                outstanding=Decimal("0"),
            )
        c = customer_map[key]
        if inv.invoice_date and inv.invoice_date >= month_start:
            c.invoiced_mtd += inv.total
        if inv.invoice_date and inv.invoice_date >= year_start:
            c.invoiced_ytd += inv.total
        c.outstanding += balance

    for pay in payments:
        key = _cust_key(pay.contact_id, _contact_name(session, pay.contact_id))
        if key not in customer_map:
            customer_map[key] = AcctRevenueByCustomer(
                contact_id=pay.contact_id,
                contact_name=_contact_name(session, pay.contact_id) or "Unknown",
                invoiced_mtd=Decimal("0"),
                invoiced_ytd=Decimal("0"),
                collected_mtd=Decimal("0"),
                collected_ytd=Decimal("0"),
                outstanding=Decimal("0"),
            )
        c = customer_map[key]
        if pay.payment_date and pay.payment_date >= month_start:
            c.collected_mtd += pay.amount
        if pay.payment_date and pay.payment_date >= year_start:
            c.collected_ytd += pay.amount

    for bill in bills:
        payables += bill.total - bill.amount_paid

    gross_collected_mtd = collected_mtd + sales_receipts_mtd
    gross_collected_ytd = collected_ytd + sales_receipts_ytd

    return AcctRevenueReport(
        invoiced_mtd=invoiced_mtd,
        invoiced_ytd=invoiced_ytd,
        collected_mtd=gross_collected_mtd,
        collected_ytd=gross_collected_ytd,
        sales_receipts_mtd=sales_receipts_mtd,
        sales_receipts_ytd=sales_receipts_ytd,
        expense_mtd=expense_mtd,
        expense_ytd=expense_ytd,
        net_cash_mtd=gross_collected_mtd - expense_mtd,
        outstanding_receivables=receivables,
        outstanding_payables=payables,
        by_customer=sorted(customer_map.values(), key=lambda x: x.outstanding, reverse=True),
    )


def summary_reports(session: Session) -> AcctSummaryReports:
    return AcctSummaryReports(
        receivables_aging=receivables_aging(session),
        payables_aging=payables_aging(session),
        revenue=revenue_report(session),
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
