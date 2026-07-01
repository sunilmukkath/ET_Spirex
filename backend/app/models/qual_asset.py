from typing import Any, Literal

from pydantic import BaseModel, Field

QualAssetType = Literal["transcript", "session_note"]
QualSessionStatus = Literal["draft", "reviewed", "coded"]
QualRowDimension = Literal["tags", "asset_type", "status", "moderator", "top_terms"]
QualBannerField = Literal["tags", "asset_type", "status", "moderator", "respondent_id"]


class QualAssetCreate(BaseModel):
    title: str
    asset_type: QualAssetType = "transcript"
    content: str
    respondent_id: str = ""
    session_date: str | None = None
    moderator: str = ""
    tags: list[str] = Field(default_factory=list)
    status: QualSessionStatus = "draft"


class QualAssetUpdate(BaseModel):
    title: str | None = None
    asset_type: QualAssetType | None = None
    content: str | None = None
    respondent_id: str | None = None
    session_date: str | None = None
    moderator: str | None = None
    tags: list[str] | None = None
    status: QualSessionStatus | None = None


class QualAsset(BaseModel):
    id: str
    survey_id: int = 0
    project_id: str | None = None
    title: str
    asset_type: QualAssetType
    content: str
    respondent_id: str = ""
    session_date: str | None = None
    moderator: str = ""
    tags: list[str] = Field(default_factory=list)
    status: QualSessionStatus = "draft"
    word_count: int = 0
    created_by: str | None = None
    created_at: float
    updated_at: float


class QualSearchHit(BaseModel):
    asset_id: str
    title: str
    asset_type: QualAssetType
    snippet: str
    match_count: int = 1


class QualSummaryRequest(BaseModel):
    asset_ids: list[str] | None = None
    focus: str = ""


class QualAskRequest(BaseModel):
    question: str
    asset_ids: list[str] | None = None


class QualSessionFilter(BaseModel):
    tags: list[str] = Field(default_factory=list)
    statuses: list[QualSessionStatus] = Field(default_factory=list)
    asset_types: list[QualAssetType] = Field(default_factory=list)
    query: str = ""


class QualComparePresetCreate(BaseModel):
    name: str
    row_dimension: QualRowDimension = "tags"
    banner_layers: list[list[QualBannerField]] = Field(default_factory=list)
    session_filter: QualSessionFilter = Field(default_factory=QualSessionFilter)
    table_filters: dict[str, list[str]] = Field(default_factory=dict)
    show_col_pct: bool = True
    show_row_pct: bool = False


class QualComparePreset(QualComparePresetCreate):
    id: str
    created_at: float
    created_by: str | None = None


class QualReportSection(BaseModel):
    id: str
    heading: str
    section_type: Literal[
        "executive_summary",
        "methodology",
        "themes",
        "verbatims",
        "recommendations",
        "custom",
    ] = "custom"
    enabled: bool = True
    body: str = ""


class QualReportTemplate(BaseModel):
    sections: list[QualReportSection] = Field(default_factory=list)


class QualReportSave(BaseModel):
    title: str
    sections: list[QualReportSection]


class QualSavedReport(QualReportSave):
    id: str
    created_at: float
    created_by: str | None = None


class QualWorkspaceMeta(BaseModel):
    compare_presets: list[QualComparePreset] = Field(default_factory=list)
    report_template: QualReportTemplate = Field(default_factory=QualReportTemplate)
    reports: list[QualSavedReport] = Field(default_factory=list)
