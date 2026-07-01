"""One-time bootstrap of PM projects from the bundled master Excel sheet."""

from __future__ import annotations

import logging

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import Project
from app.models.pm import PmImportResult
from app.services.pm_import import import_projects_from_sheet
from app.services.project_import_config import _TEMPLATE_PATH, load_column_mapping

logger = logging.getLogger(__name__)


def bundled_master_sheet() -> bytes | None:
    if not _TEMPLATE_PATH.is_file():
        return None
    return _TEMPLATE_PATH.read_bytes()


def bootstrap_projects_from_master(
    session: Session,
    *,
    only_if_empty: bool = True,
) -> PmImportResult | None:
    """Import Elastic Tree project sheet when DB has no projects (or force re-run)."""
    if not load_column_mapping():
        logger.warning("PM bootstrap skipped: import column mapping not configured")
        return None
    data = bundled_master_sheet()
    if not data:
        logger.warning("PM bootstrap skipped: no bundled master sheet at %s", _TEMPLATE_PATH)
        return None

    if only_if_empty:
        count = session.scalar(select(func.count()).select_from(Project)) or 0
        if count > 0:
            logger.info("PM bootstrap skipped: %s project(s) already in database", count)
            return None

    logger.info("Importing PM projects from bundled master sheet (%s bytes)", len(data))
    result = import_projects_from_sheet(
        session,
        data,
        filename="project_import_master.xlsx",
        skip_duplicates=True,
    )
    logger.info(
        "PM bootstrap complete: created=%s skipped=%s errors=%s total=%s",
        result.created,
        result.skipped,
        result.errors,
        result.total_rows,
    )
    return result
