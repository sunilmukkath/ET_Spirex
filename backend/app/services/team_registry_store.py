from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from app.models.team_registry import GlobalRole, TeamRegistry, TeamUser
from app.services.auth import VALID_USERS

_DATA_DIR = Path(__file__).resolve().parents[2] / "data" / "team"
_REGISTRY_PATH = _DATA_DIR / "registry.json"

_DEFAULT_ADMINS = frozenset({"Sunil"})


def _default_registry() -> TeamRegistry:
    users = [
        TeamUser(username=name, role="admin" if name in _DEFAULT_ADMINS else "member")
        for name in sorted(VALID_USERS)
    ]
    return TeamRegistry(users=users)


def _normalize_registry(raw: dict[str, Any] | None) -> TeamRegistry:
    if not raw:
        return _default_registry()

    known = {u.username: u for u in _default_registry().users}
    incoming = raw.get("users") or []
    merged: dict[str, TeamUser] = dict(known)

    for item in incoming:
        if not isinstance(item, dict):
            continue
        username = str(item.get("username") or "").strip()
        if username not in VALID_USERS:
            continue
        role = str(item.get("role") or "member").strip().lower()
        if role not in {"admin", "manager", "member"}:
            role = "member"
        merged[username] = TeamUser(username=username, role=role)  # type: ignore[arg-type]

    return TeamRegistry(users=sorted(merged.values(), key=lambda u: u.username.lower()))


def get_team_registry() -> TeamRegistry:
    if not _REGISTRY_PATH.is_file():
        return _default_registry()
    try:
        raw = json.loads(_REGISTRY_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return _default_registry()
    return _normalize_registry(raw)


def set_team_registry(registry: TeamRegistry) -> TeamRegistry:
    normalized = _normalize_registry(registry.model_dump())
    _DATA_DIR.mkdir(parents=True, exist_ok=True)
    _REGISTRY_PATH.write_text(
        json.dumps(normalized.model_dump(), indent=2),
        encoding="utf-8",
    )
    return normalized


def get_global_role(username: str | None) -> GlobalRole:
    if not username:
        return "member"
    for user in get_team_registry().users:
        if user.username == username:
            return user.role
    if username in VALID_USERS:
        return "admin" if username in _DEFAULT_ADMINS else "member"
    return "member"


def is_global_admin(username: str | None) -> bool:
    return get_global_role(username) == "admin"


def is_global_manager_or_above(username: str | None) -> bool:
    return get_global_role(username) in {"admin", "manager"}
