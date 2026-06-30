from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.services.analysis_context import load_analysis_context
from app.services.qc_config_store import get_qc_config
from app.services.qc_filter import get_qc_excluded_response_ids
from app.services.quota_config_store import get_quota_config
from app.services.quota_check import check_quotas


def survey_overview(survey_id: int) -> dict[str, Any]:
    schema, df_complete = load_analysis_context(survey_id, completion_status="complete")
    total_complete = len(df_complete)

    total_all = total_complete
    incomplete = 0
    try:
        from app.lime_client import execute_lime

        summary = execute_lime(lambda client: client.get_summary(survey_id) or {})
        incomplete = int(summary.get("incomplete_responses") or 0)
        total_all = int(summary.get("count_total") or 0) or (
            int(summary.get("completed_responses") or total_complete) + incomplete
        )
        if not incomplete and total_all > total_complete:
            incomplete = max(0, total_all - total_complete)
    except Exception:
        try:
            _, df_all = load_analysis_context(survey_id, completion_status="all")
            total_all = len(df_all)
            incomplete = max(0, total_all - total_complete)
        except Exception:
            total_all = total_complete
            incomplete = 0

    qc_cfg = get_qc_config(survey_id)
    quota_cfg = get_quota_config(survey_id)
    excluded = get_qc_excluded_response_ids(survey_id)
    qc_approved = max(0, total_complete - len(excluded))

    quota_summary = None
    if quota_cfg.fields or quota_cfg.layers:
        try:
            check = check_quotas(survey_id, completion_status=quota_cfg.basis)
            quota_summary = {
                "fields_ok": check.get("summary", {}).get("fields_ok", 0),
                "fields_under": check.get("summary", {}).get("fields_under", 0),
                "fields_over": check.get("summary", {}).get("fields_over", 0),
                "layers_ok": check.get("summary", {}).get("layers_ok", 0),
                "layers_under": check.get("summary", {}).get("layers_under", 0),
                "layers_over": check.get("summary", {}).get("layers_over", 0),
                "total_completes": check.get("total_completes", total_complete),
                "checked_at": check.get("checked_at"),
            }
        except Exception:
            quota_summary = None

    variables = schema.get("variables") or []
    banner_ready = sum(1 for v in variables if v.get("can_banner"))

    return {
        "survey_id": survey_id,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "response_count": total_complete,
        "total_responses": total_all,
        "incomplete_count": incomplete,
        "qc_approved_count": qc_approved,
        "qc_excluded_count": len(excluded),
        "question_count": schema.get("question_count") or len(variables),
        "banner_ready_count": banner_ready,
        "custom_rule_count": len(qc_cfg.custom_rules or []),
        "quota_field_count": len(quota_cfg.fields or []),
        "quota_layer_count": len(quota_cfg.layers or []),
        "has_interviewer_variable": bool(
            qc_cfg.interviewer_variable_id or quota_cfg.interviewer_variable_id
        ),
        "quota_summary": quota_summary,
    }
