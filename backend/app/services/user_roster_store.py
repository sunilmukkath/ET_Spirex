from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from app.models.team_hr import StaffProfile
from app.models.team_registry import GlobalRole, TeamRegistry, TeamUser, TeamUserCreate
from app.services.auth import BUILTIN_USERS
from app.services.super_admin import is_primary_super_admin, is_super_admin, super_admin_username

_DATA_DIR = Path(__file__).resolve().parents[2] / "data" / "team"
_ROSTER_PATH = _DATA_DIR / "roster.json"
_USERNAME_RE = re.compile(r"^[A-Za-z][A-Za-z0-9._'-]{0,39}$")


def normalize_username(raw: str) -> str:
    value = str(raw or "").strip()
    if not value:
        raise ValueError("Username is required")
    if not _USERNAME_RE.match(value):
        raise ValueError("Username must start with a letter and use letters, numbers, dot, hyphen, or apostrophe")
    return value[0].upper() + value[1:] if len(value) > 1 else value.capitalize()


def _load_extra_usernames() -> list[str]:
    if not _ROSTER_PATH.is_file():
        return []
    try:
        raw = json.loads(_ROSTER_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    if not isinstance(raw, dict):
        return []
    names: list[str] = []
    for item in raw.get("usernames") or []:
        try:
            clean = normalize_username(str(item))
        except ValueError:
            continue
        if clean not in names:
            names.append(clean)
    return names


def _save_extra_usernames(names: list[str]) -> None:
    _DATA_DIR.mkdir(parents=True, exist_ok=True)
    ordered = sorted({normalize_username(n) for n in names if str(n).strip()}, key=str.lower)
    _ROSTER_PATH.write_text(json.dumps({"usernames": ordered}, indent=2), encoding="utf-8")


def get_valid_users() -> frozenset[str]:
    extra = _load_extra_usernames()
    return frozenset(set(BUILTIN_USERS) | set(extra))


def list_team_usernames() -> list[str]:
    return sorted(get_valid_users(), key=str.lower)


def is_valid_user(username: str | None) -> bool:
    if not username:
        return False
    return username.strip() in get_valid_users()


def _default_email(username: str) -> str:
    slug = username.strip().lower()
    return f"{slug}@elastictree.com" if slug else ""


def add_team_user(body: TeamUserCreate) -> TeamUser:
    from app.services.team_hr_store import upsert_staff_profile
    from app.services.team_registry_store import get_team_registry, set_team_registry

    username = normalize_username(body.username)
    if username in get_valid_users():
        raise ValueError(f"{username} is already on the team")

    extra = _load_extra_usernames()
    extra.append(username)
    _save_extra_usernames(extra)

    reg = get_team_registry()
    users = [u for u in reg.users if u.username != username]
    users.append(TeamUser(username=username, role=body.role, modules=[]))
    users.sort(key=lambda u: u.username.lower())
    reg = set_team_registry(TeamRegistry(users=users, super_admins=list(reg.super_admins or [])))

    full_name = (body.full_name or "").strip() or username
    email = (body.email or "").strip().lower() or _default_email(username)
    upsert_staff_profile(
        username,
        full_name=full_name,
        email=email,
        job_title=(body.job_title or "").strip() or "Team member",
        department=(body.department or "").strip() or "Research",
        status="active",
    )

    created = next((u for u in reg.users if u.username == username), None)
    if not created:
        raise RuntimeError("Failed to register user")
    return created


def remove_team_user(username: str, *, actor: str | None = None) -> bool:
    from app.services.team_hr_store import upsert_staff_profile
    from app.services.team_registry_store import get_team_registry, set_team_registry

    clean = normalize_username(username)
    if clean in BUILTIN_USERS:
        raise ValueError("Built-in team members cannot be removed")
    if is_primary_super_admin(clean):
        raise ValueError("Primary owner cannot be removed")
    if is_super_admin(clean) and actor and not is_primary_super_admin(actor):
        raise ValueError("Only the primary owner can remove a super admin")

    extra = _load_extra_usernames()
    if clean not in extra:
        return False

    upsert_staff_profile(clean, status="inactive")

    extra = [name for name in extra if name != clean]
    _save_extra_usernames(extra)

    reg = get_team_registry()
    users = [u for u in reg.users if u.username != clean]
    super_admins = [n for n in (reg.super_admins or []) if n != clean and n != super_admin_username()]
    set_team_registry(TeamRegistry(users=users, super_admins=super_admins))

    return True


def email_for_username_from_roster(username: str) -> str | None:
    from app.services.team_hr_store import _load_staff_raw

    clean = username.strip()
    raw = _load_staff_raw().get(clean)
    if raw and str(raw.get("email", "")).strip():
        return str(raw["email"]).strip().lower()
    return None


def username_for_email(email: str) -> str | None:
    from app.config import settings
    from app.services.team_hr_store import _load_staff_raw

    lowered = str(email or "").strip().lower()
    if not lowered:
        return None

    staff = _load_staff_raw()
    for username in get_valid_users():
        raw = staff.get(username)
        if raw and str(raw.get("email", "")).strip().lower() == lowered:
            return username

    for username in get_valid_users():
        if _default_email(username) == lowered:
            return username

    for pair in settings.resolved_gmail_team_email_map.split(","):
        if ":" not in pair:
            continue
        mapped_email, name = pair.split(":", 1)
        if mapped_email.strip().lower() == lowered and name.strip() in get_valid_users():
            return name.strip()
    return None
