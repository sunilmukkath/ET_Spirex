from pydantic import BaseModel, Field


class PinnedSurveys(BaseModel):
    survey_ids: list[int] = Field(default_factory=list)
