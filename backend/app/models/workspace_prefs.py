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
    ai_narrative: bool = False


class ReportNarrativeRequest(BaseModel):
    report_type: str = "profile"
    variable_id: str | None = None
    completion_status: str = "complete"
    filters: list[dict] = Field(default_factory=list)
    filter_tree: dict | None = None
    banner_request: dict | None = None


class ReportSectionInput(BaseModel):
    section_id: str
    label: str
    report_type: str = "profile"  # profile | banner
    variable_id: str | None = None
    completion_status: str = "complete"
    filters: list[dict] = Field(default_factory=list)
    filter_tree: dict | None = None
    banner_request: dict | None = None


class SlidePlanItem(BaseModel):
    section_id: str
    title: str = ""
    bullets: list[str] = Field(default_factory=list)
    speaker_notes: str = ""


class ReportSlidePlanRequest(BaseModel):
    sections: list[ReportSectionInput]
    deck_title: str = ""


class ReportWritingRequest(BaseModel):
    sections: list[ReportSectionInput]
    deck_title: str = ""
    client_context: str | None = None


class ReportDeckExportRequest(BaseModel):
    sections: list[ReportSectionInput]
    format: str = "pptx"
    deck_title: str = ""
    slide_plan: list[SlidePlanItem] = Field(default_factory=list)
    include_charts: bool = True
    ai_narrative: bool = False
