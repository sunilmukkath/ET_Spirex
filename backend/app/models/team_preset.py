from typing import Literal

from pydantic import BaseModel, Field

TeamPresetKind = Literal["banner", "quota", "qc", "filter"]


class TeamPreset(BaseModel):
    id: str
    name: str
    kind: TeamPresetKind
    config: dict = Field(default_factory=dict)
    created_by: str | None = None
    created_at: float = 0
    updated_at: float = 0


class TeamPresetCreate(BaseModel):
    name: str
    kind: TeamPresetKind
    config: dict = Field(default_factory=dict)
