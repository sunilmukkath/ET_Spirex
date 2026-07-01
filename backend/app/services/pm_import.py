"""Bulk import PM pipeline projects from Excel or CSV."""

from __future__ import annotations

import csv
import io
import re
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Any

from openpyxl import Workbook, load_workbook
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Client, Project
from app.models.pm import PmImportResult, PmImportRowResult, PmProjectCreate
from app.services import pm_ops_store, pm_store

VALID_STAGES: set[str] = {
    "Proposal",
    "Budgeting",
    "Vendor Setup",
    "Deployment Prep",
    "Fieldwork/Data Collection",
    "QC",
    "Analysis",
    "Reporting",
    "Close-out",
    "Delivered",
}

HEADER_ALIASES: dict[str, str] = {
    "projectname": "project_name",
    "project": "project_name",
    "name": "project_name",
    "title": "project_name",
    "clientname": "client_name",
    "client": "client_name",
    "surveyid": "limesurvey_survey_id",
    "limesurveyid": "limesurvey_survey_id",
    "limesurveysurveyid": "limesurvey_survey_id",
    "limeid": "limesurvey_survey_id",
    "studyid": "limesurvey_survey_id",
    "surveyname": "survey_name",
    "limesurvey": "survey_name",
    "limesurveyname": "survey_name",
    "studyname": "survey_name",
    "projecttype": "project_type",
    "type": "project_type",
    "engagementtype": "engagement_type",
    "engagement": "engagement_type",
    "stage": "stage",
    "status": "stage",
    "owner": "owner_name",
    "ownername": "owner_name",
    "pm": "owner_name",
    "startdate": "start_date",
    "targetclosedate": "target_close_date",
    "closedate": "target_close_date",
    "duedate": "target_close_date",
    "budgetestimate": "budget_estimate",
    "budget": "budget_estimate",
    "notes": "status_notes",
    "statusnotes": "status_notes",
    "comments": "status_notes",
}

TEMPLATE_HEADERS = [
    "project_name",
    "client_name",
    "limesurvey_survey_id",
    "survey_name",
    "project_type",
    "engagement_type",
    "stage",
    "owner_name",
    "start_date",
    "target_close_date",
    "budget_estimate",
    "status_notes",
]

TEMPLATE_EXAMPLE = [
    [
        "Brand Tracker Q3 2026",
        "Acme FMCG",
        "",
        "Acme Brand Tracker Wave 3",
        "quant",
        "tracking",
        "Fieldwork/Data Collection",
        "Sunil",
        "2026-07-01",
        "2026-09-30",
        "45000",
        "Monthly tracker — link by survey name if ID blank",
    ],
    [
        "Concept Test — Snacks",
        "Retail Co",
        "123456",
        "",
        "quant",
        "ad-hoc",
        "Analysis",
        "Ambika",
        "",
        "",
        "",
        "Use limesurvey_survey_id when you know the LimeSurvey study ID",
    ],
]


def project_import_template_xlsx() -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = "Projects"
    ws.append(TEMPLATE_HEADERS)
    for row in TEMPLATE_EXAMPLE:
        ws.append(row)
    ws.freeze_panes = "A2"
    for i, w in enumerate([36, 22, 18, 36, 12, 14, 24, 14, 14, 16, 14, 40], 1):
        ws.column_dimensions[chr(64 + i) if i <= 26 else "A"].width = w
    # Fix column widths properly
    from openpyxl.utils import get_column_letter

    widths = [36, 22, 18, 36, 12, 14, 24, 14, 14, 16, 14, 40]
    for idx, w in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(idx)].width = w

    help_ws = wb.create_sheet("Help")
    help_ws["A1"] = "Column guide"
    lines = [
        "project_name — required",
        "client_name — optional; created if new",
        "limesurvey_survey_id — LimeSurvey study ID (numeric); preferred when known",
        "survey_name — match LimeSurvey study title when ID is blank",
        "project_type — quant | qual | mixed (default quant)",
        "engagement_type — tracking | ad-hoc (default ad-hoc)",
        "stage — Proposal, Fieldwork/Data Collection, Analysis, etc.",
        "owner_name — Sunil, Ambika, Shilaja, or Ravikumar",
        "start_date / target_close_date — YYYY-MM-DD",
        "budget_estimate — number",
        "status_notes — free text",
    ]
    for i, line in enumerate(lines, 2):
        help_ws.cell(i, 1, line)
    help_ws.column_dimensions["A"].width = 72

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _norm_header(value: Any) -> str:
    return re.sub(r"[^a-z0-9]", "", str(value or "").strip().lower())


