from typing import Literal

from pydantic import BaseModel, Field

GlobalRole = Literal["admin", "manager", "member"]

PROJECT_MODULES = (
    "programming",
    "field",
    "research",
    "finance",
    "client",
    "analysis",
    "qc",
    "export",
)


class TeamUser(BaseModel):
    username: str
    role: GlobalRole = "member"


class TeamRegistry(BaseModel):
    users: list[TeamUser] = Field(default_factory=list)
