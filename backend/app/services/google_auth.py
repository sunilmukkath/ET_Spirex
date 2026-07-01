"""Google OAuth sign-in for ET Scout (Workspace email → team session)."""

from __future__ import annotations

import base64
import json
import logging
import secrets
from typing import Any

import httpx

from app.config import settings
from app.services.gmail_client import GmailNotConfiguredError, is_gmail_configured

logger = logging.getLogger(__name__)

GOOGLE_AUTH_SCOPES = [
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
]
_TOKEN_URL = "https://oauth2.googleapis.com/token"
_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"


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
            "token_uri": _TOKEN_URL,
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
        "prompt": "select_account",
        "state": encode_login_state(verifier),
    }
    domain = settings.workspace_domain.strip()
    if domain:
        auth_kwargs["hd"] = domain
    auth_url, _ = flow.authorization_url(**auth_kwargs)
    return auth_url


def exchange_code_for_email(code: str, *, code_verifier: str) -> str | None:
    """Exchange Google auth code for the signed-in user's email."""
    payload = {
        "code": code,
        "client_id": settings.google_client_id.strip(),
        "client_secret": settings.google_client_secret.strip(),
        "redirect_uri": _auth_redirect_uri(),
        "grant_type": "authorization_code",
        "code_verifier": code_verifier,
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
