from contextlib import asynccontextmanager
from pathlib import Path
import logging
import threading

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.db.session import database_enabled, ensure_database_ready
from app.routes.api import router
from app.routes.google_auth import router as google_auth_router
from app.routes.gmail import router as gmail_router
from app.routes.et_surveys import collector_router, router as et_surveys_router
from app.routes.assistant import router as assistant_router
from app.routes.accounting import router as accounting_router
from app.routes.pm import router as pm_router

logger = logging.getLogger(__name__)


def _init_database_background() -> None:
    try:
        ensure_database_ready()
    except Exception:
        logger.exception("PM database init failed — ET Scout will run without Postgres spine")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    import asyncio

    from app.config import settings

    if database_enabled():
        threading.Thread(target=_init_database_background, daemon=True).start()

    scheduler_task: asyncio.Task | None = None

    async def _task_manager_scheduler() -> None:
        from app.services.task_manager_agent import run_scheduled_task_manager

        interval = max(0.5, float(settings.task_manager_interval_hours)) * 3600
        # Initial delay so the server finishes booting
        await asyncio.sleep(60)
        while True:
            if settings.task_manager_enabled:
                try:
                    run_scheduled_task_manager()
                    logger.info("Scout task manager completed scheduled run")
                except Exception:
                    logger.exception("Scout task manager scheduled run failed")
            await asyncio.sleep(interval)

    if settings.task_manager_enabled:
        scheduler_task = asyncio.create_task(_task_manager_scheduler())

    yield

    if scheduler_task:
        scheduler_task.cancel()
        try:
            await scheduler_task
        except asyncio.CancelledError:
            pass


app = FastAPI(
    title="ET Scout API",
    description="Elastic Tree survey analytics API (ET Scout)",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)
app.include_router(et_surveys_router, prefix="/api")
app.include_router(collector_router, prefix="/api")
app.include_router(assistant_router, prefix="/api")
app.include_router(pm_router, prefix="/api")
app.include_router(accounting_router, prefix="/api")
app.include_router(gmail_router, prefix="/api")
app.include_router(google_auth_router, prefix="/api")

_FRONTEND_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"


def _mount_frontend() -> None:
    if not _FRONTEND_DIST.is_dir():
        return

    assets_dir = _FRONTEND_DIST / "assets"
    if assets_dir.is_dir():
        app.mount("/assets", StaticFiles(directory=assets_dir), name="frontend-assets")

    @app.get("/", include_in_schema=False)
    async def spa_index() -> FileResponse:
        return FileResponse(_FRONTEND_DIST / "index.html")

    @app.get("/{path:path}", include_in_schema=False)
    async def spa_fallback(path: str) -> FileResponse:
        if path.startswith("api"):
            raise HTTPException(status_code=404, detail="Not found")
        target = _FRONTEND_DIST / path
        if target.is_file():
            return FileResponse(target)
        return FileResponse(_FRONTEND_DIST / "index.html")


_mount_frontend()
