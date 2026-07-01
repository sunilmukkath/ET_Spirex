"""Assistant chat API."""

from fastapi import APIRouter, Header, HTTPException

from app.models.assistant import AssistantChatRequest, AssistantChatResponse
from app.services.assistant import run_assistant_chat
from app.services.auth import get_session

router = APIRouter(tags=["assistant"])


def _extract_token(authorization: str | None) -> str | None:
    if not authorization:
        return None
    if authorization.lower().startswith("bearer "):
        return authorization[7:].strip()
    return authorization.strip()


@router.post("/assistant/chat", response_model=AssistantChatResponse)
def assistant_chat(
    body: AssistantChatRequest,
    authorization: str | None = Header(default=None),
) -> AssistantChatResponse:
    record = get_session(_extract_token(authorization))
    if not record:
        raise HTTPException(status_code=401, detail="Not signed in")
    return run_assistant_chat(record.username, body)
