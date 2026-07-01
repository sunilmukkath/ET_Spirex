"""Gmail Workspace integration — OAuth, inbox, email → task."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Header, HTTPException
from fastapi.responses import RedirectResponse

from app.config import settings
from app.models.gmail import (
    CreateTaskFromEmailRequest,
    CreateTaskFromEmailResponse,
    GmailConnectionStatus,
    GmailMessageSummary,
    GmailTaskSuggestion,
)
from app.services.auth import get_session
from app.services.gmail_client import (
    GmailNotConfiguredError,
    GmailNotConnectedError,
    build_oauth_url,
    decode_oauth_state,
    exchange_code_for_tokens,
    is_gmail_configured,
)
from app.services import gmail_store
from app.services.gmail_tasks import (
    create_task_from_email,
    get_connection_status,
    suggest_task_from_message,
    sync_inbox,
)
from app.services.project_workflow_store import get_project_workflow

router = APIRouter(prefix="/gmail", tags=["gmail"])


def _extract_token(authorization: str | None) -> str | None:
    if not authorization:
        return None
    if authorization.lower().startswith("bearer "):
        return authorization[7:].strip()
    return authorization.strip()


def require_auth(authorization: str | None = Header(default=None)) -> str:
    record = get_session(_extract_token(authorization))
    if not record:
        raise HTTPException(status_code=401, detail="Not signed in")
    return record.username


@router.get("/status", response_model=GmailConnectionStatus)
def gmail_status(username: str = Depends(require_auth)):
    data = get_connection_status(username)
    return GmailConnectionStatus(**data)


@router.get("/oauth/url")
def gmail_oauth_url(authorization: str | None = Header(default=None)):
    record = get_session(_extract_token(authorization))
    if not record:
        raise HTTPException(status_code=401, detail="Not signed in")
    try:
        return {"url": build_oauth_url(session_token=record.token)}
    except GmailNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.get("/oauth/callback", include_in_schema=False)
def gmail_oauth_callback(code: str | None = None, state: str | None = None, error: str | None = None):
    if error:
        return RedirectResponse(f"{settings.resolved_google_oauth_success_url}&gmail=error&reason={error}")
    if not code or not state:
        raise HTTPException(status_code=400, detail="Missing OAuth code or state")
    oauth_state = decode_oauth_state(state)
    if not oauth_state:
        raise HTTPException(status_code=400, detail="Invalid OAuth state")
    record = get_session(oauth_state["token"])
    if not record:
        raise HTTPException(status_code=401, detail="Session expired — sign in and connect Gmail again")
    try:
        tokens = exchange_code_for_tokens(code, code_verifier=oauth_state["code_verifier"])
        gmail_store.save_tokens(record.username, tokens)
    except Exception as exc:
        return RedirectResponse(f"{settings.resolved_google_oauth_success_url}&gmail=error&reason=token_exchange")
    return RedirectResponse(f"{settings.resolved_google_oauth_success_url}&gmail=connected")


@router.post("/disconnect")
def gmail_disconnect(username: str = Depends(require_auth)):
    gmail_store.delete_tokens(username)
    return {"ok": True}


@router.get("/inbox", response_model=list[GmailMessageSummary])
def gmail_inbox(sync: bool = False, username: str = Depends(require_auth)):
    if not is_gmail_configured():
        raise HTTPException(status_code=503, detail="Gmail integration is not configured on the server.")
    try:
        return sync_inbox(username, force=sync)
    except GmailNotConnectedError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        detail = str(exc)
        if "did not respond within" in detail:
            raise HTTPException(status_code=504, detail=detail) from exc
        raise HTTPException(status_code=502, detail=f"Gmail sync failed: {detail}") from exc


@router.get("/messages/{message_id}/suggestion", response_model=GmailTaskSuggestion)
def gmail_message_suggestion(message_id: str, username: str = Depends(require_auth)):
    cache = gmail_store.get_inbox_cache(username)
    message = next((m for m in cache.get("messages") or [] if m.get("id") == message_id), None)
    if not message:
        raise HTTPException(status_code=404, detail="Message not in cache — sync inbox first")
    return suggest_task_from_message(message)


@router.post("/messages/{message_id}/task", response_model=CreateTaskFromEmailResponse)
def gmail_create_task(
    message_id: str,
    body: CreateTaskFromEmailRequest,
    username: str = Depends(require_auth),
):
    workflow = get_project_workflow(body.survey_id)
    client = workflow.client_name.strip()
    code = workflow.project_code.strip()
    if client and code:
        survey_title = f"{client} — {code}"
    elif client:
        survey_title = client
    else:
        survey_title = f"Survey {body.survey_id}"
    try:
        return create_task_from_email(
            username,
            message_id,
            body,
            survey_title=survey_title,
        )
    except GmailNotConnectedError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Could not create task: {exc}") from exc