def _map_headers(raw_headers: list[Any]) -> dict[int, str]:
    mapped: dict[int, str] = {}
    for idx, raw in enumerate(raw_headers):
        key = HEADER_ALIASES.get(_norm_header(raw))
        if key:
            mapped[idx] = key
    return mapped


def _parse_rows_from_xlsx(data: bytes) -> list[dict[str, str]]:
    wb = load_workbook(io.BytesIO(data), read_only=True, data_only=True)
    ws = wb.active
    rows_iter = ws.iter_rows(values_only=True)
    try:
        header_row = next(rows_iter)
    except StopIteration:
        return []
    col_map = _map_headers(list(header_row))
    if "project_name" not in col_map.values():
        raise ValueError("Sheet must include a project_name column (or alias: project, name, title)")

    out: list[dict[str, str]] = []
    for excel_row in rows_iter:
        if not excel_row or all(v is None or str(v).strip() == "" for v in excel_row):
            continue
        item: dict[str, str] = {}
        for idx, field in col_map.items():
            val = excel_row[idx] if idx < len(excel_row) else None
            if val is None:
                continue
            if isinstance(val, datetime):
                item[field] = val.date().isoformat()
            elif isinstance(val, date):
                item[field] = val.isoformat()
            else:
                item[field] = str(val).strip()
        if item.get("project_name"):
            out.append(item)
    return out


def _parse_rows_from_csv(data: bytes) -> list[dict[str, str]]:
    text = data.decode("utf-8-sig", errors="replace")
    reader = csv.reader(io.StringIO(text))
    try:
        header_row = next(reader)
    except StopIteration:
        return []
    col_map = _map_headers(header_row)
    if "project_name" not in col_map.values():
        raise ValueError("CSV must include a project_name column (or alias: project, name, title)")

    out: list[dict[str, str]] = []
    for row in reader:
        if not row or all(not str(v).strip() for v in row):
            continue
        item: dict[str, str] = {}
        for idx, field in col_map.items():
            if idx < len(row) and str(row[idx]).strip():
                item[field] = str(row[idx]).strip()
        if item.get("project_name"):
            out.append(item)
    return out


def parse_project_sheet(data: bytes, *, filename: str = "") -> list[dict[str, str]]:
    lower = filename.lower()
    if lower.endswith(".csv"):
        return _parse_rows_from_csv(data)
    if lower.endswith(".xlsx") or lower.endswith(".xlsm"):
        return _parse_rows_from_xlsx(data)
    # Sniff: CSV if no xlsx magic
    if data[:2] != b"PK":
        return _parse_rows_from_csv(data)
    return _parse_rows_from_xlsx(data)


def _parse_date(value: str | None) -> date | None:
    if not value:
        return None
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%m/%d/%Y"):
        try:
            return datetime.strptime(value.strip(), fmt).date()
        except ValueError:
            continue
    return None


def _parse_decimal(value: str | None) -> Decimal | None:
    if not value:
        return None
    cleaned = re.sub(r"[£$,]", "", value.strip())
    try:
        return Decimal(cleaned)
    except InvalidOperation:
        return None


def _load_lime_surveys() -> list[dict[str, Any]]:
    try:
        from app.lime_client import list_projects

        return list_projects() or []
    except Exception:
        return []


def _survey_indexes(surveys: list[dict[str, Any]]) -> tuple[dict[int, str], dict[str, list[int]]]:
    by_id: dict[int, str] = {}
    by_title: dict[str, list[int]] = {}
    for s in surveys:
        sid = s.get("id")
        if sid is None:
            continue
        try:
            iid = int(sid)
        except (TypeError, ValueError):
            continue
        title = str(s.get("title") or s.get("name") or "").strip()
        by_id[iid] = title
        norm = title.lower()
        by_title.setdefault(norm, []).append(iid)
    return by_id, by_title


def _resolve_survey_id(
    row: dict[str, str],
    by_id: dict[int, str],
    by_title: dict[str, list[int]],
) -> tuple[int | None, str | None]:
    raw_id = row.get("limesurvey_survey_id", "").strip()
    if raw_id:
        try:
            sid = int(float(raw_id))
        except ValueError:
            return None, f"Invalid survey ID '{raw_id}'"
        if sid not in by_id:
            return None, f"LimeSurvey study {sid} not found in connected LimeSurvey"
        return sid, None

    name = row.get("survey_name", "").strip()
    if not name:
        return None, None

    norm = name.lower()
    if norm in by_title:
        matches = by_title[norm]
        if len(matches) == 1:
            return matches[0], None
        return None, f"Multiple LimeSurvey studies match '{name}' — set limesurvey_survey_id"

    partial = [sid for title, ids in by_title.items() for sid in ids if norm in title or title in norm]
    if len(partial) == 1:
        return partial[0], f"Matched survey by partial title → ID {partial[0]}"
    if len(partial) > 1:
        return None, f"Ambiguous survey name '{name}' — set limesurvey_survey_id"

    return None, f"No LimeSurvey study matched '{name}'"


