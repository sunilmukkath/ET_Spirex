from pydantic import BaseModel, Field


class FilterSpec(BaseModel):
    variable_id: str
    values: list[str] = Field(default_factory=list)


class BannerRequest(BaseModel):
    row_variable_id: str
    row_variable_ids: list[str] = Field(default_factory=list)
    banner_variable_ids: list[str] = Field(default_factory=list)
    filters: list[FilterSpec] = Field(default_factory=list)
    completion_status: str = "complete"
    show_counts: bool = True
    show_col_pct: bool = True
    show_row_pct: bool = False
    show_significance: bool = True
    confidence_level: float = 0.95
    metric: str = "auto"


class ProfileRequest(BaseModel):
    variable_id: str
    completion_status: str = "complete"
    filters: list[FilterSpec] = Field(default_factory=list)


class ProjectStatsRequest(BaseModel):
    survey_ids: list[int] = Field(default_factory=list)
