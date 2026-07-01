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


@router.get("/callback", include_in_schema=False)
def google_auth_callback(
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
):
    success_base = settings.google_auth_success_url.strip() or settings.app_public_url.strip()
    if error:
        return RedirectResponse(f"{success_base}?auth=error&reason={error}")
    if not code or not state or not decode_login_state(state):
        raise HTTPException(status_code=400, detail="Invalid Google sign-in callback")
    try:
        email = exchange_code_for_email(code)
    except Exception:
        return RedirectResponse(f"{success_base}?auth=error&reason=token_exchange")
    username = resolve_login_identifier(email or "")
    if not username:
        return RedirectResponse(f"{success_base}?auth=error&reason=not_authorized")
    token = create_session(username)
    if not token:
        return RedirectResponse(f"{success_base}?auth=error&reason=session_failed")
    return RedirectResponse(f"{success_base}?auth=google&token={token}&username={username}")