def _get_or_create_client(session: Session, name: str | None) -> Client | None:
    if not name or not name.strip():
        return None
    clean = name.strip()
    existing = session.scalar(select(Client).where(Client.client_name == clean))
    if existing:
        return existing
    from app.models.pm import ClientCreate

    out = pm_ops_store.create_client(session, ClientCreate(client_name=clean))
    return session.get(Client, out.client_id)


def _survey_already_linked(session: Session, survey_id: int) -> str | None:
    row = session.scalar(select(Project).where(Project.limesurvey_survey_id == survey_id))
    if row:
        return row.project_name
    return None


def import_projects_from_sheet(
    session: Session,
    data: bytes,
    *,
    filename: str = "",
    skip_duplicates: bool = True,
) -> PmImportResult:
    rows = parse_project_sheet(data, filename=filename)
    if not rows:
        raise ValueError("No project rows found in the file")

    surveys = _load_lime_surveys()
    by_id, by_title = _survey_indexes(surveys)

    existing_names = {
        name.lower()
        for name in session.scalars(select(Project.project_name)).all()
    }

    results: list[PmImportRowResult] = []
    created = skipped = errors = 0

    for i, row in enumerate(rows, start=2):
        name = row["project_name"].strip()
        if skip_duplicates and name.lower() in existing_names:
            skipped += 1
            results.append(
                PmImportRowResult(
                    row_number=i,
                    project_name=name,
                    status="skipped",
                    message="Project with this name already exists",
                )
            )
            continue

        survey_id, survey_note = _resolve_survey_id(row, by_id, by_title)
        if survey_note and survey_id is None:
            note_lower = survey_note.lower()
            if "invalid survey id" in note_lower or "not found in connected" in note_lower:
                errors += 1
                results.append(
                    PmImportRowResult(
                        row_number=i,
                        project_name=name,
                        status="error",
                        message=survey_note,
                    )
                )
                continue
            if "ambiguous" in note_lower or "multiple" in note_lower:
                errors += 1
                results.append(
                    PmImportRowResult(
                        row_number=i,
                        project_name=name,
                        status="error",
                        message=survey_note,
                    )
                )
                continue
            # survey_name provided but no match — create project unlinked

        if survey_id is not None:
            linked_to = _survey_already_linked(session, survey_id)
            if linked_to:
                errors += 1
                results.append(
                    PmImportRowResult(
                        row_number=i,
                        project_name=name,
                        status="error",
                        limesurvey_survey_id=survey_id,
                        message=f"Survey {survey_id} already linked to '{linked_to}'",
                    )
                )
                continue

        ptype = (row.get("project_type") or "quant").strip().lower()
        if ptype not in ("quant", "qual", "mixed"):
            ptype = "quant"
        etype = (row.get("engagement_type") or "ad-hoc").strip().lower()
        if etype not in ("tracking", "ad-hoc"):
            etype = "ad-hoc"
        stage = (row.get("stage") or "Proposal").strip()
        if stage not in VALID_STAGES:
            stage = "Proposal"

        try:
            client = _get_or_create_client(session, row.get("client_name"))
            project = pm_store.create_project(
                session,
                PmProjectCreate(
                    project_name=name,
                    client_id=client.client_id if client else None,
                    project_type=ptype,  # type: ignore[arg-type]
                    engagement_type=etype,  # type: ignore[arg-type]
                    stage=stage,  # type: ignore[arg-type]
                    owner_name=row.get("owner_name"),
                    limesurvey_survey_id=survey_id,
                    start_date=_parse_date(row.get("start_date")),
                    target_close_date=_parse_date(row.get("target_close_date")),
                    budget_estimate=_parse_decimal(row.get("budget_estimate")),
                    status_notes=row.get("status_notes"),
                ),
            )
            if survey_id is not None:
                pm_ops_store.link_survey(session, project.project_id, survey_id)

            existing_names.add(name.lower())
            created += 1
            msg_parts = ["Created"]
            if survey_id:
                msg_parts.append(f"linked to LimeSurvey #{survey_id}")
            elif survey_note:
                msg_parts.append(survey_note)
            else:
                msg_parts.append("no survey link (add survey_name or limesurvey_survey_id)")
            results.append(
                PmImportRowResult(
                    row_number=i,
                    project_name=name,
                    status="created",
                    project_id=project.project_id,
                    limesurvey_survey_id=survey_id,
                    message=" — ".join(msg_parts),
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

    return PmImportResult(
        total_rows=len(rows),
        created=created,
        skipped=skipped,
        errors=errors,
        rows=results,
    )
