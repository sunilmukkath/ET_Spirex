"""Resolve Operations Hub PM projects when creating workflow tasks."""

from __future__ import annotations

from uuid import UUID


def resolve_pm_project_id_for_survey(survey_id: int) -> str | None:
    """Return PM project UUID string linked to a survey, if any."""
    try:
        sid = int(survey_id)
    except (TypeError, ValueError):
        return None
    if sid <= 0:
        return None

    from app.db.session import database_enabled, session_scope
    from app.db.models import Project
    from app.services.pm_ops_store import linked_survey_ids_for_project
    from sqlalchemy import select

    if not database_enabled():
        return None
    try:
        with session_scope() as session:
            for row in session.scalars(select(Project)).all():
                if sid in linked_survey_ids_for_project(row):
                    return str(row.project_id)
    except Exception:
        return None
    return None


def resolve_pm_project_for_task(project_id: UUID | str | None) -> tuple[str | None, int | None]:
    """Return (project_name, limesurvey_survey_id) for a PM project."""
    if not project_id:
        return None, None
    try:
        pid = UUID(str(project_id))
    except (TypeError, ValueError):
        return None, None

    from app.db.session import database_enabled, session_scope
    from app.services.pm_store import get_project, project_to_out

    if not database_enabled():
        return None, None
    try:
        with session_scope() as session:
            row = get_project(session, pid)
            if not row:
                return None, None
            out = project_to_out(row)
            survey_id = out.limesurvey_survey_id
            if not survey_id and out.linked_survey_ids:
                survey_id = out.linked_survey_ids[0]
            return out.project_name, survey_id
    except Exception:
        return None, None
