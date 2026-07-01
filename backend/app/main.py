from contextlib import asynccontextmanager
from pathlib import Path
import logging
import threading

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.db.session import ensure_database_ready
from app.routes.api import router
from app.routes.google_auth import router as google_auth_router
from app.routes.gmail import router as gmail_router
from app.routes.et_surveys import collector_router, router as et_surveys_router
from app.routes.assistant import router as assistant_router
from app.routes.pm import router as pm_router

logger = logging.getLogger(__name__)


def _init_database_background() -> None:
    try:
        ensure_database_ready()
    except Exception:
        logger.exception("PM database init failed — ET Scout will run without Postgres spine")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    from app.db.session import database_enabled

    if database_enabled():
        threading.Thread(target=_init_database_background, daemon=True).start()
    yield


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
