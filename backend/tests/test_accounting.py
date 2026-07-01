"""Tests for accounting module and Zoho import."""

import io
from datetime import date, timedelta
from decimal import Decimal

import pandas as pd
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.models import Base
from app.models.accounting import (
    AcctBillCreate,
    AcctContactCreate,
    AcctDocumentLineCreate,
    AcctEstimateCreate,
    AcctInvoiceLineCreate,
    AcctPaymentCreate,
    AcctPurchaseOrderCreate,
    AcctSalesInvoiceCreate,
    AcctSalesReceiptCreate,
)
from app.services.accounting_store import (
    create_bill,
    create_contact,
    create_estimate,
    create_payment,
    create_purchase_order,
    create_sales_invoice,
    create_sales_receipt,
    dashboard,
    ensure_org,
    list_accounts,
    summary_reports,
)
from app.services.zoho_import import import_zoho_data, preview_zoho_import


@pytest.fixture()
def acct_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    factory = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    session = factory()
    try:
        yield session
        session.commit()
    finally:
        session.close()


def test_ensure_org_seeds_chart_of_accounts(acct_session):
    org = ensure_org(acct_session)
    accounts = list_accounts(acct_session)
    assert org.name == "Elastic Tree"
    assert len(accounts) >= 10
    codes = {a.code for a in accounts}
    assert "1200" in codes
    assert "4000" in codes


def test_zoho_chart_of_accounts_import(acct_session):
    ensure_org(acct_session)
    df = pd.DataFrame(
        [
            {
                "Account Name": "Marketing Spend",
                "Account Code": "5500",
                "Account Type": "Expense",
                "Description": "Ads",
            }
        ]
    )
    buf = io.BytesIO()
    df.to_csv(buf, index=False)
    result = import_zoho_data(acct_session, "chart_of_accounts", buf.getvalue(), "coa.csv")
    assert result.imported == 1
    names = {a.name for a in list_accounts(acct_session)}
    assert "Marketing Spend" in names


def test_zoho_contacts_and_invoices_import(acct_session):
    ensure_org(acct_session)
    contacts_csv = io.BytesIO()
    pd.DataFrame(
        [{"Contact Name": "Acme Corp", "Email": "a@acme.com", "Contact Type": "Customer"}]
    ).to_csv(contacts_csv, index=False)
    import_zoho_data(acct_session, "contacts", contacts_csv.getvalue(), "contacts.csv")

    inv_csv = io.BytesIO()
    pd.DataFrame(
        [
            {
                "Invoice Number": "INV-100",
                "Invoice Date": "2024-04-01",
                "Customer Name": "Acme Corp",
                "Total": "50000",
                "Balance": "0",
                "Status": "Paid",
            }
        ]
    ).to_csv(inv_csv, index=False)
    result = import_zoho_data(acct_session, "invoices", inv_csv.getvalue(), "invoices.csv")
    assert result.imported == 1
    dash = dashboard(acct_session)
    assert dash.invoice_count == 1
    assert dash.income_mtd >= 0


def test_zoho_preview(acct_session):
    ensure_org(acct_session)
    buf = io.BytesIO()
    pd.DataFrame([{"Account Name": "Test", "Account Code": "9999", "Account Type": "Income"}]).to_csv(
        buf, index=False
    )
    preview = preview_zoho_import(acct_session, "chart_of_accounts", buf.getvalue(), "coa.csv")
    assert preview.total_rows == 1
    assert preview.valid_rows == 1


def test_create_documents_and_reports(acct_session):
    ensure_org(acct_session)
    customer = create_contact(
        acct_session,
        AcctContactCreate(contact_type="customer", display_name="Acme Corp", email="a@acme.com"),
    )
    vendor = create_contact(
        acct_session,
        AcctContactCreate(contact_type="vendor", display_name="Field Vendor"),
    )
    line = AcctDocumentLineCreate(description="Research services", quantity=Decimal("1"), rate=Decimal("100000"))
    inv_line = AcctInvoiceLineCreate(description="Research services", quantity=Decimal("1"), rate=Decimal("100000"))

    create_estimate(
        acct_session,
        AcctEstimateCreate(estimate_number="EST-001", contact_id=customer.contact_id, lines=[line]),
    )
    create_sales_receipt(
        acct_session,
        AcctSalesReceiptCreate(
            receipt_number="SR-001",
            contact_id=customer.contact_id,
            payment_mode="Bank",
            lines=[line],
        ),
    )
    create_purchase_order(
        acct_session,
        AcctPurchaseOrderCreate(po_number="PO-001", contact_id=vendor.contact_id, lines=[line]),
    )

    inv = create_sales_invoice(
        acct_session,
        AcctSalesInvoiceCreate(
            invoice_number="INV-200",
            contact_id=customer.contact_id,
            invoice_date=date.today() - timedelta(days=45),
            due_date=date.today() - timedelta(days=15),
            lines=[inv_line],
        ),
    )
    create_bill(
        acct_session,
        AcctBillCreate(
            bill_number="BILL-100",
            contact_id=vendor.contact_id,
            bill_date=date.today() - timedelta(days=20),
            due_date=date.today() - timedelta(days=5),
            lines=[inv_line],
        ),
    )
    create_payment(
        acct_session,
        AcctPaymentCreate(
            payment_type="received",
            contact_id=customer.contact_id,
            amount=Decimal("50000"),
            sales_invoice_id=inv.sales_invoice_id,
        ),
    )

    dash = dashboard(acct_session)
    assert dash.estimate_count == 1
    assert dash.sales_receipt_count == 1
    assert dash.purchase_order_count == 1
    assert dash.invoice_count == 1

    reports = summary_reports(acct_session)
    assert reports.receivables_aging.total_outstanding > 0
    assert reports.payables_aging.total_outstanding > 0
    assert reports.revenue.invoiced_ytd > 0
    assert reports.revenue.collected_mtd > 0
    assert len(reports.receivables_aging.buckets) == 5
    assert any(b.count > 0 for b in reports.receivables_aging.buckets)
