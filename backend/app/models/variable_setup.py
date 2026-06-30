from __future__ import annotations

from pydantic import BaseModel, Field


class VariableSetupEntry(BaseModel):
    kind_override: str | None = None
    value_weights: dict[str, float] = Field(default_factory=dict)


class VariableSetupConfig(BaseModel):
    variables: dict[str, VariableSetupEntry] = Field(default_factory=dict)


class VariableSetupUpdate(BaseModel):
    kind_override: str | None = None
    value_weights: dict[str, float] | None = None
