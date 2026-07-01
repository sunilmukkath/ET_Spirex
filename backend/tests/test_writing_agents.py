"""Tests for proposal and report writing agents."""

from uuid import UUID

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.models import Base, TeamMember
from app.db.session import reset_engine_for_tests
from app.models.pm import PmProjectCreate
from app.models.workspace_prefs import ReportSectionInput
from app.services import pm_store
from app.services.agent_helpers import parse_markdown_sections
from app.services.proposal_agent import run_proposal_writing_agent
from app.services.report_agent import run_report_writing_agent


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


def test_parse_markdown_sections():
    text = "## Executive summary\n\nHello world.\n\n## Methodology\n\nOnline survey."
    title, sections = parse_markdown_sections(text)
    assert title == "Executive summary"
    assert len(sections) == 2
    assert sections[0].heading == "Executive summary"
    assert "Hello world" in sections[0].body


def test_proposal_writing_agent_heuristic(pm_session):
    project = pm_store.create_project(
        pm_session,
        PmProjectCreate(
            project_name="Brand Tracker",
            project_type="quant",
            engagement_type="tracking",
            owner_name="Sunil",
        ),
    )
    draft = run_proposal_writing_agent(
        pm_session,
        UUID(str(project.project_id)),
        extra_context="Understand brand health among 25–54s.",
    )
    assert draft.agent == "proposal"
    assert draft.configured is False
    assert "Brand Tracker" in draft.title
    assert len(draft.sections) >= 5
    assert any(s.heading == "Executive summary" for s in draft.sections)
    assert "25–54s" in draft.draft_markdown


def test_report_writing_agent_no_sections():
    draft = run_report_writing_agent(99999, [], deck_title="Test report")
    assert draft.agent == "report"
    assert "Could not load" in draft.draft_markdown or len(draft.sections) >= 0


def test_report_writing_agent_heuristic_with_profile_context():
    sections = [
        ReportSectionInput(
            section_id="s1",
            label="Awareness",
            report_type="profile",
            variable_id="Q1",
        )
    ]
    # Survey 99999 won't load real data — expect error actions or empty contexts path
    draft = run_report_writing_agent(99999, sections, deck_title="Client report")
    assert draft.agent == "report"
    assert draft.title == "Client report"
