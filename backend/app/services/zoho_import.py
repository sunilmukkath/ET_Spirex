"""Import data from Zoho Books CSV/XLS exports into ET Scout accounting."""

from __future__ import annotations

import io
import re
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Any

import pandas as pd
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import AcctAccount, AcctBill, AcctContact, AcctPayment, AcctSalesInvoice
from app.models.accounting import ZohoImportPreview, ZohoImportPreviewRow, ZohoImportResult
from app.services.accounting_store import ensure_org, find_contact_by_name

ZOHO_MODULES: dict[str, dict[str, Any]] = {
    "chart_of_accounts": {
        "label": "Chart of Accounts",
        "description": "Zoho Books → Accountant → Chart of Accounts → Export",
        "sample_columns": ["Account Name", "Account Code", "Account Type", "Description"],
    },
    "contacts": {
        "label": "Contacts (Customers & Vendors)",
        "description": "Zoho Books → Contacts → Export",
        "sample_columns": ["Contact Name", "Company Name", "Email", "Phone", "Contact Type"],
    },
    "invoices": {
        "label": "Sales Invoices",
        "description": "Zoho Books → Sales → Invoices → Export",
        "sample_columns": [
            "Invoice Number",
            "Invoice Date",
            "Due Date",
            "Customer Name",
            "Total",
            "Balance",
            "Status",
        ],
    },
    "bills": {
        "label": "Bills (Purchases)",
        "description": "Zoho Books → Purchases → Bills → Export",
        "sample_columns": ["Bill Number", "Bill Date", "Due Date", "Vendor Name", "Total", "Balance"],
    },
    "payments": {
        "label": "Payments",
        "description": "Zoho Books → Payments Received / Made → Export",
        "sample_columns": ["Date", "Amount", "Payment Mode", "Reference Number", "Customer Name"],
    },
}

ACCOUNT_TYPE_MAP: dict[str, str] = {
    "cash": "asset",
    "bank": "asset",
    "accounts receivable": "asset",
    "other asset": "asset",
    "fixed asset": "asset",
    "accounts payable": "liability",
    "credit card": "liability",
    "other liability": "liability",
    "other current liability": "liability",
    "equity": "equity",
    "income": "income",
    "other income": "income",
    "expense": "expense",
    "cost of goods sold": "expense",
    "other expense": "expense",
}


def list_zoho_modules() -> list[dict[str, Any]]:
    return [{"module": k, **v} for k, v in ZOHO_MODULES.items()]


