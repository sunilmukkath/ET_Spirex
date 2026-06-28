from pydantic import BaseModel, Field


class FilterCondition(BaseModel):
    type: str = "condition"
    variable_id: str
    operator: str = "in"
    values: list[str] = Field(default_factory=list)


class FilterGroup(BaseModel):
    type: str = "group"
    logic: str = "and"
    negate: bool = False
    children: list[dict] = Field(default_factory=list)


class FilterSpec(BaseModel):
    variable_id: str
    values: list[str] = Field(default_factory=list)


class BannerRequest(BaseModel):
    row_variable_id: str
    row_variable_ids: list[str] = Field(default_factory=list)
    banner_variable_ids: list[str] = Field(default_factory=list)
    filters: list[FilterSpec] = Field(default_factory=list)
    filter_tree: dict | None = None
    row_filters: dict[str, list[FilterSpec]] = Field(default_factory=dict)
    completion_status: str = "complete"
    show_counts: bool = True
    show_col_pct: bool = True
    show_row_pct: bool = False
    show_significance: bool = True
    confidence_level: float = 0.95
    metric: str = "auto"


class ChartRequest(BaseModel):
    variable_id: str
    completion_status: str = "complete"
    filters: list[FilterSpec] = Field(default_factory=list)
    filter_tree: dict | None = None
    chart_type: str = "auto"
    bins: int = Field(default=10, ge=3, le=50)
    banner_variable_id: str | None = None
    y_variable_id: str | None = None
    z_variable_id: str | None = None


class ProfileRequest(BaseModel):
    variable_id: str
    completion_status: str = "complete"
    filters: list[FilterSpec] = Field(default_factory=list)
    filter_tree: dict | None = None


class AdvancedAnalysisRequest(BaseModel):
    analysis_type: str
    completion_status: str = "complete"
    filters: list[FilterSpec] = Field(default_factory=list)
    filter_tree: dict | None = None
    variable_ids: list[str] = Field(default_factory=list)
    dependent_id: str | None = None
    independent_ids: list[str] = Field(default_factory=list)
    group_variable_id: str | None = None
    numeric_variable_id: str | None = None
    method: str = "pearson"


class ProjectStatsRequest(BaseModel):
    survey_ids: list[int] = Field(default_factory=list)
