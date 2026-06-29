from __future__ import annotations

from collections import defaultdict
from datetime import datetime, timezone
from typing import Any

import pandas as pd

from app.services.analysis_context import load_analysis_context
from app.services.data_quality import _find_time_columns
from app.services.field_reports import _interviewer_labels
from app.services.interviewer_qc import resolve_interviewer_variable_id
from app.services.qc_config_store import get_qc_config
from app.services.question_schema import get_variable


def fielding_stats(
    survey_id: int,
    *,
    completion_status: str = "complete",
    interviewer_variable_id: str | None = None,
) -> dict[str, Any]:
    schema, df = load_analysis_context(survey_id, completion_status=completion_status)
    start_col, end_col = _find_time_columns(df)

    daily: dict[str, int] = defaultdict(int)
    hourly: dict[str, int] = defaultdict(int)

    if end_col and end_col in df.columns:
        ends = pd.to_datetime(df[end_col], errors="coerce")
        for ts in ends.dropna():
            day = ts.strftime("%Y-%m-%d")
            hour = ts.strftime("%Y-%m-%d %H:00")
            daily[day] += 1
            hourly[hour] += 1

    daily_rows = [{"date": d, "count": daily[d]} for d in sorted(daily)]
    cumulative = 0
    for row in daily_rows:
        cumulative += row["count"]
        row["cumulative"] = cumulative

    variable_id = resolve_interviewer_variable_id(survey_id, interviewer_variable_id)
    interviewer_rows: list[dict[str, Any]] = []
    if variable_id:
        var = get_variable(schema, variable_id)
        if var is not None and len(df):
            labels = _interviewer_labels(schema, var, df)
            counts = labels.value_counts()
            for name, count in counts.items():
                interviewer_rows.append({"interviewer": str(name), "count": int(count)})
            interviewer_rows.sort(key=lambda x: (-x["count"], x["interviewer"]))

    avg_seconds = None
    if start_col and end_col and start_col in df.columns and end_col in df.columns:
        start = pd.to_datetime(df[start_col], errors="coerce")
        end = pd.to_datetime(df[end_col], errors="coerce")
        seconds = (end - start).dt.total_seconds()
        valid = seconds[(seconds > 0) & (seconds < 86400 * 7)]
        if not valid.empty:
            avg_seconds = round(float(valid.mean()), 1)

    qc_cfg = get_qc_config(survey_id)

    return {
        "survey_id": survey_id,
        "completion_status": completion_status,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "total_responses": len(df),
        "daily": daily_rows,
        "hourly": [{"hour": h, "count": hourly[h]} for h in sorted(hourly)][-48:],
        "interviewer_variable_id": variable_id,
        "by_interviewer": interviewer_rows,
        "average_completion_seconds": avg_seconds,
        "has_submit_dates": bool(end_col),
    }
