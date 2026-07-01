"""Pydantic models for ET Scout accounting (Zoho Books–compatible)."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, Field


class AcctOrgOut(BaseModel):
    org_id: UUID
    name: str
    base_currency: str
    fiscal_year_start_month: int

    model_config = {"from_attributes": True}


class AcctAccountCreate(BaseModel):
    code: str
    name: str
    account_type: str
    parent_account_id: UUID | None = None
    description: str | None = None


class AcctAccountOut(BaseModel):
    account_id: UUID
    code: str
    name: str
    account_type: str
    parent_account_id: UUID | None = None
    description: str | None = None
    is_active: bool
    zoho_account_id: str | None = None

    model_config = {"from_attributes": True}


class AcctContactCreate(BaseModel):
    contact_type: str = "customer"
    display_name: str
    company_name: str | None = None
    email: str | None = None
    phone: str | None = None
    tax_id: str | None = None


class AcctContactOut(BaseModel):
    contact_id: UUID
    contact_type: str
    display_name: str
    company_name: str | None = None
    email: str | None = None
    phone: str | None = None
    tax_id: str | None = None
    zoho_contact_id: str | None = None

    model_config = {"from_attributes": True}


class AcctInvoiceLineCreate(BaseModel):
    description: str
    quantity: Decimal = Decimal("1")
    rate: Decimal
    tax_percent: Decimal = Decimal("0")
    account_id: UUID | None = None


class AcctSalesInvoiceCreate(BaseModel):
    invoice_number: str
    contact_id: UUID | None = None
    project_id: UUID | None = None
    invoice_date: date | None = None
    due_date: date | None = None
    currency: str = "INR"
    notes: str | None = None
    lines: list[AcctInvoiceLineCreate] = Field(default_factory=list)


class AcctSalesInvoiceLineOut(BaseModel):
    line_id: UUID
    description: str
    quantity: Decimal
    rate: Decimal
    tax_percent: Decimal
    line_total: Decimal
    account_id: UUID | None = None

    model_config = {"from_attributes": True}


class AcctSalesInvoiceOut(BaseModel):
    sales_invoice_id: UUID
    invoice_number: str
    contact_id: UUID | None = None
    contact_name: str | None = None
    project_id: UUID | None = None
    status: str
    invoice_date: date | None = None
    due_date: date | None = None
    currency: str
    subtotal: Decimal
    tax_total: Decimal
    total: Decimal
    amount_paid: Decimal
    balance: Decimal
    notes: str | None = None
    lines: list[AcctSalesInvoiceLineOut] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class AcctBillCreate(BaseModel):
    bill_number: str
    contact_id: UUID | None = None
    project_id: UUID | None = None
    bill_date: date | None = None
    due_date: date | None = None
    currency: str = "INR"
    notes: str | None = None
    lines: list[AcctInvoiceLineCreate] = Field(default_factory=list)


class AcctBillLineOut(BaseModel):
    line_id: UUID
    description: str
    quantity: Decimal
    rate: Decimal
    tax_percent: Decimal
    line_total: Decimal
    account_id: UUID | None = None

    model_config = {"from_attributes": True}


class AcctBillOut(BaseModel):
    bill_id: UUID
    bill_number: str
    contact_id: UUID | None = None
    contact_name: str | None = None
    project_id: UUID | None = None
    status: str
    bill_date: date | None = None
    due_date: date | None = None
    currency: str
    subtotal: Decimal
    tax_total: Decimal
    total: Decimal
    amount_paid: Decimal
    balance: Decimal
    notes: str | None = None
    lines: list[AcctBillLineOut] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class AcctPaymentCreate(BaseModel):
    payment_type: str
    contact_id: UUID | None = None
    amount: Decimal
    payment_date: date | None = None
    payment_mode: str | None = None
    reference_number: str | None = None
    sales_invoice_id: UUID | None = None
    bill_id: UUID | None = None


class AcctPaymentOut(BaseModel):
    payment_id: UUID
    payment_type: str
    contact_id: UUID | None = None
    contact_name: str | None = None
    amount: Decimal
    payment_date: date | None = None
    payment_mode: str | None = None
    reference_number: str | None = None
    sales_invoice_id: UUID | None = None
    bill_id: UUID | None = None

    model_config = {"from_attributes": True}


class AcctDocumentLineCreate(BaseModel):
    description: str
    quantity: Decimal = Decimal("1")
    rate: Decimal
    tax_percent: Decimal = Decimal("0")
    account_id: UUID | None = None


class AcctEstimateCreate(BaseModel):
    estimate_number: str
    contact_id: UUID | None = None
    project_id: UUID | None = None
    estimate_date: date | None = None
    expiry_date: date | None = None
    currency: str = "INR"
    notes: str | None = None
    lines: list[AcctDocumentLineCreate] = Field(default_factory=list)


class AcctEstimateLineOut(BaseModel):
    line_id: UUID
    description: str
    quantity: Decimal
    rate: Decimal
    tax_percent: Decimal
    line_total: Decimal
    account_id: UUID | None = None

    model_config = {"from_attributes": True}


class AcctEstimateOut(BaseModel):
    estimate_id: UUID
    estimate_number: str
    contact_id: UUID | None = None
    contact_name: str | None = None
    project_id: UUID | None = None
    status: str
    estimate_date: date | None = None
    expiry_date: date | None = None
    currency: str
    subtotal: Decimal
    tax_total: Decimal
    total: Decimal
    notes: str | None = None
    lines: list[AcctEstimateLineOut] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class AcctSalesReceiptCreate(BaseModel):
    receipt_number: str
    contact_id: UUID | None = None
    project_id: UUID | None = None
    receipt_date: date | None = None
    payment_mode: str | None = None
    currency: str = "INR"
    notes: str | None = None
    lines: list[AcctDocumentLineCreate] = Field(default_factory=list)


class AcctSalesReceiptLineOut(BaseModel):
    line_id: UUID
    description: str
    quantity: Decimal
    rate: Decimal
    tax_percent: Decimal
    line_total: Decimal
    account_id: UUID | None = None

    model_config = {"from_attributes": True}


class AcctSalesReceiptOut(BaseModel):
    sales_receipt_id: UUID
    receipt_number: str
    contact_id: UUID | None = None
    contact_name: str | None = None
    project_id: UUID | None = None
    status: str
    receipt_date: date | None = None
    payment_mode: str | None = None
    currency: str
    subtotal: Decimal
    tax_total: Decimal
    total: Decimal
    notes: str | None = None
    lines: list[AcctSalesReceiptLineOut] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class AcctPurchaseOrderCreate(BaseModel):
    po_number: str
    contact_id: UUID | None = None
    project_id: UUID | None = None
    po_date: date | None = None
    expected_date: date | None = None
    currency: str = "INR"
    notes: str | None = None
    lines: list[AcctDocumentLineCreate] = Field(default_factory=list)


class AcctPurchaseOrderLineOut(BaseModel):
    line_id: UUID
    description: str
    quantity: Decimal
    rate: Decimal
    tax_percent: Decimal
    line_total: Decimal
    account_id: UUID | None = None

    model_config = {"from_attributes": True}


class AcctPurchaseOrderOut(BaseModel):
    purchase_order_id: UUID
    po_number: str
    contact_id: UUID | None = None
    contact_name: str | None = None
    project_id: UUID | None = None
    status: str
    po_date: date | None = None
    expected_date: date | None = None
    currency: str
    subtotal: Decimal
    tax_total: Decimal
    total: Decimal
    notes: str | None = None
    lines: list[AcctPurchaseOrderLineOut] = Field(default_factory=list)

    model_config = {"from_attributes": True}


class AcctAgingBucket(BaseModel):
    bucket: str
    label: str
    amount: Decimal
    count: int


class AcctAgingLine(BaseModel):
    document_id: UUID
    document_number: str
    contact_name: str | None = None
    document_date: date | None = None
    due_date: date | None = None
    days_overdue: int
    balance: Decimal
    bucket: str


class AcctAgingReport(BaseModel):
    buckets: list[AcctAgingBucket]
    lines: list[AcctAgingLine]
    total_outstanding: Decimal


class AcctRevenueByCustomer(BaseModel):
    contact_id: UUID | None = None
    contact_name: str
    invoiced_mtd: Decimal
    invoiced_ytd: Decimal
    collected_mtd: Decimal
    collected_ytd: Decimal
    outstanding: Decimal


class AcctRevenueReport(BaseModel):
    invoiced_mtd: Decimal
    invoiced_ytd: Decimal
    collected_mtd: Decimal
    collected_ytd: Decimal
    sales_receipts_mtd: Decimal
    sales_receipts_ytd: Decimal
    expense_mtd: Decimal
    expense_ytd: Decimal
    net_cash_mtd: Decimal
    outstanding_receivables: Decimal
    outstanding_payables: Decimal
    by_customer: list[AcctRevenueByCustomer]


class AcctSummaryReports(BaseModel):
    receivables_aging: AcctAgingReport
    payables_aging: AcctAgingReport
    revenue: AcctRevenueReport


class AcctDashboard(BaseModel):
    total_receivables: Decimal
    total_payables: Decimal
    income_mtd: Decimal
    expense_mtd: Decimal
    cash_balance: Decimal
    invoice_count: int
    bill_count: int
    estimate_count: int = 0
    sales_receipt_count: int = 0
    purchase_order_count: int = 0
    contact_count: int
    account_count: int


class ZohoImportModuleInfo(BaseModel):
    module: str
    label: str
    description: str
    sample_columns: list[str]


class ZohoImportPreviewRow(BaseModel):
    row: int
    status: str
    message: str
    preview: dict[str, str]


class ZohoImportPreview(BaseModel):
    module: str
    total_rows: int
    valid_rows: int
    error_rows: int
    rows: list[ZohoImportPreviewRow]


class ZohoImportResult(BaseModel):
    module: str
    imported: int
    skipped: int
    errors: list[str]
