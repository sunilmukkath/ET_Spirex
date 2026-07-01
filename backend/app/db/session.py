"""Database session and initialization."""

from __future__ import annotations

import logging
import threading
from collections.abc import Generator
from contextlib import contextmanager

from sqlalchemy import create_engine, select, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import settings
from app.db.models import Base, TeamMember

_engine: Engine | None = None
_SessionLocal: sessionmaker[Session] | None = None
_init_lock = threading.Lock()
_db_ready = False
_db_init_error: str | None = None

DEFAULT_TEAM = ("Sunil", "Ambika", "Shilaja", "Ravikumar")

logger = logging.getLogger(__name__)


def database_enabled() -> bool:
    return bool(settings.database_url.strip())


def is_database_ready() -> bool:
    return _db_ready


def get_database_init_error() -> str | None:
    return _db_init_error


_db_init_failed = False


def database_init_failed() -> bool:
    return _db_init_failed


def ensure_database_ready() -> None:
    """Create tables and seed team members once; safe to call from any thread."""
    global _db_ready, _db_init_error, _db_init_failed
    if not database_enabled():
        return
    if _db_ready:
        return
    if _db_init_failed:
        raise RuntimeError(_db_init_error or "Project database initialization failed")
    with _init_lock:
        if _db_ready:
            return
        if _db_init_failed:
            raise RuntimeError(_db_init_error or "Project database initialization failed")
        try:
            engine = get_engine()
            Base.metadata.create_all(bind=engine)
            _apply_schema_patches(engine)
            _seed_team_members(engine)
            _bootstrap_pm_projects(engine)
            _bootstrap_pm_client_contacts(engine)
            _db_ready = True
            _db_init_error = None
            _db_init_failed = False
        except Exception as exc:
            _db_init_error = str(exc)
            _db_init_failed = True
            raise


def get_engine() -> Engine:
    global _engine, _SessionLocal
    if _engine is None:
        if not database_enabled():
            raise RuntimeError("DATABASE_URL is not configured")
        engine_kwargs: dict[str, object] = {"pool_pre_ping": True}
        if settings.database_url.startswith("postgresql"):
            engine_kwargs["connect_args"] = {"connect_timeout": 5}
        _engine = create_engine(settings.database_url, **engine_kwargs)
        _SessionLocal = sessionmaker(bind=_engine, autoflush=False, autocommit=False)
    return _engine


def get_session_factory() -> sessionmaker[Session]:
    get_engine()
    assert _SessionLocal is not None
    return _SessionLocal


@contextmanager
def session_scope() -> Generator[Session, None, None]:
    ensure_database_ready()
    factory = get_session_factory()
    session = factory()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def get_db() -> Generator[Session, None, None]:
    if not database_enabled():
        raise RuntimeError("DATABASE_URL is not configured")
    ensure_database_ready()
    factory = get_session_factory()
    session = factory()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def init_database() -> None:
    """Backward-compatible alias used by startup hook."""
    ensure_database_ready()


def _apply_schema_patches(engine: Engine) -> None:
    """Lightweight migrations for columns added after initial deploy."""
    if not settings.database_url.startswith("postgresql"):
        return
    with engine.begin() as conn:
        conn.execute(
            text(
                "ALTER TABLE projects ADD COLUMN IF NOT EXISTS requirements JSONB"
            )
        )
        conn.execute(text("ALTER TABLE projects ADD COLUMN IF NOT EXISTS project_code VARCHAR(80)"))
        conn.execute(text("ALTER TABLE projects ADD COLUMN IF NOT EXISTS fiscal_year VARCHAR(40)"))
        conn.execute(text("ALTER TABLE projects ADD COLUMN IF NOT EXISTS billing_month VARCHAR(40)"))
        conn.execute(text("ALTER TABLE projects ADD COLUMN IF NOT EXISTS project_value_inr NUMERIC(14, 2)"))


def _seed_team_members(engine: Engine) -> None:
    factory = sessionmaker(bind=engine, autoflush=False, autocommit=False)
    session = factory()
    try:
        existing = {row.name for row in session.execute(select(TeamMember)).scalars()}
        for name in DEFAULT_TEAM:
            if name not in existing:
                session.add(TeamMember(name=name, role="researcher"))
        session.commit()
    finally:
        session.close()


def _bootstrap_pm_projects(engine: Engine) -> None:
    """One-time load of bundled Elastic Tree project sheet when pipeline is empty."""
    try:
        from app.services.pm_bootstrap import bootstrap_projects_from_master

        factory = sessionmaker(bind=engine, autoflush=False, autocommit=False)
        session = factory()
        try:
            bootstrap_projects_from_master(session, only_if_empty=True)
            session.commit()
        except Exception:
            session.rollback()
            logger.exception("PM project sheet bootstrap failed")
        finally:
            session.close()
    except Exception:
        logger.exception("PM bootstrap module unavailable")


def _bootstrap_pm_client_contacts(engine: Engine) -> None:
    """Upsert CRM clients from bundled client contact sheet on deploy."""
    try:
        from app.services.pm_client_import import bootstrap_clients_from_master

        factory = sessionmaker(bind=engine, autoflush=False, autocommit=False)
        session = factory()
        try:
            result = bootstrap_clients_from_master(session)
            if result:
                logger.info(
                    "PM client contact bootstrap: created=%s updated=%s skipped=%s errors=%s",
                    result.created,
                    result.updated,
                    result.skipped,
                    result.errors,
                )
            session.commit()
        except Exception:
            session.rollback()
            logger.exception("PM client contact bootstrap failed")
        finally:
            session.close()
    except Exception:
        logger.exception("PM client contact bootstrap module unavailable")


def reset_engine_for_tests() -> None:
    global _engine, _SessionLocal, _db_ready, _db_init_error, _db_init_failed
    if _engine is not None:
        _engine.dispose()
    _engine = None
    _SessionLocal = None
    _db_ready = False
    _db_init_error = None
    _db_init_failed = False