def _normalize_header(h: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", str(h).strip().lower())


def _read_sheet(file_bytes: bytes, filename: str) -> pd.DataFrame:
    name = filename.lower()
    if name.endswith(".csv") or name.endswith(".tsv"):
        sep = "\t" if name.endswith(".tsv") else ","
        return pd.read_csv(io.BytesIO(file_bytes), sep=sep, dtype=str).fillna("")
    return pd.read_excel(io.BytesIO(file_bytes), dtype=str).fillna("")


def _col_map(df: pd.DataFrame, aliases: dict[str, list[str]]) -> dict[str, str]:
    norm = {_normalize_header(c): c for c in df.columns}
    out: dict[str, str] = {}
    for field, keys in aliases.items():
        for key in keys:
            if key in norm:
                out[field] = norm[key]
                break
    return out


def _parse_date(raw: str) -> date | None:
    raw = str(raw).strip()
    if not raw:
        return None
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%m/%d/%Y", "%d %b %Y"):
        try:
            return datetime.strptime(raw, fmt).date()
        except ValueError:
            continue
    try:
        return pd.to_datetime(raw).date()
    except Exception:
        return None


def _parse_decimal(raw: str) -> Decimal:
    raw = str(raw).strip().replace(",", "")
    if not raw:
        return Decimal("0")
    try:
        return Decimal(raw)
    except InvalidOperation:
        return Decimal("0")


def _map_account_type(zoho_type: str) -> str:
    key = zoho_type.strip().lower()
    return ACCOUNT_TYPE_MAP.get(key, "expense")


def preview_zoho_import(
    session: Session, module: str, file_bytes: bytes, filename: str
) -> ZohoImportPreview:
    if module not in ZOHO_MODULES:
        raise ValueError(f"Unknown module: {module}")
    df = _read_sheet(file_bytes, filename)
    rows: list[ZohoImportPreviewRow] = []
    valid = 0
    for i, row in df.iterrows():
        idx = int(i) + 2
        try:
            preview = _preview_row(module, row, df.columns)
            rows.append(ZohoImportPreviewRow(row=idx, status="ok", message="", preview=preview))
            valid += 1
        except Exception as exc:
            rows.append(
                ZohoImportPreviewRow(row=idx, status="error", message=str(exc), preview={})
            )
    return ZohoImportPreview(
        module=module,
        total_rows=len(df),
        valid_rows=valid,
        error_rows=len(df) - valid,
        rows=rows[:200],
    )


def _preview_row(module: str, row: pd.Series, columns: Any) -> dict[str, str]:
    data = {str(c): str(row[c]) for c in columns}
    if module == "chart_of_accounts":
        return {
            "code": _pick(data, ["Account Code", "Account Code*"]),
            "name": _pick(data, ["Account Name", "Account Name*"]),
            "type": _pick(data, ["Account Type", "Account Type*"]),
        }
    if module == "contacts":
        return {
            "name": _pick(data, ["Contact Name", "Display Name", "Customer Name", "Vendor Name"]),
            "email": _pick(data, ["Email", "Email ID"]),
            "type": _pick(data, ["Contact Type", "Type"], default="customer"),
        }
    if module == "invoices":
        return {
            "number": _pick(data, ["Invoice Number", "Invoice#"]),
            "customer": _pick(data, ["Customer Name", "Contact Name"]),
            "total": _pick(data, ["Total", "Invoice Total"]),
        }
    if module == "bills":
        return {
            "number": _pick(data, ["Bill Number", "Bill#"]),
            "vendor": _pick(data, ["Vendor Name", "Contact Name"]),
            "total": _pick(data, ["Total", "Bill Total"]),
        }
    if module == "payments":
        return {
            "date": _pick(data, ["Date", "Payment Date"]),
            "amount": _pick(data, ["Amount", "Payment Amount"]),
            "contact": _pick(data, ["Customer Name", "Vendor Name", "Contact Name"]),
        }
    return {}


def _pick(data: dict[str, str], keys: list[str], default: str = "") -> str:
    norm = {_normalize_header(k): v for k, v in data.items()}
    for key in keys:
        val = norm.get(_normalize_header(key), "")
        if str(val).strip():
            return str(val).strip()
    return default


def import_zoho_data(
    session: Session, module: str, file_bytes: bytes, filename: str, *, dry_run: bool = False
) -> ZohoImportResult:
    if module not in ZOHO_MODULES:
        raise ValueError(f"Unknown module: {module}")
    org = ensure_org(session)
    df = _read_sheet(file_bytes, filename)
    imported = 0
    skipped = 0
    errors: list[str] = []

    if module == "chart_of_accounts":
        cmap = _col_map(
            df,
            {
                "code": ["accountcode", "code"],
                "name": ["accountname", "name"],
                "type": ["accounttype", "type"],
                "desc": ["description", "desc"],
                "zoho_id": ["accountid", "zohoaccountid"],
            },
        )
        for i, row in df.iterrows():
            try:
                code = str(row.get(cmap.get("code", ""), "")).strip() or f"IMP{i}"
                name = str(row.get(cmap.get("name", ""), "")).strip()
                if not name:
                    skipped += 1
                    continue
                zoho_type = str(row.get(cmap.get("type", ""), "expense"))
                existing = session.scalar(
                    select(AcctAccount).where(
                        AcctAccount.org_id == org.org_id,
                        AcctAccount.code == code,
                    )
                )
                if existing:
                    skipped += 1
                    continue
                if not dry_run:
                    session.add(
                        AcctAccount(
                            org_id=org.org_id,
                            code=code,
                            name=name,
                            account_type=_map_account_type(zoho_type),
                            description=str(row.get(cmap.get("desc", ""), "") or None) or None,
                            zoho_account_id=str(row.get(cmap.get("zoho_id", ""), "") or None) or None,
                        )
                    )
                imported += 1
            except Exception as exc:
                errors.append(f"Row {int(i) + 2}: {exc}")

    elif module == "contacts":
        cmap = _col_map(
            df,
            {
                "name": ["contactname", "displayname", "customername", "vendorname", "name"],
                "company": ["companyname", "company"],
                "email": ["email", "emailid"],
                "phone": ["phone", "mobile"],
                "type": ["contacttype", "type"],
                "zoho_id": ["contactid", "zohocontactid"],
            },
        )
        for i, row in df.iterrows():
            try:
                name = str(row.get(cmap.get("name", ""), "")).strip()
                if not name:
                    skipped += 1
                    continue
                ctype_raw = str(row.get(cmap.get("type", ""), "customer")).lower()
                ctype = "vendor" if "vendor" in ctype_raw else "customer"
                if find_contact_by_name(session, org.org_id, name):
                    skipped += 1
                    continue
                if not dry_run:
                    session.add(
                        AcctContact(
                            org_id=org.org_id,
                            contact_type=ctype,
                            display_name=name,
                            company_name=str(row.get(cmap.get("company", ""), "") or None) or None,
                            email=str(row.get(cmap.get("email", ""), "") or None) or None,
                            phone=str(row.get(cmap.get("phone", ""), "") or None) or None,
                            zoho_contact_id=str(row.get(cmap.get("zoho_id", ""), "") or None) or None,
                        )
                    )
                imported += 1
            except Exception as exc:
                errors.append(f"Row {int(i) + 2}: {exc}")

    elif module == "invoices":
        cmap = _col_map(
            df,
            {
                "number": ["invoicenumber", "invoice", "invoice"],
                "date": ["invoicedate", "date"],
                "due": ["duedate"],
                "customer": ["customername", "contactname"],
                "total": ["total", "invoicetotal"],
                "balance": ["balance"],
                "status": ["status"],
                "zoho_id": ["invoiceid", "zohoinvoiceid"],
            },
        )
        for i, row in df.iterrows():
            try:
                num = str(row.get(cmap.get("number", ""), "")).strip() or f"INV-IMP-{i}"
                total = _parse_decimal(str(row.get(cmap.get("total", ""), "0")))
                balance = _parse_decimal(str(row.get(cmap.get("balance", ""), str(total))))
                paid = total - balance
                customer = str(row.get(cmap.get("customer", ""), "")).strip()
                contact = find_contact_by_name(session, org.org_id, customer) if customer else None
                existing = session.scalar(
                    select(AcctSalesInvoice).where(
                        AcctSalesInvoice.org_id == org.org_id,
                        AcctSalesInvoice.invoice_number == num,
                    )
                )
                if existing:
                    skipped += 1
                    continue
                status_raw = str(row.get(cmap.get("status", ""), "")).lower()
                status = "paid" if "paid" in status_raw else "sent"
                if not dry_run:
                    session.add(
                        AcctSalesInvoice(
                            org_id=org.org_id,
                            invoice_number=num,
                            contact_id=contact.contact_id if contact else None,
                            status=status,
                            invoice_date=_parse_date(str(row.get(cmap.get("date", ""), ""))),
                            due_date=_parse_date(str(row.get(cmap.get("due", ""), ""))),
                            subtotal=total,
                            tax_total=Decimal("0"),
                            total=total,
                            amount_paid=paid,
                            zoho_invoice_id=str(row.get(cmap.get("zoho_id", ""), "") or None) or None,
                        )
                    )
                imported += 1
            except Exception as exc:
                errors.append(f"Row {int(i) + 2}: {exc}")

    elif module == "bills":
        cmap = _col_map(
            df,
            {
                "number": ["billnumber", "bill"],
                "date": ["billdate", "date"],
                "due": ["duedate"],
                "vendor": ["vendorname", "contactname"],
                "total": ["total", "billtotal"],
                "balance": ["balance"],
                "zoho_id": ["billid", "zohobillid"],
            },
        )
        for i, row in df.iterrows():
            try:
                num = str(row.get(cmap.get("number", ""), "")).strip() or f"BILL-IMP-{i}"
                total = _parse_decimal(str(row.get(cmap.get("total", ""), "0")))
                balance = _parse_decimal(str(row.get(cmap.get("balance", ""), str(total))))
                paid = total - balance
                vendor = str(row.get(cmap.get("vendor", ""), "")).strip()
                contact = find_contact_by_name(session, org.org_id, vendor) if vendor else None
                existing = session.scalar(
                    select(AcctBill).where(
                        AcctBill.org_id == org.org_id, AcctBill.bill_number == num
                    )
                )
                if existing:
                    skipped += 1
                    continue
                if not dry_run:
                    session.add(
                        AcctBill(
                            org_id=org.org_id,
                            bill_number=num,
                            contact_id=contact.contact_id if contact else None,
                            status="paid" if paid >= total and total > 0 else "open",
                            bill_date=_parse_date(str(row.get(cmap.get("date", ""), ""))),
                            due_date=_parse_date(str(row.get(cmap.get("due", ""), ""))),
                            subtotal=total,
                            tax_total=Decimal("0"),
                            total=total,
                            amount_paid=paid,
                            zoho_bill_id=str(row.get(cmap.get("zoho_id", ""), "") or None) or None,
                        )
                    )
                imported += 1
            except Exception as exc:
                errors.append(f"Row {int(i) + 2}: {exc}")

    elif module == "payments":
        cmap = _col_map(
            df,
            {
                "date": ["date", "paymentdate"],
                "amount": ["amount", "paymentamount"],
                "mode": ["paymentmode", "mode"],
                "ref": ["referencenumber", "reference"],
                "contact": ["customername", "vendorname", "contactname"],
                "type": ["paymenttype", "type"],
                "zoho_id": ["paymentid", "zohopaymentid"],
            },
        )
        for i, row in df.iterrows():
            try:
                amount = _parse_decimal(str(row.get(cmap.get("amount", ""), "0")))
                if amount <= 0:
                    skipped += 1
                    continue
                contact_name = str(row.get(cmap.get("contact", ""), "")).strip()
                contact = find_contact_by_name(session, org.org_id, contact_name) if contact_name else None
                ptype_raw = str(row.get(cmap.get("type", ""), "received")).lower()
                ptype = "made" if "made" in ptype_raw or "vendor" in ptype_raw else "received"
                if not dry_run:
                    session.add(
                        AcctPayment(
                            org_id=org.org_id,
                            payment_type=ptype,
                            contact_id=contact.contact_id if contact else None,
                            amount=amount,
                            payment_date=_parse_date(str(row.get(cmap.get("date", ""), ""))),
                            payment_mode=str(row.get(cmap.get("mode", ""), "") or None) or None,
                            reference_number=str(row.get(cmap.get("ref", ""), "") or None) or None,
                            zoho_payment_id=str(row.get(cmap.get("zoho_id", ""), "") or None) or None,
                        )
                    )
                imported += 1
            except Exception as exc:
                errors.append(f"Row {int(i) + 2}: {exc}")

    if not dry_run:
        session.flush()

    return ZohoImportResult(module=module, imported=imported, skipped=skipped, errors=errors[:50])
