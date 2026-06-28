from __future__ import annotations

from typing import Any

import pandas as pd

from app.services.custom_variables import apply_custom_variables
from app.services.question_schema import build_survey_schema
from app.services.response_store import get_responses


def load_analysis_context(
    survey_id: int,
    *,
    completion_status: str = "complete",
) -> tuple[dict[str, Any], pd.DataFrame]:
    schema = build_survey_schema(survey_id, completion_status=completion_status)
    df = get_responses(survey_id, completion_status=completion_status).dataframe
    return apply_custom_variables(survey_id, schema, df)
