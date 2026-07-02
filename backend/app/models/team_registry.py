from typing import Literal

from pydantic import BaseModel, Field

from app.models.app_modules import APP_MODULES, AppModule

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
    modules: list[AppModule] = Field(default_factory=list)


class TeamRegistry(BaseModel):
    users: list[TeamUser] = Field(default_factory=list)
    super_admins: list[str] = Field(default_factory=list)


class TeamUserCreate(BaseModel):
    username: str
    email: str = ""
    full_name: str = ""
    job_title: str = ""
    department: str = "Research"
    role: GlobalRole = "member"
