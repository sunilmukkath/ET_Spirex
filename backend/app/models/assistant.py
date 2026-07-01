"""Schemas for the ET Scout floating assistant."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field


class AssistantMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class AssistantChatRequest(BaseModel):
    message: str
    history: list[AssistantMessage] = Field(default_factory=list)
    context: dict[str, Any] = Field(default_factory=dict)


class AssistantChatResponse(BaseModel):
    reply: str
    configured: bool
