"""Tests for PM projects and fieldwork store."""

from datetime import date
from uuid import UUID

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.models import Base, TeamMember
from app.db.session import reset_engine_for_tests
from app.models.pm import FieldworkEntryCreate, PmProjectCreate
from app.services import pm_ops_store, pm_store


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


def test_create_project_and_fieldwork(pm_session):
    project = pm_store.create_project(
        pm_session,
        PmProjectCreate(
            project_name="FMCG Tracker Q2",
            project_type="quant",
            engagement_type="tracking",
            owner_name="Sunil",
        ),
    )
    assert project.project_name == "FMCG Tracker Q2"
    assert project.owner_name == "Sunil"

    entry = pm_store.create_fieldwork_entry(
        pm_session,
        UUID(str(project.project_id)),
        FieldworkEntryCreate(
            entry_date=date(2026, 6, 1),
            completes_today=40,
            target_completes=500,
            quota_cell={"cell_key": "mumbai", "label": "Mumbai", "completes": 20, "target": 100},
        ),
    )
    assert entry is not None
    assert entry.cumulative_completes == 40

    entry2 = pm_store.create_fieldwork_entry(
        pm_session,
        UUID(str(project.project_id)),
        FieldworkEntryCreate(
            entry_date=date(2026, 6, 2),
            completes_today=35,
            target_completes=500,
            quota_cell={"cell_key": "mumbai", "label": "Mumbai", "completes": 15, "target": 100},
        ),
    )
    assert entry2 is not None
    assert entry2.cumulative_completes == 75

    dashboard = pm_store.build_fieldwork_dashboard(pm_session, UUID(str(project.project_id)))
    assert dashboard is not None
    assert dashboard.cumulative_completes == 75
    assert dashboard.pct_complete == 15.0
    assert len(dashboard.quota_cells) == 1
    assert dashboard.quota_cells[0].cumulative_completes == 35


def test_project_can_capture_multiple_survey_links(pm_session):
    project = pm_store.create_project(
        pm_session,
        PmProjectCreate(
            project_name="Three Visit Study",
            project_type="quant",
            engagement_type="tracking",
            owner_name="Sunil",
        ),
    )

    pm_ops_store.link_survey(pm_session, UUID(str(project.project_id)), 101)
    pm_ops_store.link_survey(pm_session, UUID(str(project.project_id)), 102)
    pm_ops_store.link_survey(pm_session, UUID(str(project.project_id)), 103)

    refreshed = pm_store.get_project(pm_session, UUID(str(project.project_id)))
    assert refreshed is not None
    out = pm_store.project_to_out(refreshed)
    assert out.limesurvey_survey_id == 101
    assert out.linked_survey_ids == [101, 102, 103]

    pm_ops_store.link_survey(pm_session, UUID(str(project.project_id)), 102, action="remove")
    refreshed = pm_store.get_project(pm_session, UUID(str(project.project_id)))
    assert refreshed is not None
    assert pm_store.project_to_out(refreshed).linked_survey_ids == [101, 103]


def test_same_day_fieldwork_upsert(pm_session):
    project = pm_store.create_project(
        pm_session,
        PmProjectCreate(
            project_name="Upsert test",
            project_type="quant",
            engagement_type="ad-hoc",
        ),
    )
    project_id = UUID(str(project.project_id))
    today = date(2026, 6, 28)

    first = pm_store.create_fieldwork_entry(
        pm_session,
        project_id,
        FieldworkEntryCreate(entry_date=today, completes_today=20, target_completes=200),
    )
    second = pm_store.create_fieldwork_entry(
        pm_session,
        project_id,
        FieldworkEntryCreate(entry_date=today, completes_today=35, target_completes=200),
    )
    assert first is not None and second is not None
    assert first.entry_id == second.entry_id
    assert second.completes_today == 35
    assert second.cumulative_completes == 35

    entries = pm_store.list_fieldwork_entries(pm_session, project_id)
    assert len(entries) == 1


def test_list_live_fieldwork_projects_filters_stages(pm_session):
    live = pm_store.create_project(
        pm_session,
        PmProjectCreate(
            project_name="Live tracker",
            project_type="quant",
            engagement_type="tracking",
            stage="Fieldwork/Data Collection",
        ),
    )
    pm_store.create_project(
        pm_session,
        PmProjectCreate(
            project_name="Old proposal",
            project_type="quant",
            engagement_type="ad-hoc",
            stage="Proposal",
        ),
    )
    pm_store.create_project(
        pm_session,
        PmProjectCreate(
            project_name="Delivered study",
            project_type="quant",
            engagement_type="ad-hoc",
            stage="Delivered",
        ),
    )

    rows = pm_store.list_live_fieldwork_projects(pm_session)
    assert [row.project_name for row in rows] == ["Live tracker"]
    assert rows[0].project_id == live.project_id
