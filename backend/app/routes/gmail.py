"""Gmail Workspace integration — OAuth, inbox, email → task."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Header, HTTPException
from fastapi.responses import RedirectResponse

from app.config import settings
from app.models.gmail import (
    CreatePipelineFromEmailRequest,
    CreatePipelineFromEmailResponse,
    CreateTaskFromEmailRequest,
    CreateTaskFromEmailResponse,
    CreateTasksFromEmailBatchRequest,
    CreateTasksFromEmailBatchResponse,
    GmailConnectionStatus,
    GmailEmailBreakdown,
    GmailMessageDetail,
    GmailMessageSummary,
    GmailScheduledSend,
    GmailSendEmailRequest,
    GmailSendEmailResponse,
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
from app.services.gmail_suggest import suggest_task_from_message
from app.services.gmail_pipeline import create_pipeline_from_email
from app.services.gmail_tasks import (
    break_down_email,
    create_task_from_email,
    create_tasks_from_email_batch,
    get_connection_status,
    sync_inbox,
    _resolve_message,
    _survey_title_for,
)
from app.services.gmail_mail import get_message_detail, list_scheduled, send_gmail_message

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
        return {"url": build_oauth_url(session_token=record.token, username=record.username)}
    except GmailNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.get("/oauth/callback", include_in_schema=False)
def gmail_oauth_callback(code: str | None = None, state: str | None = None, error: str | None = None):
    if error:
        return RedirectResponse(f"{settings.resolved_google_oauth_success_url}&gmail=error&reason={error}")
    if not code or not state:
        raise HTTPException(status_code=400, detail="Missing OAuth code or state")
    session_token = decode_oauth_state(state)
    if not session_token:
        raise HTTPException(status_code=400, detail="Invalid OAuth state")
    record = get_session(session_token)
    if not record:
        raise HTTPException(status_code=401, detail="Session expired — sign in and connect Gmail again")
    try:
        tokens = exchange_code_for_tokens(code, username=record.username)
        gmail_store.save_tokens(record.username, tokens)
    except Exception:
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


@router.get("/messages/{message_id}", response_model=GmailMessageDetail)
def gmail_get_message(message_id: str, mark_read: bool = True, username: str = Depends(require_auth)):
    try:
        return get_message_detail(username, message_id, mark_read=mark_read)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except GmailNotConnectedError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Could not load email: {exc}") from exc


@router.post("/send", response_model=GmailSendEmailResponse)
def gmail_send(body: GmailSendEmailRequest, username: str = Depends(require_auth)):
    try:
        return send_gmail_message(username, body)
    except GmailNotConnectedError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Send failed: {exc}") from exc


@router.get("/scheduled", response_model=list[GmailScheduledSend])
def gmail_scheduled(username: str = Depends(require_auth)):
    return list_scheduled(username)


@router.get("/messages/{message_id}/suggestion", response_model=GmailTaskSuggestion)
def gmail_message_suggestion(message_id: str, username: str = Depends(require_auth)):
    try:
        message = _resolve_message(username, message_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return suggest_task_from_message(message)


@router.get("/messages/{message_id}/breakdown", response_model=GmailEmailBreakdown)
def gmail_message_breakdown(message_id: str, username: str = Depends(require_auth)):
    try:
        return break_down_email(username, message_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except GmailNotConnectedError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Could not break down email: {exc}") from exc


@router.post("/messages/{message_id}/task", response_model=CreateTaskFromEmailResponse)
def gmail_create_task(
    message_id: str,
    body: CreateTaskFromEmailRequest,
    username: str = Depends(require_auth),
):
    survey_title = ""
    if body.survey_id is not None:
        survey_title = _survey_title_for(body.survey_id)
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


@router.post("/messages/{message_id}/pipeline", response_model=CreatePipelineFromEmailResponse)
def gmail_create_pipeline(
    message_id: str,
    body: CreatePipelineFromEmailRequest,
    username: str = Depends(require_auth),
):
    try:
        return create_pipeline_from_email(username, message_id, body)
    except GmailNotConnectedError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Could not create pipeline: {exc}") from exc


@router.post("/messages/{message_id}/tasks", response_model=CreateTasksFromEmailBatchResponse)
def gmail_create_tasks_batch(
    message_id: str,
    body: CreateTasksFromEmailBatchRequest,
    username: str = Depends(require_auth),
):
    try:
        return create_tasks_from_email_batch(username, message_id, body)
    except GmailNotConnectedError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Could not create tasks: {exc}") from exc
