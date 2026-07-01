"""Google OAuth sign-in routes."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from fastapi.responses import RedirectResponse

from app.config import settings
from app.services.auth import create_session
from app.services.gmail_client import GmailNotConfiguredError
from app.services.google_auth import (
    build_google_signin_url,
    decode_login_state,
    exchange_code_for_email,
    is_google_auth_configured,
)

import logging

logger = logging.getLogger(__name__)
from app.services.super_admin import resolve_login_identifier

router = APIRouter(prefix="/auth/google", tags=["auth"])


@router.get("/configured")
def google_auth_configured():
    return {"configured": is_google_auth_configured()}


@router.get("/url")
def google_auth_url():
    try:
        return {"url": build_google_signin_url()}
    except GmailNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


def _auth_error_url(reason: str) -> str:
    base = settings.resolved_app_public_url.rstrip("/")
    return f"{base}/?auth=error&reason={reason}"


@router.get("/callback", include_in_schema=False)
def google_auth_callback(
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
):
    success_base = settings.resolved_google_auth_success_url
    if error:
        return RedirectResponse(_auth_error_url(error))
    code_verifier = decode_login_state(state or "")
    if not code or not code_verifier:
        raise HTTPException(status_code=400, detail="Invalid Google sign-in callback")
    try:
        email = exchange_code_for_email(code, code_verifier=code_verifier)
    except Exception:
        logger.exception("Google sign-in token exchange failed")
        return RedirectResponse(_auth_error_url("token_exchange"))
    username = resolve_login_identifier(email or "")
    if not username:
        return RedirectResponse(_auth_error_url("not_authorized"))
    token = create_session(username)
    if not token:
        return RedirectResponse(_auth_error_url("session_failed"))
    return RedirectResponse(f"{success_base}?auth=google&token={token}&username={username}")
