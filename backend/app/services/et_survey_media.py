"""Store and serve collector media uploads (photos, audio)."""

from __future__ import annotations

import re
import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile

_MEDIA_ROOT = Path(__file__).resolve().parents[2] / "data" / "et_collector_media"
_MEDIA_ID = re.compile(r"^[a-f0-9-]{36}\.[a-z0-9]+$")

_IMAGE_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/heic": ".heic",
    "image/heif": ".heif",
}
_AUDIO_TYPES = {
    "audio/webm": ".webm",
    "audio/ogg": ".ogg",
    "audio/mp4": ".m4a",
    "audio/mpeg": ".mp3",
    "audio/wav": ".wav",
    "video/webm": ".webm",  # some browsers label audio-only webm as video/webm
}


def _ext_for(content_type: str, *, kind: str) -> str:
    ct = (content_type or "").split(";")[0].strip().lower()
    if kind == "photo":
        ext = _IMAGE_TYPES.get(ct)
        if not ext:
            raise HTTPException(status_code=400, detail=f"Unsupported image type: {ct or 'unknown'}")
        return ext
    ext = _AUDIO_TYPES.get(ct)
    if not ext:
        raise HTTPException(status_code=400, detail=f"Unsupported audio type: {ct or 'unknown'}")
    return ext


def save_collector_media(
    workspace_id: int,
    upload: UploadFile,
    *,
    kind: str,
) -> str:
    if kind not in ("photo", "audio"):
        raise HTTPException(status_code=400, detail="Invalid media kind")
    ext = _ext_for(upload.content_type or "", kind=kind)
    media_id = f"{uuid.uuid4()}{ext}"
    dest_dir = _MEDIA_ROOT / str(workspace_id)
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / media_id
    data = upload.file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty upload")
    max_bytes = 15 * 1024 * 1024 if kind == "photo" else 25 * 1024 * 1024
    if len(data) > max_bytes:
        raise HTTPException(status_code=400, detail="File too large")
    dest.write_bytes(data)
    return media_id


def media_file_path(workspace_id: int, media_id: str) -> Path | None:
    if not _MEDIA_ID.match(media_id):
        return None
    path = (_MEDIA_ROOT / str(workspace_id) / media_id).resolve()
    root = (_MEDIA_ROOT / str(workspace_id)).resolve()
    if not str(path).startswith(str(root)):
        return None
    if not path.is_file():
        return None
    return path
