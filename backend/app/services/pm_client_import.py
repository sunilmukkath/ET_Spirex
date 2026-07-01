"""Import / update CRM clients from the bundled client contact master sheet."""

from __future__ import annotations

import io
import re
from pathlib import Path
from typing import Any

import pandas as pd
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import Client
from app.models.pm import ClientCreate, PmImportResult, PmImportRowResult
from app.services import pm_ops_store

_CONTACT_SHEET_PATH = (
    Path(__file__).resolve().parents[2] / "assets" / "import" / "client_contact_master.xlsx"
)


def bundled_client_contact_sheet() -> bytes | None:
    if not _CONTACT_SHEET_PATH.is_file():
        return None
    return _CONTACT_SHEET_PATH.read_bytes()


def _cell_str(value: Any) -> str:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return ""
    return str(value).strip()


def _norm_name(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", value.lower())


def parse_client_contact_sheet(data: bytes, *, filename: str = "") -> list[dict[str, str]]:
    lower = (filename or "").lower()
    if lower.endswith(".csv"):
        df = pd.read_csv(io.BytesIO(data))
    else:
        df = pd.read_excel(io.BytesIO(data))
    if df.empty:
        return []

    col_map = {str(c).strip().lower(): c for c in df.columns}
    rows: list[dict[str, str]] = []
    for _, raw in df.iterrows():
        billing = _cell_str(raw.get(col_map.get("billing name", "Billing Name"), ""))
        if not billing:
            continue
        rows.append(
            {
                "customer_id": _cell_str(raw.get(col_map.get("customer id", "Customer Id"), "")),
                "billing_name": billing,
                "address": _cell_str(raw.get(col_map.get("address", "Address"), "")),
                "gst_number": _cell_str(raw.get(col_map.get("gst number", "Gst Number"), "")),
                "state": _cell_str(raw.get(col_map.get("state", "State"), "")),
                "contact_1_name": _cell_str(raw.get(col_map.get("contact 1 name", "Contact 1 Name"), "")),
                "contact_1_number": _cell_str(raw.get(col_map.get("contact 1 number", "Contact 1 Number"), "")),
                "contact_1_email": _cell_str(raw.get(col_map.get("contact 1 email id", "Contact 1 Email Id"), "")),
                "contact_2_name": _cell_str(raw.get(col_map.get("contact 2 name", "Contact 2 Name"), "")),
                "contact_2_number": _cell_str(raw.get(col_map.get("contact 2 number", "Contact 2 Number"), "")),
                "contact_2_email": _cell_str(raw.get(col_map.get("contact 2 email id", "Contact 2 Email Id"), "")),
                "contact_3_name": _cell_str(raw.get(col_map.get("contact 3 name", "Contact 3 Name"), "")),
                "contact_3_number": _cell_str(raw.get(col_map.get("contact 3 number", "Contact 3 Number"), "")),
                "contact_3_email": _cell_str(raw.get(col_map.get("contact 3 email id", "Contact 3 Email Id"), "")),
            }
        )
    return rows


def _format_notes(row: dict[str, str]) -> str:
    lines: list[str] = []
    if row["customer_id"]:
        lines.append(f"Customer ID: {row['customer_id']}")
    if row["address"]:
        lines.append(f"Address: {row['address']}")
    if row["gst_number"]:
        lines.append(f"GST: {row['gst_number']}")
    if row["state"]:
        lines.append(f"State: {row['state']}")
    if row["contact_1_number"]:
        lines.append(f"Phone: {row['contact_1_number']}")

    extra_contacts: list[str] = []
    for idx in (2, 3):
        name = row[f"contact_{idx}_name"]
        number = row[f"contact_{idx}_number"]
        email = row[f"contact_{idx}_email"]
        if name or number or email:
            parts = [p for p in (name, number, email) if p]
            extra_contacts.append(f"Contact {idx}: {', '.join(parts)}")
    if extra_contacts:
        lines.extend(extra_contacts)
    return "\n".join(lines)


def _find_client(session: Session, billing_name: str) -> Client | None:
    clean = billing_name.strip()
    found = session.scalar(select(Client).where(func.lower(Client.client_name) == clean.lower()))
    if found:
        return found
    target = _norm_name(clean)
    if not target:
        return None
    for client in session.scalars(select(Client)).all():
        if _norm_name(client.client_name) == target:
            return client
    return None


def _apply_contact_row(client: Client, row: dict[str, str]) -> list[str]:
    changes: list[str] = []
    notes = _format_notes(row)
    contact_person = row["contact_1_name"] or None
    contact_email = row["contact_1_email"] or None

    if contact_person and client.contact_person != contact_person:
        client.contact_person = contact_person
        changes.append("contact_person")
    if contact_email and client.contact_email != contact_email:
        client.contact_email = contact_email
        changes.append("contact_email")
    if notes and client.notes != notes:
        client.notes = notes
        changes.append("notes")
    if row["state"] and client.sector != row["state"]:
        client.sector = row["state"]
        changes.append("state")
    return changes


def import_clients_from_contact_sheet(
    session: Session,
    data: bytes,
    *,
    filename: str = "",
) -> PmImportResult:
    rows = parse_client_contact_sheet(data, filename=filename)
    if not rows:
        raise ValueError("No client rows found in the file")

    results: list[PmImportRowResult] = []
    created = updated = skipped = errors = 0

    for i, row in enumerate(rows, start=2):
        name = row["billing_name"]
        try:
            client = _find_client(session, name)
            if client:
                changes = _apply_contact_row(client, row)
                if changes:
                    updated += 1
                    session.flush()
                    results.append(
                        PmImportRowResult(
                            row_number=i,
                            project_name=name,
                            status="updated",
                            project_id=client.client_id,
                            message=", ".join(changes),
                        )
                    )
                else:
                    skipped += 1
                    results.append(
                        PmImportRowResult(
                            row_number=i,
                            project_name=name,
                            status="skipped",
                            project_id=client.client_id,
                            message="Already up to date",
                        )
                    )
                continue

            notes = _format_notes(row)
            created_row = pm_ops_store.create_client(
                session,
                ClientCreate(
                    client_name=name,
                    sector=row["state"] or None,
                    contact_person=row["contact_1_name"] or None,
                    contact_email=row["contact_1_email"] or None,
                    notes=notes or None,
                ),
            )
            created += 1
            results.append(
                PmImportRowResult(
                    row_number=i,
                    project_name=name,
                    status="created",
                    project_id=created_row.client_id,
                )
            )
        except Exception as exc:
            errors += 1
            results.append(
                PmImportRowResult(
                    row_number=i,
                    project_name=name,
                    status="error",
                    message=str(exc),
                )
            )

    session.flush()
    return PmImportResult(
        total_rows=len(rows),
        created=created,
        updated=updated,
        skipped=skipped,
        errors=errors,
        rows=results,
    )


def bootstrap_clients_from_master(session: Session) -> PmImportResult | None:
    data = bundled_client_contact_sheet()
    if not data:
        return None
    return import_clients_from_contact_sheet(session, data, filename="client_contact_master.xlsx")
