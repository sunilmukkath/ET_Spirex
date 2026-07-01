"""Persist Gmail OAuth tokens, inbox cache, and email→task links."""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any

_DATA_DIR = Path(__file__).resolve().parents[2] / "data" / "gmail"


def _user_token_path(username: str) -> Path:
    safe = "".join(c if c.isalnum() else "_" for c in username)
    _DATA_DIR.mkdir(parents=True, exist_ok=True)
    return _DATA_DIR / f"{safe}_tokens.json"


def _user_inbox_path(username: str) -> Path:
    safe = "".join(c if c.isalnum() else "_" for c in username)
    _DATA_DIR.mkdir(parents=True, exist_ok=True)
    return _DATA_DIR / f"{safe}_inbox.json"


def _links_path() -> Path:
    _DATA_DIR.mkdir(parents=True, exist_ok=True)
    return _DATA_DIR / "email_task_links.json"


def get_tokens(username: str) -> dict[str, Any] | None:
    path = _user_token_path(username)
    if not path.is_file():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None


def save_tokens(username: str, token_data: dict[str, Any]) -> None:
    payload = {**token_data, "updated_at": time.time()}
    _user_token_path(username).write_text(json.dumps(payload, indent=2), encoding="utf-8")


def delete_tokens(username: str) -> None:
    path = _user_token_path(username)
    if path.is_file():
        path.unlink()


def get_inbox_cache(username: str) -> dict[str, Any]:
    path = _user_inbox_path(username)
    if not path.is_file():
        return {"synced_at": None, "messages": []}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {"synced_at": None, "messages": []}


def save_inbox_cache(username: str, messages: list[dict[str, Any]]) -> None:
    payload = {"synced_at": time.time(), "messages": messages}
    _user_inbox_path(username).write_text(json.dumps(payload, indent=2), encoding="utf-8")


def _load_links() -> dict[str, Any]:
    path = _links_path()
    if not path.is_file():
        return {}
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
        return raw if isinstance(raw, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def _save_links(data: dict[str, Any]) -> None:
    _links_path().write_text(json.dumps(data, indent=2), encoding="utf-8")


def link_message_to_task(
    gmail_message_id: str,
    *,
    survey_id: int,
    task_id: str,
    created_by: str,
) -> None:
    links = _load_links()
    links[gmail_message_id] = {
        "survey_id": survey_id,
        "task_id": task_id,
        "created_by": created_by,
        "created_at": time.time(),
    }
    _save_links(links)


def get_message_link(gmail_message_id: str) -> dict[str, Any] | None:
    return _load_links().get(gmail_message_id)


def message_has_task(gmail_message_id: str) -> bool:
    return gmail_message_id in _load_links()
