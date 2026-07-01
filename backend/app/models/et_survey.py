"""ET Scout native survey definition models."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, Field

EtQuestionType = Literal[
    "display",
    "single",
    "multi",
    "text",
    "long_text",
    "numeric",
    "scale",
    "matrix",
    "yes_no",
]

EtSurveyStatus = Literal["draft", "active", "closed"]

EtLogicOperator = Literal["equals", "not_equals", "includes", "not_includes"]


class EtAnswerOption(BaseModel):
    code: str
    label: str
    sort_order: int = 0


class EtMatrixRow(BaseModel):
    code: str
    label: str
    sort_order: int = 0


class EtShowIfRule(BaseModel):
    """Simple visibility: show this question when another answer matches."""

    question_id: str
    operator: EtLogicOperator = "equals"
    values: list[str] = Field(default_factory=list)


class EtQuestion(BaseModel):
    id: str
    code: str
    type: EtQuestionType
    text: str
    help_text: str = ""
    required: bool = False
    sort_order: int = 0
    options: list[EtAnswerOption] = Field(default_factory=list)
    rows: list[EtMatrixRow] = Field(default_factory=list)
    scale_min: int = 1
    scale_max: int = 5
    scale_min_label: str = ""
    scale_max_label: str = ""
    show_if: EtShowIfRule | None = None


class EtBlock(BaseModel):
    id: str
    title: str
    description: str = ""
    sort_order: int = 0
    questions: list[EtQuestion] = Field(default_factory=list)


class EtSurveySettings(BaseModel):
    welcome_title: str = "Welcome"
    welcome_message: str = "Thank you for taking part in this research."
    thank_you_title: str = "Thank you"
    thank_you_message: str = "Your responses have been recorded."
    single_page: bool = False
    show_progress: bool = True
    language: str = "en"


class EtSurveyDefinition(BaseModel):
    version: int = 1
    blocks: list[EtBlock] = Field(default_factory=list)
    settings: EtSurveySettings = Field(default_factory=EtSurveySettings)


class EtSurveyCreate(BaseModel):
    title: str
    description: str = ""
    language: str = "en"


class EtSurveyUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    status: EtSurveyStatus | None = None
    definition: EtSurveyDefinition | None = None
    language: str | None = None


class EtSurveyOut(BaseModel):
    workspace_id: int
    title: str
    description: str
    status: EtSurveyStatus
    language: str
    public_slug: str
    definition: EtSurveyDefinition
    version: int
    created_by: str
    created_at: str
    updated_at: str
    response_count: int = 0
    provider: Literal["et"] = "et"


class EtSurveyListItem(BaseModel):
    workspace_id: int
    title: str
    description: str
    status: EtSurveyStatus
    language: str
    public_slug: str
    created_by: str
    updated_at: str
    response_count: int = 0
    provider: Literal["et"] = "et"
    active: bool = True


class EtCollectorSurvey(BaseModel):
    title: str
    description: str
    status: EtSurveyStatus
    definition: EtSurveyDefinition
    public_slug: str


class EtResponseSubmit(BaseModel):
    answers: dict[str, Any] = Field(default_factory=dict)
    complete: bool = True


class EtResponseSubmitResult(BaseModel):
    response_id: str
    complete: bool
