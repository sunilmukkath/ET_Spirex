from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.routes.api import router

app = FastAPI(
    title="ET Spirex API",
    description="Elastic Tree survey analytics API (ET Spirex)",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)

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
