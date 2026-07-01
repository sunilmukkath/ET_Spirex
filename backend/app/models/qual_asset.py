from typing import Literal

from pydantic import BaseModel, Field

QualAssetType = Literal["transcript", "session_note"]
QualSessionStatus = Literal["draft", "reviewed", "coded"]


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
    survey_id: int
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
