"""Tests for bundled PM project sheet bootstrap."""

import pytest
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import sessionmaker

from app.db.models import Base, Project, TeamMember
from app.db.session import reset_engine_for_tests
from app.services.pm_bootstrap import bootstrap_projects_from_master


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


def test_bootstrap_imports_master_sheet(pm_session):
    result = bootstrap_projects_from_master(pm_session, only_if_empty=True)
    assert result is not None
    assert result.total_rows == 188
    assert result.created == 186
    assert result.updated == 2
    assert result.skipped == 0
    assert result.errors == 0
    count = pm_session.scalar(select(func.count()).select_from(Project))
    assert count == 186


def test_bootstrap_skips_when_projects_exist(pm_session):
    bootstrap_projects_from_master(pm_session, only_if_empty=True)
    again = bootstrap_projects_from_master(pm_session, only_if_empty=True)
    assert again is None
