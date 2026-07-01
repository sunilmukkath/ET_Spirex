"""Tests for PM project sheet import."""

import io

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.models import Base, TeamMember
from app.db.session import reset_engine_for_tests
from app.services.pm_import import import_projects_from_sheet, parse_project_sheet, project_import_template_xlsx


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
        "project_name,client_name,limesurvey_survey_id,owner_name\n"
        "Imported Study,Acme Ltd,1001,Sunil\n"
    ).encode()
    result = import_projects_from_sheet(pm_session, csv_data, filename="p.csv")
    assert result.created == 1
    assert result.errors == 0
    assert result.rows[0].limesurvey_survey_id == 1001


def test_import_matches_survey_by_name(pm_session, monkeypatch):
    monkeypatch.setattr(
        "app.services.pm_import._load_lime_surveys",
        lambda: [{"id": 555, "title": "Brand Health Wave 2"}],
    )
    csv_data = "project_name,survey_name\nHealth Study,Brand Health Wave 2\n".encode()
    result = import_projects_from_sheet(pm_session, csv_data, filename="p.csv")
    assert result.created == 1
    assert result.rows[0].limesurvey_survey_id == 555


def test_import_skips_duplicate_name(pm_session, monkeypatch):
    monkeypatch.setattr("app.services.pm_import._load_lime_surveys", lambda: [])
    csv_data = "project_name\nDuplicate\nDuplicate\n".encode()
    result = import_projects_from_sheet(pm_session, csv_data, filename="p.csv")
    assert result.created == 1
    assert result.skipped == 1
