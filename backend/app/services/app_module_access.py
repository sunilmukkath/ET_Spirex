"""Resolve which app modules a signed-in user may view."""

from __future__ import annotations

from app.models.app_modules import APP_MODULES, DEFAULT_MODULES_BY_ROLE, AppModule
from app.models.team_registry import GlobalRole, TeamRegistry, TeamUser
from app.services.super_admin import is_super_admin


def _valid_modules(raw: list[str] | None) -> list[AppModule]:
    allowed = set(APP_MODULES)
    out: list[AppModule] = []
    for item in raw or []:
        key = str(item or "").strip()
        if key in allowed and key not in out:
            out.append(key)  # type: ignore[arg-type]
    return out


def default_modules_for_role(role: GlobalRole | str) -> list[AppModule]:
    key = str(role or "member").strip().lower()
    if key not in DEFAULT_MODULES_BY_ROLE:
        key = "member"
    return list(DEFAULT_MODULES_BY_ROLE[key])


def resolve_user_modules(user: TeamUser | None, *, role: GlobalRole) -> list[AppModule]:
    explicit = _valid_modules(user.modules if user else [])
    if explicit:
        return explicit
    return default_modules_for_role(role)


def get_user_app_modules(username: str | None, registry: TeamRegistry, role: GlobalRole) -> list[AppModule]:
    if is_super_admin(username):
        return list(APP_MODULES)
    if not username:
        return default_modules_for_role("member")
    matched = next((user for user in registry.users if user.username == username), None)
    return resolve_user_modules(matched, role=role)


def can_access_app_module(
    username: str | None,
    module: AppModule,
    *,
    registry: TeamRegistry,
    role: GlobalRole,
) -> bool:
    return module in get_user_app_modules(username, registry, role)
