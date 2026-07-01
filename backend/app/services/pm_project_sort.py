"""Sort PM pipeline projects: latest activity first, Delivered at the bottom."""

from __future__ import annotations

import calendar
import re
from datetime import date, datetime
from typing import Any

_DELIVERED = "Delivered"

_MONTH_BY_NAME = {name.lower(): i for i, name in enumerate(calendar.month_name) if name}
_MONTH_BY_ABBR = {name.lower(): i for i, name in enumerate(calendar.month_abbr) if name}


def _month_number(raw: str) -> int | None:
    key = raw.strip().lower()
    if key in _MONTH_BY_NAME:
        return _MONTH_BY_NAME[key]
    if key in _MONTH_BY_ABBR:
        return _MONTH_BY_ABBR[key]
    return None


def _fy_start_year(fiscal_year: str | None) -> int | None:
    if not fiscal_year:
        return None
    match = re.search(r"FY\s*(\d{4})", fiscal_year, re.I)
    if match:
        return int(match.group(1))
    match = re.search(r"(\d{4})", fiscal_year)
    return int(match.group(1)) if match else None


def parse_billing_period(fiscal_year: str | None, billing_month: str | None) -> date | None:
    """Turn FY + Month (or April'2024) into a sortable month-start date."""
    if not billing_month:
        return None
    text = billing_month.strip()
    if not text or text.lower() == "nan":
        return None

    quoted = re.match(r"^([A-Za-z]+)'(\d{4})$", text)
    if quoted:
        month_num = _month_number(quoted.group(1))
        if month_num:
            return date(int(quoted.group(2)), month_num, 1)

    month_num = _month_number(text)
    if not month_num:
        return None

    fy_start = _fy_start_year(fiscal_year)
    if fy_start is None:
        return date(datetime.now().year, month_num, 1)

    # Indian FY: April–December use start year; Jan–March use start year + 1
    year = fy_start if month_num >= 4 else fy_start + 1
    return date(year, month_num, 1)


def project_activity_date(project: Any) -> date | None:
    """Best available date for pipeline ordering."""
    period = parse_billing_period(
        getattr(project, "fiscal_year", None),
        getattr(project, "billing_month", None),
    )
    if period:
        return period
    start = getattr(project, "start_date", None)
    if start:
        return start
    target = getattr(project, "target_close_date", None)
    if target:
        return target
    updated = getattr(project, "updated_at", None)
    if isinstance(updated, datetime):
        return updated.date()
    return None


def project_pipeline_sort_key(project: Any) -> tuple[Any, ...]:
    """Delivered last; within each group newest billing/activity date first."""
    stage = (getattr(project, "stage", None) or "").strip()
    delivered_rank = 1 if stage == _DELIVERED else 0
    activity = project_activity_date(project)
    activity_ordinal = activity.toordinal() if activity else 0
    code = (getattr(project, "project_code", None) or "").strip()
    name = (getattr(project, "project_name", None) or "").lower()
    return (delivered_rank, -activity_ordinal, code, name)


def sort_projects(projects: list[Any]) -> list[Any]:
    return sorted(projects, key=project_pipeline_sort_key)
