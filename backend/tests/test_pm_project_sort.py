"""Tests for PM project pipeline sorting."""

from datetime import date
from types import SimpleNamespace

from app.services.pm_project_sort import parse_billing_period, sort_projects


def test_parse_billing_period_apostrophe_year():
    assert parse_billing_period("FY2024 - 2025", "April'2024") == date(2024, 4, 1)


def test_parse_billing_period_fy_and_month_name():
    assert parse_billing_period("FY2026 - 2027", "June") == date(2026, 6, 1)
    assert parse_billing_period("FY2026 - 2027", "March") == date(2027, 3, 1)


def test_delivered_projects_sort_last():
    active = SimpleNamespace(
        project_name="Active",
        stage="Analysis",
        fiscal_year="FY2026 - 2027",
        billing_month="June",
        start_date=None,
        target_close_date=None,
        updated_at=None,
        project_code="B",
    )
    delivered = SimpleNamespace(
        project_name="Old delivered",
        stage="Delivered",
        fiscal_year="FY2026 - 2027",
        billing_month="June",
        start_date=None,
        target_close_date=None,
        updated_at=None,
        project_code="A",
    )
    older_active = SimpleNamespace(
        project_name="Older active",
        stage="Proposal",
        fiscal_year="FY2025 - 2026",
        billing_month="April",
        start_date=None,
        target_close_date=None,
        updated_at=None,
        project_code="C",
    )
    ordered = sort_projects([delivered, older_active, active])
    assert [p.project_name for p in ordered] == ["Active", "Older active", "Old delivered"]
