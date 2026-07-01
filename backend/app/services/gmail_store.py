"""Persist Gmail OAuth tokens, inbox cache, and email→task links."""

from __future__ import annotations

import json
import logging
import time
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

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


def _read_file_tokens(username: str) -> dict[str, Any] | None:
    path = _user_token_path(username)
    if not path.is_file():
        return None
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
        return raw if isinstance(raw, dict) else None
    except (OSError, json.JSONDecodeError):
        return None


def _write_file_tokens(username: str, token_data: dict[str, Any]) -> None:
    payload = {**token_data, "updated_at": time.time()}
    _user_token_path(username).write_text(json.dumps(payload, indent=2), encoding="utf-8")


def _read_db_tokens(username: str) -> dict[str, Any] | None:
    try:
        from app.db.session import database_enabled, ensure_database_ready, session_scope
        from app.db.models import GmailOAuthToken

        if not database_enabled():
            return None
        ensure_database_ready()
        with session_scope() as session:
            row = session.get(GmailOAuthToken, username)
            if not row or not isinstance(row.token_data, dict):
                return None
            return dict(row.token_data)
    except Exception:
        logger.debug("Gmail token DB read failed for %s", username, exc_info=True)
        return None


def _write_db_tokens(username: str, token_data: dict[str, Any], email: str | None = None) -> None:
    try:
        from app.db.session import database_enabled, ensure_database_ready, session_scope
        from app.db.models import GmailOAuthToken

        if not database_enabled():
            return
        ensure_database_ready()
        with session_scope() as session:
            row = session.get(GmailOAuthToken, username)
            if row is None:
                row = GmailOAuthToken(username=username, token_data=token_data, email=email)
                session.add(row)
            else:
                row.token_data = token_data
                if email:
                    row.email = email
    except Exception:
        logger.warning("Gmail token DB write failed for %s", username, exc_info=True)


def merge_token_data(existing: dict[str, Any] | None, incoming: dict[str, Any]) -> dict[str, Any]:
    """Merge OAuth payloads — never drop an existing refresh_token."""
    base = dict(existing or {})
    merged = {**base, **incoming}
    if not incoming.get("refresh_token") and base.get("refresh_token"):
        merged["refresh_token"] = base["refresh_token"]
    return merged


def get_tokens(username: str) -> dict[str, Any] | None:
    db_tokens = _read_db_tokens(username)
    file_tokens = _read_file_tokens(username)
    if db_tokens and file_tokens:
        return merge_token_data(file_tokens, db_tokens)
    return db_tokens or file_tokens


def save_tokens(username: str, token_data: dict[str, Any], *, email: str | None = None) -> None:
    merged = merge_token_data(get_tokens(username), token_data)
    payload = {**merged, "updated_at": time.time()}
    _write_file_tokens(username, payload)
    _write_db_tokens(username, payload, email=email)


def delete_tokens(username: str) -> None:
    path = _user_token_path(username)
    if path.is_file():
        path.unlink()
    try:
        from app.db.session import database_enabled, ensure_database_ready, session_scope
        from app.db.models import GmailOAuthToken

        if database_enabled():
            ensure_database_ready()
            with session_scope() as session:
                row = session.get(GmailOAuthToken, username)
                if row is not None:
                    session.delete(row)
    except Exception:
        logger.debug("Gmail token DB delete failed for %s", username, exc_info=True)


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


def _normalize_link_entry(raw: Any) -> dict[str, Any]:
    if not isinstance(raw, dict):
        return {"tasks": []}
    if "tasks" in raw and isinstance(raw["tasks"], list):
        return {"tasks": list(raw["tasks"])}
    if raw.get("task_id"):
        return {
            "tasks": [
                {
                    "survey_id": raw.get("survey_id"),
                    "task_id": raw.get("task_id"),
                    "personal": raw.get("personal", raw.get("survey_id") is None),
                    "created_by": raw.get("created_by"),
                    "created_at": raw.get("created_at"),
                }
            ]
        }
    return {"tasks": []}


def link_message_to_pm_project(gmail_message_id: str, project_id: str | UUID, created_by: str) -> None:
    links = _load_links()
    entry = _normalize_link_entry(links.get(gmail_message_id))
    entry["pm_project_id"] = str(project_id)
    entry["pm_created_by"] = created_by
    entry["pm_created_at"] = time.time()
    links[gmail_message_id] = entry
    _save_links(links)


def get_message_pm_project_id(gmail_message_id: str) -> str | None:
    entry = _normalize_link_entry(_load_links().get(gmail_message_id))
    raw = entry.get("pm_project_id")
    return str(raw) if raw else None


def link_message_to_task(
    gmail_message_id: str,
    *,
    survey_id: int | None,
    task_id: str,
    created_by: str,
    personal: bool = False,
) -> None:
    links = _load_links()
    entry = _normalize_link_entry(links.get(gmail_message_id))
    entry["tasks"].append(
        {
            "survey_id": survey_id,
            "task_id": task_id,
            "personal": personal or survey_id is None,
            "created_by": created_by,
            "created_at": time.time(),
        }
    )
    links[gmail_message_id] = entry
    _save_links(links)


def get_message_links(gmail_message_id: str) -> list[dict[str, Any]]:
    entry = _normalize_link_entry(_load_links().get(gmail_message_id))
    return list(entry.get("tasks") or [])


def get_message_link(gmail_message_id: str) -> dict[str, Any] | None:
    tasks = get_message_links(gmail_message_id)
    return tasks[0] if tasks else None


def message_has_task(gmail_message_id: str) -> bool:
    return bool(get_message_links(gmail_message_id))


def _scheduled_path(username: str) -> Path:
    safe = "".join(c if c.isalnum() else "_" for c in username)
    _DATA_DIR.mkdir(parents=True, exist_ok=True)
    return _DATA_DIR / f"{safe}_scheduled.json"


def list_scheduled_sends(username: str) -> list[dict[str, Any]]:
    path = _scheduled_path(username)
    if not path.is_file():
        return []
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
        return raw if isinstance(raw, list) else []
    except (OSError, json.JSONDecodeError):
        return []


def save_scheduled_sends(username: str, items: list[dict[str, Any]]) -> None:
    _scheduled_path(username).write_text(json.dumps(items, indent=2), encoding="utf-8")


def add_scheduled_send(username: str, item: dict[str, Any]) -> dict[str, Any]:
    items = list_scheduled_sends(username)
    items.append(item)
    save_scheduled_sends(username, items)
    return item
