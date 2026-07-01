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


class AcctPaymentOut(BaseModel):
    payment_id: UUID
    payment_type: str
    contact_id: UUID | None = None
    contact_name: str | None = None
    amount: Decimal
    payment_date: date | None = None
    payment_mode: str | None = None
    reference_number: str | None = None

    model_config = {"from_attributes": True}


class AcctDashboard(BaseModel):
    total_receivables: Decimal
    total_payables: Decimal
    income_mtd: Decimal
    expense_mtd: Decimal
    cash_balance: Decimal
    invoice_count: int
    bill_count: int
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
