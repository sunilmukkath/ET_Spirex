"""Google OAuth sign-in for ET Scout (Workspace email → team session)."""

from __future__ import annotations

import base64
import json
import logging
import secrets
import urllib.parse
from typing import Any

import httpx

from app.config import settings
from app.services.gmail_client import GMAIL_SCOPES, GmailNotConfiguredError, is_gmail_configured

logger = logging.getLogger(__name__)

GOOGLE_AUTH_SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    *GMAIL_SCOPES,
]
_AUTH_URL = "https://accounts.google.com/o/oauth2/auth"
_TOKEN_URL = "https://oauth2.googleapis.com/token"
_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"


def is_google_auth_configured() -> bool:
    return is_gmail_configured()


def _auth_redirect_uri() -> str:
    uri = settings.resolved_google_auth_redirect_uri
    if not uri:
        raise GmailNotConfiguredError("GOOGLE_AUTH_REDIRECT_URI is not set.")
    return uri


def build_google_signin_url() -> str:
    """Build Google sign-in URL (confidential web client — includes Gmail for persistent inbox)."""
    params: dict[str, str] = {
        "client_id": settings.google_client_id.strip(),
        "redirect_uri": _auth_redirect_uri(),
        "response_type": "code",
        "scope": " ".join(GOOGLE_AUTH_SCOPES),
        "access_type": "offline",
        "include_granted_scopes": "true",
        "prompt": "select_account",
        "state": encode_login_state(),
    }
    domain = settings.workspace_domain.strip()
    if domain:
        params["hd"] = domain
    return f"{_AUTH_URL}?{urllib.parse.urlencode(params)}"


def _token_payload_from_response(token_data: dict[str, Any]) -> dict[str, Any]:
    return {
        "token": token_data.get("access_token"),
        "refresh_token": token_data.get("refresh_token"),
        "token_uri": _TOKEN_URL,
        "client_id": settings.google_client_id.strip(),
        "client_secret": settings.google_client_secret.strip(),
        "scopes": list(str(token_data.get("scope") or "").split()) or GOOGLE_AUTH_SCOPES,
    }


def exchange_code_for_login(code: str) -> tuple[str | None, dict[str, Any] | None]:
    """Exchange Google auth code for email and Gmail OAuth tokens."""
    payload = {
        "code": code,
        "client_id": settings.google_client_id.strip(),
        "client_secret": settings.google_client_secret.strip(),
        "redirect_uri": _auth_redirect_uri(),
        "grant_type": "authorization_code",
    }
    with httpx.Client(timeout=30.0) as client:
        token_response = client.post(_TOKEN_URL, data=payload)
        if token_response.status_code >= 400:
            logger.error("Google token exchange failed: %s", token_response.text)
            raise RuntimeError(token_response.text)
        token_data = token_response.json()
        access_token = str(token_data.get("access_token") or "").strip()
        if not access_token:
            raise RuntimeError("Google token response missing access_token")
        profile_response = client.get(
            _USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}"},
        )
        if profile_response.status_code >= 400:
            logger.error("Google userinfo failed: %s", profile_response.text)
            raise RuntimeError(profile_response.text)
        profile = profile_response.json()
    email = str(profile.get("email") or "").strip().lower()
    gmail_tokens = _token_payload_from_response(token_data)
    return email or None, gmail_tokens


def exchange_code_for_email(code: str) -> str | None:
    """Backward-compatible helper — email only."""
    email, _tokens = exchange_code_for_login(code)
    return email


def encode_login_state() -> str:
    payload = json.dumps({"purpose": "login", "n": secrets.token_urlsafe(16)})
    return base64.urlsafe_b64encode(payload.encode()).decode().rstrip("=")


def decode_login_state(state: str) -> bool:
    try:
        pad = "=" * (-len(state) % 4)
        raw = base64.urlsafe_b64decode(state + pad)
        data = json.loads(raw.decode())
        return str(data.get("purpose") or "") == "login"
    except (ValueError, json.JSONDecodeError, UnicodeDecodeError):
        return False


def classify_token_exchange_error(exc: Exception) -> str:
    text = str(exc).lower()
    if "invalid_client" in text:
        return "invalid_client"
    if "invalid_grant" in text:
        return "invalid_grant"
    return "token_exchange"
