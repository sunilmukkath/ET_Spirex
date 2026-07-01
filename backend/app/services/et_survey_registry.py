"""Registry helpers for ET native surveys vs LimeSurvey."""

from __future__ import annotations

ET_SURVEY_ID_MIN = 9_000_000


def is_et_survey(workspace_id: int) -> bool:
    return int(workspace_id) >= ET_SURVEY_ID_MIN


def et_provider_label() -> str:
    return "et"
