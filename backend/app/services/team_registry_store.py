from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from app.models.app_modules import AppModule
from app.models.team_registry import GlobalRole, TeamRegistry, TeamUser
from app.services.app_module_access import get_user_app_modules, resolve_user_modules
from app.services.auth import VALID_USERS
from app.services.super_admin import is_primary_super_admin, is_super_admin, super_admin_username

_DATA_DIR = Path(__file__).resolve().parents[2] / "data" / "team"
_REGISTRY_PATH = _DATA_DIR / "registry.json"

_DEFAULT_ADMINS = frozenset({super_admin_username()})


def _default_registry() -> TeamRegistry:
    owner = super_admin_username()
    users = [
        TeamUser(username=name, role="admin" if name in _DEFAULT_ADMINS else "member")
        for name in sorted(VALID_USERS)
    ]
    return TeamRegistry(users=users, super_admins=[owner] if owner else [])


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
        modules_raw = item.get("modules")
        modules: list[AppModule] = []
        if isinstance(modules_raw, list):
            allowed = {
                "home",
                "quantitative",
                "my_work",
                "operations",
                "accounting",
                "team",
                "settings",
            }
            for mod in modules_raw:
                key = str(mod or "").strip()
                if key in allowed and key not in modules:
                    modules.append(key)  # type: ignore[arg-type]
        merged[username] = TeamUser(username=username, role=role, modules=modules)  # type: ignore[arg-type]

    super_admins_raw = raw.get("super_admins") if raw else None
    super_admins: list[str] = []
    if isinstance(super_admins_raw, list):
        for name in super_admins_raw:
            clean = str(name or "").strip()
            if clean in VALID_USERS and clean not in super_admins:
                super_admins.append(clean)

    return _enforce_super_admin(
        TeamRegistry(
            users=sorted(merged.values(), key=lambda u: u.username.lower()),
            super_admins=super_admins,
        )
    )


def _enforce_super_admin(registry: TeamRegistry) -> TeamRegistry:
    owner = super_admin_username()
    super_names = {owner} if owner else set()
    for name in registry.super_admins or []:
        if name in VALID_USERS:
            super_names.add(name)
    users: list[TeamUser] = []
    for user in registry.users:
        if user.username in super_names:
            users.append(
                TeamUser(
                    username=user.username,
                    role="admin",
                    modules=list(user.modules),
                )
            )
        else:
            users.append(user)
    return TeamRegistry(
        users=users,
        super_admins=sorted(super_names, key=str.lower),
    )


def get_user_modules(username: str | None) -> list[AppModule]:
    registry = get_team_registry()
    role = get_global_role(username)
    return get_user_app_modules(username, registry, role)


def get_team_registry() -> TeamRegistry:
    if not _REGISTRY_PATH.is_file():
        return _default_registry()
    try:
        raw = json.loads(_REGISTRY_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return _default_registry()
    return _normalize_registry(raw)


def set_team_registry(registry: TeamRegistry) -> TeamRegistry:
    normalized = _enforce_super_admin(_normalize_registry(registry.model_dump()))
    _DATA_DIR.mkdir(parents=True, exist_ok=True)
    _REGISTRY_PATH.write_text(
        json.dumps(normalized.model_dump(), indent=2),
        encoding="utf-8",
    )
    return normalized


def get_global_role(username: str | None) -> GlobalRole:
    if is_super_admin(username):
        return "admin"
    if not username:
        return "member"
    for user in get_team_registry().users:
        if user.username == username:
            return user.role
    if username in VALID_USERS:
        return "admin" if username in _DEFAULT_ADMINS else "member"
    return "member"


def is_global_admin(username: str | None) -> bool:
    if is_super_admin(username):
        return True
    return get_global_role(username) == "admin"


def is_global_manager_or_above(username: str | None) -> bool:
    if is_super_admin(username):
        return True
    return get_global_role(username) in {"admin", "manager"}
