"""Tests for accounting module and Zoho import."""

import io

import pandas as pd
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.models import Base
from app.services.accounting_store import dashboard, ensure_org, list_accounts
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
