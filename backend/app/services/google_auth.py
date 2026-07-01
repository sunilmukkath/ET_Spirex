"""Google OAuth sign-in for ET Scout (Workspace email → team session)."""

from __future__ import annotations

import base64
import json
import secrets
from typing import Any

from app.config import settings
from app.services.gmail_client import GmailNotConfiguredError, is_gmail_configured

GOOGLE_AUTH_SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
]


def is_google_auth_configured() -> bool:
    return is_gmail_configured()


def _client_config() -> dict[str, Any]:
    if not is_google_auth_configured():
        raise GmailNotConfiguredError(
            "Google sign-in is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET."
        )
    return {
        "web": {
            "client_id": settings.google_client_id.strip(),
            "client_secret": settings.google_client_secret.strip(),
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": [settings.resolved_google_auth_redirect_uri],
        }
    }


def _auth_redirect_uri() -> str:
    uri = settings.resolved_google_auth_redirect_uri
    if not uri:
        raise GmailNotConfiguredError("GOOGLE_AUTH_REDIRECT_URI is not set.")
    return uri


def build_google_signin_url() -> str:
    from google_auth_oauthlib.flow import Flow

    verifier = secrets.token_urlsafe(64)
    flow = Flow.from_client_config(_client_config(), scopes=GOOGLE_AUTH_SCOPES, redirect_uri=_auth_redirect_uri())
    flow.oauth2session.scope = GOOGLE_AUTH_SCOPES
    flow.oauth2session.code_verifier = verifier
    auth_kwargs: dict[str, str] = {
        "access_type": "online",
        "include_granted_scopes": "true",
        "prompt": "select_account",
        "state": encode_login_state(verifier),
    }
    domain = settings.workspace_domain.strip()
    if domain:
        auth_kwargs["hd"] = domain
    auth_url, _ = flow.authorization_url(**auth_kwargs)
    return auth_url


def exchange_code_for_email(code: str, *, code_verifier: str) -> str | None:
    from google_auth_oauthlib.flow import Flow
    from googleapiclient.discovery import build

    flow = Flow.from_client_config(_client_config(), scopes=GOOGLE_AUTH_SCOPES, redirect_uri=_auth_redirect_uri())
    flow.oauth2session.code_verifier = code_verifier
    flow.fetch_token(code=code)
    creds = flow.credentials
    service = build("oauth2", "v2", credentials=creds, cache_discovery=False)
    profile = service.userinfo().get().execute()
    email = str(profile.get("email") or "").strip().lower()
    return email or None


def encode_login_state(code_verifier: str) -> str:
    payload = json.dumps({"purpose": "login", "cv": code_verifier})
    return base64.urlsafe_b64encode(payload.encode()).decode().rstrip("=")


def decode_login_state(state: str) -> str | None:
    """Return PKCE verifier when state is a valid login request."""
    try:
        pad = "=" * (-len(state) % 4)
        raw = base64.urlsafe_b64decode(state + pad)
        data = json.loads(raw.decode())
        if str(data.get("purpose") or "") != "login":
            return None
        verifier = str(data.get("cv") or "").strip()
        return verifier or None
    except (ValueError, json.JSONDecodeError, UnicodeDecodeError):
        return None
