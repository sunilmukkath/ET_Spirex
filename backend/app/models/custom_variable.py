from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class CategoryMapping(BaseModel):
    label: str
    source_values: list[str] = Field(default_factory=list)


CustomVariableType = Literal["recode", "combine", "net_score"]


class CustomVariableCreate(BaseModel):
    name: str
    code: str
    variable_type: CustomVariableType = "recode"
    source_variable_id: str = ""
    source_variable_ids: list[str] = Field(default_factory=list)
    categories: list[CategoryMapping] = Field(default_factory=list)
    include_unmapped: bool = True
    unmapped_label: str = "Other"
    tracked_codes: list[str] = Field(default_factory=list)
    top_codes: list[str] = Field(default_factory=list)
    bottom_codes: list[str] = Field(default_factory=list)


class CustomVariableUpdate(BaseModel):
    name: str | None = None
    code: str | None = None
    variable_type: CustomVariableType | None = None
    source_variable_id: str | None = None
    source_variable_ids: list[str] | None = None
    categories: list[CategoryMapping] | None = None
    include_unmapped: bool | None = None
    unmapped_label: str | None = None
    tracked_codes: list[str] | None = None
    top_codes: list[str] | None = None
    bottom_codes: list[str] | None = None


class CustomVariable(BaseModel):
    id: str
    survey_id: int
    name: str
    code: str
    variable_type: CustomVariableType = "recode"
    source_variable_id: str = ""
    source_variable_ids: list[str] = Field(default_factory=list)
    categories: list[CategoryMapping] = Field(default_factory=list)
    include_unmapped: bool = True
    unmapped_label: str = "Other"
    tracked_codes: list[str] = Field(default_factory=list)
    top_codes: list[str] = Field(default_factory=list)
    bottom_codes: list[str] = Field(default_factory=list)
    created_at: float
    updated_at: float


class CustomVariableSyncRequest(BaseModel):
    variables: list[CustomVariable] = Field(default_factory=list)
