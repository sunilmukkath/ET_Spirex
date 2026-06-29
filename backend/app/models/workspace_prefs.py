from pydantic import BaseModel, Field


class FilterPreset(BaseModel):
    id: str
    name: str
    filter_tree: dict | None = None
    filters: list[dict] = Field(default_factory=list)
    created_at: float = 0
    updated_at: float = 0


class FilterPresetCreate(BaseModel):
    name: str
    filter_tree: dict | None = None
    filters: list[dict] = Field(default_factory=list)


class AnalysisBookmark(BaseModel):
    id: str
    name: str
    kind: str  # crosstab | chart | filter
    config: dict = Field(default_factory=dict)
    created_at: float = 0
    updated_at: float = 0


class AnalysisBookmarkCreate(BaseModel):
    name: str
    kind: str
    config: dict = Field(default_factory=dict)


class WeightConfig(BaseModel):
    enabled: bool = False
    variable_id: str | None = None


class ReportExportRequest(BaseModel):
    format: str = "pdf"  # pdf | pptx
    report_type: str = "profile"  # profile | banner
    variable_id: str | None = None
    completion_status: str = "complete"
    filters: list[dict] = Field(default_factory=list)
    filter_tree: dict | None = None
    banner_request: dict | None = None
