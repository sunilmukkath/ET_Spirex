"""Tests for PM project sheet import."""

import io

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.models import Base, Project, TeamMember
from app.db.session import reset_engine_for_tests
from app.services.pm_import import (
    configure_import_from_master,
    import_projects_from_sheet,
    inspect_project_sheet,
    parse_project_sheet,
    project_import_template_xlsx,
)


@pytest.fixture()
def pm_session():
    reset_engine_for_tests()
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=engine)
    factory = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    session = factory()
    session.add(TeamMember(name="Sunil", role="researcher"))
    session.commit()
    try:
        yield session
        session.commit()
    finally:
        session.close()
        engine.dispose()
        reset_engine_for_tests()


def test_template_generates_xlsx():
    raw = project_import_template_xlsx()
    assert len(raw) > 1000
    assert raw[:2] == b"PK"


def test_parse_csv_rows():
    csv_data = (
        "project_name,client_name,limesurvey_survey_id,stage\n"
        "Tracker A,Acme,1001,Analysis\n"
        "Tracker B,,,Proposal\n"
    ).encode()
    rows = parse_project_sheet(csv_data, filename="projects.csv")
    assert len(rows) == 2
    assert rows[0]["project_name"] == "Tracker A"
    assert rows[0]["limesurvey_survey_id"] == "1001"


def test_import_creates_projects_with_survey_id(pm_session, monkeypatch):
    monkeypatch.setattr(
        "app.services.pm_import._load_lime_surveys",
        lambda: [{"id": 1001, "title": "Acme Tracker"}],
    )
    csv_data = (
        "Project No,FY,Month,project_name,client_name,limesurvey_survey_id,owner_name,Project_Value_INR\n"
        "P2024_001,FY2024 - 2025,April'2024,Imported Study,Acme Ltd,1001,Sunil,75000\n"
    ).encode()
    result = import_projects_from_sheet(pm_session, csv_data, filename="p.csv")
    assert result.created == 1
    assert result.errors == 0
    assert result.rows[0].limesurvey_survey_id == 1001
    project = pm_session.query(Project).filter_by(project_name="Imported Study").one()
    assert project.project_code == "P2024_001"
    assert project.fiscal_year == "FY2024 - 2025"
    assert project.billing_month == "April'2024"
    assert str(project.project_value_inr) == "75000.00"
    assert str(project.budget_estimate) == "75000.00"


def test_import_matches_survey_by_name(pm_session, monkeypatch):
    monkeypatch.setattr(
        "app.services.pm_import._load_lime_surveys",
        lambda: [{"id": 555, "title": "Brand Health Wave 2"}],
    )
    csv_data = "project_name,survey_name\nHealth Study,Brand Health Wave 2\n".encode()
    result = import_projects_from_sheet(pm_session, csv_data, filename="p.csv")
    assert result.created == 1
    assert result.rows[0].limesurvey_survey_id == 555


def test_inspect_and_configure_csv_master(tmp_path, monkeypatch):
    from app.services import project_import_config

    monkeypatch.setattr(project_import_config, "_CONFIG_DIR", tmp_path)
    monkeypatch.setattr(project_import_config, "_MAPPING_PATH", tmp_path / "project_import_mapping.json")
    monkeypatch.setattr(project_import_config, "_TEMPLATE_PATH", tmp_path / "project_import_master.xlsx")

    csv_data = (
        "Project No,FY,Month,Project Title,Client Org,Lime ID,Project_Value_INR\n"
        "P2024_001,FY2024 - 2025,April'2024,Tracker A,Acme,1001,75000\n"
        "P2024_002,FY2024 - 2025,April'2024,Tracker B,Retail,,483219\n"
    ).encode()
    preview = inspect_project_sheet(csv_data, filename="master.csv")
    assert preview["row_count"] == 2
    assert "Project Title" in preview["headers"]
    assert preview["suggested_column_map"]["Project Title"] == "project_name"
    assert preview["suggested_column_map"]["Project No"] == "project_code"
    assert preview["suggested_column_map"]["FY"] == "fiscal_year"
    assert preview["suggested_column_map"]["Month"] == "billing_month"
    assert preview["suggested_column_map"]["Project_Value_INR"] == "project_value_inr"

    config = configure_import_from_master(csv_data, filename="master.csv")
    assert config["configured"] is True
    assert config["column_map"]["Project Title"] == "project_name"
    assert config["column_map"]["Project_Value_INR"] == "project_value_inr"
    assert config["template_exists"] is True


def test_custom_mapping_used_on_import(pm_session, monkeypatch, tmp_path):
    from app.services import project_import_config

    monkeypatch.setattr(project_import_config, "_CONFIG_DIR", tmp_path)
    monkeypatch.setattr(project_import_config, "_MAPPING_PATH", tmp_path / "project_import_mapping.json")
    monkeypatch.setattr(project_import_config, "_TEMPLATE_PATH", tmp_path / "project_import_master.xlsx")
    monkeypatch.setattr("app.services.pm_import._load_lime_surveys", lambda: [])

    configure_import_from_master(
        "Project Title,Buyer\nAlpha Study,Acme\n".encode(),
        filename="master.csv",
    )
    result = import_projects_from_sheet(
        pm_session,
        "Project Title,Buyer\nBeta Study,Retail\n".encode(),
        filename="import.csv",
    )
    assert result.created == 1
    assert result.rows[0].project_name == "Beta Study"


def test_import_skips_duplicate_name(pm_session, monkeypatch):
    monkeypatch.setattr("app.services.pm_import._load_lime_surveys", lambda: [])
    csv_data = "project_name\nDuplicate\nDuplicate\n".encode()
    result = import_projects_from_sheet(pm_session, csv_data, filename="p.csv")
    assert result.created == 1
    assert result.skipped == 1
