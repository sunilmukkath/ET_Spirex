from __future__ import annotations

import os
import secrets
import time
from dataclasses import dataclass, field
from typing import Any

from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from google_auth_oauthlib.flow import Flow

VALID_USERS = frozenset({"Sunil", "Tony", "Ravi", "Aneena", "Shilaja", "Palani", "Bagya"})
DEFAULT_PASSWORD = "ET@2026"
SESSION_TTL_SECONDS = 60 * 60 * 12  # 12 hours

GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET", "")
GOOGLE_REDIRECT_URI = os.environ.get("GOOGLE_REDIRECT_URI", "")

# Allowed email domains for Google OAuth sign-in (empty = allow any verified Google account)
ALLOWED_EMAIL_DOMAINS: frozenset[str] = frozenset()

_GOOGLE_SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
]


@dataclass
class SessionRecord:
    username: str
    token: str
    login_at: float
    last_seen: float


_sessions: dict[str, SessionRecord] = {}


def _create_session(username: str) -> str:
    """Create a new session for *username* and return the session token."""
    token = secrets.token_urlsafe(32)
    now = time.time()
    _sessions[token] = SessionRecord(
        username=username,
        token=token,
        login_at=now,
        last_seen=now,
    )
    return token


def authenticate(username: str, password: str) -> str | None:
    name = str(username or "").strip()
    secret = str(password or "").strip()
    if name not in VALID_USERS:
        return None
    if secret != DEFAULT_PASSWORD:
        return None
    return _create_session(name)


# ---------------------------------------------------------------------------
# Google OAuth helpers
# ---------------------------------------------------------------------------

def _build_flow() -> Flow:
    """Build a google-auth-oauthlib Flow from environment variables."""
    client_config = {
        "web": {
            "client_id": GOOGLE_CLIENT_ID,
            "client_secret": GOOGLE_CLIENT_SECRET,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": [GOOGLE_REDIRECT_URI],
        }
    }
    return Flow.from_client_config(
        client_config,
        scopes=_GOOGLE_SCOPES,
        redirect_uri=GOOGLE_REDIRECT_URI,
    )


def get_google_login_url() -> str:
    """Return the Google OAuth authorization URL the frontend should redirect to."""
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET or not GOOGLE_REDIRECT_URI:
        raise ValueError(
            "Google OAuth is not configured. "
            "Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI."
        )
    flow = _build_flow()
    auth_url, _state = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="select_account",
    )
    return auth_url


def exchange_google_code(code: str) -> str | None:
    """Exchange an OAuth authorization *code* for a session token.

    Returns a session token on success, or ``None`` if the email is not
    permitted to access the application.

    Raises ``ValueError`` if the OAuth configuration is missing or the token
    cannot be verified.
    """
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET or not GOOGLE_REDIRECT_URI:
        raise ValueError(
            "Google OAuth is not configured. "
            "Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI."
        )

    flow = _build_flow()
    flow.fetch_token(code=code)

    credentials = flow.credentials
    id_info = google_id_token.verify_oauth2_token(
        credentials.id_token,
        google_requests.Request(),
        GOOGLE_CLIENT_ID,
    )

    email: str = id_info.get("email", "")
    if not email:
        raise ValueError("Google token did not contain an email address.")

    if not id_info.get("email_verified", False):
        raise ValueError("Google account email is not verified.")

    if ALLOWED_EMAIL_DOMAINS:
        domain = email.split("@", 1)[-1].lower()
        if domain not in ALLOWED_EMAIL_DOMAINS:
            return None

    # Use the full email as the username for Google-authenticated sessions
    return _create_session(email)


def get_email_from_google_token(id_token_str: str) -> str | None:
    """Validate a raw Google ID token string and return the email it contains.

    Returns ``None`` if the token is invalid or the email is unverified.
    """
    if not GOOGLE_CLIENT_ID:
        return None
    try:
        id_info = google_id_token.verify_oauth2_token(
            id_token_str,
            google_requests.Request(),
            GOOGLE_CLIENT_ID,
        )
        if not id_info.get("email_verified", False):
            return None
        return id_info.get("email") or None
    except Exception:
        return None


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
