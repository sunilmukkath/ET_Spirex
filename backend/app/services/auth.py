from __future__ import annotations

import secrets
import time
from dataclasses import dataclass, field
from typing import Any

VALID_USERS = frozenset({"Sunil", "Tony", "Ravi", "Aneena", "Shilaja"})
DEFAULT_PASSWORD = "ET@1234"
SESSION_TTL_SECONDS = 60 * 60 * 12  # 12 hours


@dataclass
class SessionRecord:
    username: str
    token: str
    login_at: float
    last_seen: float


_sessions: dict[str, SessionRecord] = {}


def authenticate(username: str, password: str) -> str | None:
    if username not in VALID_USERS:
        return None
    if password != DEFAULT_PASSWORD:
        return None
    token = secrets.token_urlsafe(32)
    now = time.time()
    _sessions[token] = SessionRecord(
        username=username,
        token=token,
        login_at=now,
        last_seen=now,
    )
    return token


def logout(token: str | None) -> None:
    if token and token in _sessions:
        del _sessions[token]


def get_session(token: str | None) -> SessionRecord | None:
    if not token or token not in _sessions:
        return None
    record = _sessions[token]
    if time.time() - record.last_seen > SESSION_TTL_SECONDS:
        del _sessions[token]
        return None
    record.last_seen = time.time()
    return record


def list_active_sessions() -> list[dict[str, Any]]:
    now = time.time()
    expired = [t for t, s in _sessions.items() if now - s.last_seen > SESSION_TTL_SECONDS]
    for t in expired:
        del _sessions[t]

    return sorted(
        [
            {
                "username": s.username,
                "login_at": s.login_at,
                "last_seen": s.last_seen,
            }
            for s in _sessions.values()
        ],
        key=lambda x: x["last_seen"],
        reverse=True,
    )
