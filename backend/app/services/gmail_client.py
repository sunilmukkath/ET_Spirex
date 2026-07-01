"""Gmail API client — OAuth and message fetch."""

from __future__ import annotations

import base64
import json
import logging
import re
import urllib.parse
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError
from email.utils import parseaddr
from typing import Any, Callable, TypeVar

import httpx

from app.config import settings
from app.services import gmail_store

logger = logging.getLogger(__name__)

GMAIL_SCOPES = [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.send",
]
_GMAIL_TIMEOUT = 20.0
T = TypeVar("T")


class GmailNotConfiguredError(RuntimeError):
    pass


class GmailNotConnectedError(RuntimeError):
    pass


class GmailTimeoutError(RuntimeError):
    pass


def _run_with_timeout(operation: Callable[[], T], *, timeout: float = _GMAIL_TIMEOUT) -> T:
    with ThreadPoolExecutor(max_workers=1) as pool:
        future = pool.submit(operation)
        try:
            return future.result(timeout=timeout)
        except FuturesTimeoutError as exc:
            raise GmailTimeoutError(f"Gmail did not respond within {timeout:.0f}s") from exc


def is_gmail_configured() -> bool:
    return bool(settings.google_client_id.strip() and settings.google_client_secret.strip())


def _client_config() -> dict[str, Any]:
    if not is_gmail_configured():
        raise GmailNotConfiguredError("Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.")
    return {
        "web": {
            "client_id": settings.google_client_id.strip(),
            "client_secret": settings.google_client_secret.strip(),
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": [settings.resolved_google_redirect_uri],
        }
    }


def _redirect_uri() -> str:
    uri = settings.resolved_google_redirect_uri
    if not uri:
        raise GmailNotConfiguredError("GOOGLE_REDIRECT_URI is not set.")
    return uri


def build_oauth_url(*, session_token: str) -> str:
    state = encode_oauth_state(session_token)
    params: dict[str, str] = {
        "client_id": settings.google_client_id.strip(),
        "redirect_uri": _redirect_uri(),
        "response_type": "code",
        "scope": " ".join(GMAIL_SCOPES),
        "access_type": "offline",
        "include_granted_scopes": "true",
        "prompt": "consent",
        "state": state,
    }
    domain = settings.workspace_domain.strip()
    if domain:
        params["hd"] = domain
    return f"https://accounts.google.com/o/oauth2/auth?{urllib.parse.urlencode(params)}"


def exchange_code_for_tokens(code: str) -> dict[str, Any]:
    payload = {
        "code": code,
        "client_id": settings.google_client_id.strip(),
        "client_secret": settings.google_client_secret.strip(),
        "redirect_uri": _redirect_uri(),
        "grant_type": "authorization_code",
    }
    with httpx.Client(timeout=30.0) as client:
        response = client.post("https://oauth2.googleapis.com/token", data=payload)
        if response.status_code >= 400:
            logger.error("Gmail token exchange failed: %s", response.text)
            raise RuntimeError(response.text)
        token_data = response.json()
    return {
        "token": token_data.get("access_token"),
        "refresh_token": token_data.get("refresh_token"),
        "token_uri": "https://oauth2.googleapis.com/token",
        "client_id": settings.google_client_id.strip(),
        "client_secret": settings.google_client_secret.strip(),
        "scopes": list(token_data.get("scope", "").split()) or GMAIL_SCOPES,
    }


def _credentials_from_store(username: str):
    from google.auth.transport.requests import Request
    from google.oauth2.credentials import Credentials

    raw = gmail_store.get_tokens(username)
    if not raw:
        return None
    creds = Credentials(
        token=raw.get("token"),
        refresh_token=raw.get("refresh_token"),
        token_uri=raw.get("token_uri") or "https://oauth2.googleapis.com/token",
        client_id=raw.get("client_id") or settings.google_client_id,
        client_secret=raw.get("client_secret") or settings.google_client_secret,
        scopes=raw.get("scopes") or GMAIL_SCOPES,
    )
    if creds.expired and creds.refresh_token:
        creds.refresh(Request())
        gmail_store.save_tokens(
            username,
            {
                "token": creds.token,
                "refresh_token": creds.refresh_token,
                "token_uri": creds.token_uri,
                "client_id": creds.client_id,
                "client_secret": creds.client_secret,
                "scopes": list(creds.scopes or GMAIL_SCOPES),
            },
        )
    return creds


def get_gmail_service(username: str):
    from google.auth.transport.requests import Request
    from googleapiclient.discovery import build

    creds = _credentials_from_store(username)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            raise GmailNotConnectedError("Gmail is not connected for this user.")
    return build("gmail", "v1", credentials=creds, cache_discovery=False)


def get_profile_email(username: str) -> str | None:
    from googleapiclient.errors import HttpError

    try:
        profile = _run_with_timeout(
            lambda: get_gmail_service(username).users().getProfile(userId="me").execute(),
            timeout=10.0,
        )
        return str(profile.get("emailAddress") or "") or None
    except (GmailNotConnectedError, GmailTimeoutError, HttpError, OSError):
        return None


def _header_map(payload: dict[str, Any]) -> dict[str, str]:
    headers: dict[str, str] = {}
    for item in payload.get("headers") or []:
        name = str(item.get("name") or "").lower()
        value = str(item.get("value") or "")
        if name:
            headers[name] = value
    return headers


