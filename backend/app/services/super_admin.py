"""Resolve login identifiers and super-admin identity."""

from __future__ import annotations

from app.config import settings


def super_admin_username() -> str:
    return settings.super_admin_username.strip() or "Sunil"


def super_admin_email() -> str:
    return settings.super_admin_email.strip().lower()


def _registry_super_admins() -> list[str]:
    from app.services.team_registry_store import get_team_registry

    reg = get_team_registry()
    return [str(n).strip() for n in (reg.super_admins or []) if str(n).strip()]


def all_super_admins() -> list[str]:
    """Primary owner plus any additional super admins from team registry."""
    names: list[str] = []
    primary = super_admin_username()
    if primary:
        names.append(primary)
    for name in _registry_super_admins():
        if name not in names:
            names.append(name)
    return names


def is_super_admin(username: str | None) -> bool:
    if not username:
        return False
    return username.strip() in all_super_admins()


def is_primary_super_admin(username: str | None) -> bool:
    if not username:
        return False
    return username.strip() == super_admin_username()


def resolve_login_identifier(raw: str) -> str | None:
    """Map team name or @elastictree.com email to an ET Scout username."""
    from app.services.auth import VALID_USERS

    value = str(raw or "").strip()
    if not value:
        return None
    if value in VALID_USERS:
        return value
    lowered = value.lower()
    if lowered == super_admin_email():
        return super_admin_username()
    if "@" in lowered:
        domain = lowered.split("@", 1)[1]
        if settings.workspace_domain.strip() and domain != settings.workspace_domain.strip().lower():
            return None
        for pair in settings.resolved_gmail_team_email_map.split(","):
            if ":" not in pair:
                continue
            email, name = pair.split(":", 1)
            if email.strip().lower() == lowered and name.strip() in VALID_USERS:
                return name.strip()
    return None


def email_for_username(username: str) -> str | None:
    """Map ET Scout username to workspace Gmail address."""
    from app.services.auth import VALID_USERS

    name = str(username or "").strip()
    if not name or name not in VALID_USERS:
        return None
    for pair in settings.resolved_gmail_team_email_map.split(","):
        if ":" not in pair:
            continue
        email, mapped = pair.split(":", 1)
        if mapped.strip() == name:
            return email.strip().lower()
    return None