def _parse_address_list(value: str) -> list[str]:
    emails: list[str] = []
    for part in re.split(r",(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)", value):
        _, addr = parseaddr(part.strip())
        if addr:
            emails.append(addr.lower())
    return emails


def _normalize_message(msg: dict[str, Any]) -> dict[str, Any]:
    payload = msg.get("payload") or {}
    headers = _header_map(payload)
    from_name, from_email = parseaddr(headers.get("from", ""))
    label_ids = set(msg.get("labelIds") or [])
    return {
        "id": str(msg.get("id") or ""),
        "thread_id": str(msg.get("threadId") or ""),
        "subject": headers.get("subject", "(no subject)"),
        "from_name": from_name or from_email,
        "from_email": from_email.lower(),
        "to_emails": _parse_address_list(headers.get("to", "")),
        "cc_emails": _parse_address_list(headers.get("cc", "")),
        "snippet": str(msg.get("snippet") or ""),
        "internal_date": int(msg["internalDate"]) if msg.get("internalDate") else None,
        "is_unread": "UNREAD" in label_ids,
    }


def _extract_body_text(payload: dict[str, Any]) -> str:
    mime = str(payload.get("mimeType") or "")
    body = payload.get("body") or {}
    data = body.get("data")
    if data and mime in ("text/plain", ""):
        try:
            return base64.urlsafe_b64decode(data + "=" * (-len(data) % 4)).decode("utf-8", errors="replace")
        except Exception:
            pass
    parts = payload.get("parts") or []
    plain = ""
    html = ""
    for part in parts:
        part_mime = str(part.get("mimeType") or "")
        if part_mime.startswith("multipart/"):
            nested = _extract_body_text(part)
            if nested:
                return nested
        if part_mime == "text/plain" and not plain:
            plain = _extract_body_text(part)
        elif part_mime == "text/html" and not html:
            html = _extract_body_text(part)
    if plain:
        return plain
    if html:
        return re.sub(r"<[^>]+>", " ", html)
    return ""


def fetch_message_detail(username: str, message_id: str) -> dict[str, Any]:
    from googleapiclient.errors import HttpError

    def _fetch() -> dict[str, Any]:
        service = get_gmail_service(username)
        detail = (
            service.users()
            .messages()
            .get(userId="me", id=message_id, format="full")
            .execute()
        )
        normalized = _normalize_message(detail)
        payload = detail.get("payload") or {}
        normalized["body_text"] = _extract_body_text(payload).strip()
        return normalized

    return _run_with_timeout(_fetch)


def fetch_inbox_messages(username: str, *, max_results: int = 30) -> list[dict[str, Any]]:
    from googleapiclient.errors import HttpError

    def _fetch() -> list[dict[str, Any]]:
        service = get_gmail_service(username)
        query = settings.gmail_inbox_query.strip() or "in:inbox newer_than:14d"
        listing = (
            service.users()
            .messages()
            .list(userId="me", q=query, maxResults=max_results)
            .execute()
        )
        ids = [str(item["id"]) for item in listing.get("messages") or [] if item.get("id")]
        messages: list[dict[str, Any]] = []
        for message_id in ids[:max_results]:
            try:
                detail = (
                    service.users()
                    .messages()
                    .get(
                        userId="me",
                        id=message_id,
                        format="metadata",
                        metadataHeaders=["From", "To", "Cc", "Subject"],
                    )
                    .execute()
                )
                messages.append(_normalize_message(detail))
            except HttpError:
                continue
        messages.sort(key=lambda m: m.get("internal_date") or 0, reverse=True)
        return messages

    return _run_with_timeout(_fetch)


def send_email_message(
    username: str,
    *,
    to: str,
    subject: str,
    body_text: str,
    body_html: str | None = None,
) -> dict[str, Any]:
    from email.mime.multipart import MIMEMultipart
    from email.mime.text import MIMEText
    from googleapiclient.errors import HttpError

    def _send() -> dict[str, Any]:
        message = MIMEMultipart("alternative")
        message["to"] = to
        message["subject"] = subject
        message.attach(MIMEText(body_text, "plain", "utf-8"))
        if body_html:
            message.attach(MIMEText(body_html, "html", "utf-8"))
        raw = base64.urlsafe_b64encode(message.as_bytes()).decode().rstrip("=")
        service = get_gmail_service(username)
        return (
            service.users()
            .messages()
            .send(userId="me", body={"raw": raw})
            .execute()
        )

    try:
        return _run_with_timeout(_send)
    except HttpError as exc:
        raise RuntimeError(f"Gmail send failed: {exc}") from exc


def encode_oauth_state(token: str) -> str:
    payload = json.dumps({"t": token})
    return base64.urlsafe_b64encode(payload.encode()).decode().rstrip("=")


def decode_oauth_state(state: str) -> str | None:
    try:
        pad = "=" * (-len(state) % 4)
        raw = base64.urlsafe_b64decode(state + pad)
        data = json.loads(raw.decode())
        token = str(data.get("t") or "").strip()
        return token or None
    except (ValueError, json.JSONDecodeError, UnicodeDecodeError):
        return None
