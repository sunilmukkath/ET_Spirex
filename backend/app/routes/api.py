from fastapi import APIRouter, Header, HTTPException
from fastapi.responses import StreamingResponse

from app.lime_client import (
    LimeSurveyError,
    LimeSurveyNotConfiguredError,
    fetch_projects_stats,
    get_connection_status,
    get_project_detail,
    get_survey_questions,
    is_stale_session_error,
    list_projects,
)
from app.models.analysis import (
    AdvancedAnalysisRequest,
    BannerRequest,
    ChartRequest,
    ProfileRequest,
    ProjectStatsRequest,
)
from app.models.auth import LoginRequest, LoginResponse
from app.models.custom_variable import CustomVariableCreate, CustomVariableSyncRequest, CustomVariableUpdate
from app.services.auth import VALID_USERS, authenticate, get_session, list_active_sessions, logout
from app.services.banner_analysis import run_banner_table, run_chart_data, run_question_profile, get_filter_options
from app.services.advanced_analysis import run_advanced_analysis
from app.services.custom_variable_store import (
    create_custom_variable,
    delete_custom_variable,
    get_custom_variable,
    list_custom_variables,
    sync_custom_variables,
    update_custom_variable,
)
from app.services.custom_variables import preview_custom_variable
from app.services.data_quality import run_data_quality
from app.services.excel_export import banner_result_to_excel
from app.services.question_schema import build_survey_schema
from app.services.filter_preset_store import create_filter_preset, delete_filter_preset, list_filter_presets
from app.services.analysis_bookmark_store import (
    create_analysis_bookmark,
    delete_analysis_bookmark,
    list_analysis_bookmarks,
)
from app.services.weight_config_store import get_weight_config, set_weight_config
from app.models.qc_config import QcConfig
from app.services.qc_config_store import get_qc_config, set_qc_config
from app.models.quota_config import QuotaConfig
from app.services.quota_config_store import get_quota_config, set_quota_config
from app.services.quota_check import check_quotas, quota_eligible_variables
from app.services.field_reports import interviewer_rejections_csv, qc_checks_csv, quota_completion_csv
from app.models.workspace_prefs import (
    AnalysisBookmarkCreate,
    FilterPresetCreate,
    ReportExportRequest,
    WeightConfig,
)
from app.services.report_export import banner_to_pdf, banner_to_pptx, profile_to_pdf, profile_to_pptx
from app.services.raw_data import get_raw_data_page, raw_data_to_csv
from app.services.response_store import get_responses

router = APIRouter(prefix="/api")


def _handle_lime_error(exc: Exception) -> HTTPException:
    if isinstance(exc, LimeSurveyNotConfiguredError):
        return HTTPException(status_code=503, detail=str(exc))
    if is_stale_session_error(exc):
        return HTTPException(
            status_code=503,
            detail="LimeSurvey session expired. Please try again — the app will reconnect automatically.",
        )
    if isinstance(exc, LimeSurveyError):
        return HTTPException(status_code=502, detail=str(exc))
    exc_name = type(exc).__name__
    if exc_name in {"LimeSurveyStatusError", "LimeSurveyRPCError"}:
        return HTTPException(status_code=502, detail=str(exc))
    return HTTPException(status_code=500, detail=str(exc))


@router.get("/health")
def health():
    return {"status": "ok"}


@router.get("/auth/users")
def auth_users():
    return {"users": sorted(VALID_USERS)}


@router.post("/auth/login", response_model=LoginResponse)
def auth_login(body: LoginRequest):
    token = authenticate(body.username, body.password)
    if not token:
        raise HTTPException(status_code=401, detail="Invalid username or password")
    return LoginResponse(token=token, username=body.username)


@router.post("/auth/logout")
def auth_logout(authorization: str | None = Header(default=None)):
    token = _extract_token(authorization)
    logout(token)
    return {"ok": True}


@router.get("/auth/me")
def auth_me(authorization: str | None = Header(default=None)):
    record = get_session(_extract_token(authorization))
    if not record:
        raise HTTPException(status_code=401, detail="Not signed in")
    return {"username": record.username, "login_at": record.login_at}


@router.get("/auth/sessions")
def auth_sessions(authorization: str | None = Header(default=None)):
    if not get_session(_extract_token(authorization)):
        raise HTTPException(status_code=401, detail="Not signed in")
    return {"sessions": list_active_sessions()}


def _extract_token(authorization: str | None) -> str | None:
    if not authorization:
        return None
    if authorization.lower().startswith("bearer "):
        return authorization[7:].strip()
    return authorization.strip()


def _optional_username(authorization: str | None) -> str | None:
    record = get_session(_extract_token(authorization))
    return record.username if record else None


@router.get("/connection")
def connection():
    return get_connection_status()


@router.get("/projects")
def projects(limit: int | None = None, include_stats: bool = False):
    try:
        return {"projects": list_projects(include_stats=include_stats, limit=limit)}
    except Exception as exc:
        raise _handle_lime_error(exc) from exc


@router.post("/projects/stats")
def projects_stats(body: ProjectStatsRequest):
    try:
        stats = fetch_projects_stats(body.survey_ids)
        return {
            "stats": {
                str(sid): {
                    "completed": meta.get("completed", 0),
                    "incomplete": meta.get("incomplete", 0),
                    "total": meta.get("total", 0),
                    "created_date": meta.get("datecreated"),
                }
                for sid, meta in stats.items()
            }
        }
    except Exception as exc:
        raise _handle_lime_error(exc) from exc


@router.get("/projects/{survey_id}")
def project_detail(survey_id: int):
    try:
        return get_project_detail(survey_id)
    except Exception as exc:
        raise _handle_lime_error(exc) from exc


@router.get("/projects/{survey_id}/questions")
def project_questions(survey_id: int):
    try:
        return {"questions": get_survey_questions(survey_id)}
    except Exception as exc:
        raise _handle_lime_error(exc) from exc


@router.get("/projects/{survey_id}/schema")
def survey_schema(
    survey_id: int,
    completion_status: str = "complete",
    light: bool = False,
):
    try:
        return build_survey_schema(
            survey_id,
            completion_status=completion_status,
            light=light,
        )
    except Exception as exc:
        raise _handle_lime_error(exc) from exc


@router.post("/projects/{survey_id}/warmup")
def survey_warmup(survey_id: int, completion_status: str = "complete"):
    """Preload responses and full schema so the first analysis is faster."""
    try:
        from app.services.analysis_context import warmup_analysis_context

        warmup_analysis_context(survey_id, completion_status=completion_status)
        return {"ok": True}
    except Exception as exc:
        raise _handle_lime_error(exc) from exc


@router.get("/projects/{survey_id}/analysis/quality")
def data_quality(survey_id: int, completion_status: str = "complete", refresh: bool = False):
    try:
        # Quality checks always run on completed responses.
        return run_data_quality(
            survey_id,
            completion_status="complete",
            refresh=refresh,
        )
    except Exception as exc:
        raise _handle_lime_error(exc) from exc


@router.get("/projects/{survey_id}/qc/config")
def get_qc_config_route(survey_id: int):
    return get_qc_config(survey_id).model_dump()


@router.get("/projects/{survey_id}/qc/summary")
def get_qc_summary_route(survey_id: int):
    from app.services.qc_filter import get_qc_summary

    return get_qc_summary(survey_id)


@router.get("/projects/{survey_id}/qc/by-interviewer")
def get_interviewer_qc_route(survey_id: int, interviewer_variable_id: str | None = None):
    from app.services.interviewer_qc import interviewer_qc_stats

    try:
        return interviewer_qc_stats(survey_id, interviewer_variable_id)
    except Exception as exc:
        raise _handle_lime_error(exc) from exc


@router.get("/projects/{survey_id}/qc/interviewer-labels")
def get_interviewer_labels_route(survey_id: int, interviewer_variable_id: str | None = None):
    from app.services.interviewer_qc import interviewer_labels_by_response

    try:
        return interviewer_labels_by_response(survey_id, interviewer_variable_id)
    except Exception as exc:
        raise _handle_lime_error(exc) from exc


@router.get("/projects/{survey_id}/overview")
def get_survey_overview_route(survey_id: int):
    from app.services.survey_overview import survey_overview

    try:
        return survey_overview(survey_id)
    except Exception as exc:
        raise _handle_lime_error(exc) from exc


@router.get("/projects/{survey_id}/fielding")
def get_fielding_stats_route(
    survey_id: int,
    completion_status: str = "complete",
    interviewer_variable_id: str | None = None,
):
    from app.services.fielding_monitor import fielding_stats

    try:
        return fielding_stats(
            survey_id,
            completion_status=completion_status,
            interviewer_variable_id=interviewer_variable_id,
        )
    except Exception as exc:
        raise _handle_lime_error(exc) from exc


@router.get("/projects/{survey_id}/data/codebook/export")
def export_codebook_route(survey_id: int, completion_status: str = "complete"):
    from app.services.codebook_export import build_codebook_csv

    try:
        content = build_codebook_csv(survey_id, completion_status=completion_status)
        return StreamingResponse(
            iter([content]),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="survey_{survey_id}_codebook.csv"'},
        )
    except Exception as exc:
        raise _handle_lime_error(exc) from exc


@router.put("/projects/{survey_id}/qc/config")
def put_qc_config_route(survey_id: int, config: QcConfig):
    return set_qc_config(survey_id, config).model_dump()


@router.get("/projects/{survey_id}/quota/config")
def get_quota_config_route(survey_id: int):
    return get_quota_config(survey_id).model_dump()


@router.put("/projects/{survey_id}/quota/config")
def put_quota_config_route(survey_id: int, config: QuotaConfig):
    return set_quota_config(survey_id, config).model_dump()


@router.post("/projects/{survey_id}/quota/check")
def post_quota_check_route(survey_id: int, completion_status: str | None = None):
    try:
        return check_quotas(survey_id, completion_status=completion_status)
    except Exception as exc:
        raise _handle_lime_error(exc) from exc


@router.get("/projects/{survey_id}/quota/eligible")
def get_quota_eligible_route(survey_id: int, completion_status: str = "complete"):
    try:
        schema = build_survey_schema(survey_id, completion_status=completion_status, light=True)
        return {"variables": quota_eligible_variables(schema)}
    except Exception as exc:
        raise _handle_lime_error(exc) from exc


@router.get("/projects/{survey_id}/field-reports/quota/export")
def export_quota_completion_report(survey_id: int, completion_status: str | None = None):
    try:
        content = quota_completion_csv(survey_id, completion_status=completion_status)
        return StreamingResponse(
            iter([content]),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="survey_{survey_id}_quota_completion.csv"'},
        )
    except Exception as exc:
        raise _handle_lime_error(exc) from exc


@router.get("/projects/{survey_id}/field-reports/qc/export")
def export_qc_checks_report(survey_id: int):
    try:
        content = qc_checks_csv(survey_id)
        return StreamingResponse(
            iter([content]),
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="survey_{survey_id}_qc_checks.csv"'},
        )
    except Exception as exc:
        raise _handle_lime_error(exc) from exc


@router.get("/projects/{survey_id}/field-reports/interviewer-rejections/export")
def export_interviewer_rejections_report(
    survey_id: int,
    interviewer_variable_id: str | None = None,
):
    try:
        content = interviewer_rejections_csv(survey_id, interviewer_variable_id=interviewer_variable_id)
        return StreamingResponse(
            iter([content]),
            media_type="text/csv",
            headers={
                "Content-Disposition": f'attachment; filename="survey_{survey_id}_interviewer_rejections.csv"'
            },
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise _handle_lime_error(exc) from exc


@router.get("/projects/{survey_id}/variables/{variable_id}/filter-options")
def variable_filter_options(
    survey_id: int,
    variable_id: str,
    completion_status: str = "complete",
):
    try:
        return get_filter_options(
            survey_id,
            variable_id,
            completion_status=completion_status,
        )
    except Exception as exc:
        raise _handle_lime_error(exc) from exc


@router.get("/projects/{survey_id}/filters/presets")
def get_filter_presets(
    survey_id: int,
    authorization: str | None = Header(default=None),
):
    username = _optional_username(authorization)
    return {"presets": [p.model_dump() for p in list_filter_presets(survey_id, username=username)]}


@router.post("/projects/{survey_id}/filters/presets")
def post_filter_preset(
    survey_id: int,
    body: FilterPresetCreate,
    authorization: str | None = Header(default=None),
):
    username = _optional_username(authorization)
    preset = create_filter_preset(survey_id, body, username=username)
    return preset.model_dump()


@router.delete("/projects/{survey_id}/filters/presets/{preset_id}")
def remove_filter_preset(
    survey_id: int,
    preset_id: str,
    authorization: str | None = Header(default=None),
):
    username = _optional_username(authorization)
    ok = delete_filter_preset(survey_id, preset_id, username=username)
    if not ok:
        raise HTTPException(status_code=404, detail="Preset not found")
    return {"ok": True}


@router.get("/projects/{survey_id}/bookmarks")
def get_analysis_bookmarks(
    survey_id: int,
    authorization: str | None = Header(default=None),
):
    username = _optional_username(authorization)
    return {"bookmarks": [b.model_dump() for b in list_analysis_bookmarks(survey_id, username=username)]}


@router.post("/projects/{survey_id}/bookmarks")
def post_analysis_bookmark(
    survey_id: int,
    body: AnalysisBookmarkCreate,
    authorization: str | None = Header(default=None),
):
    username = _optional_username(authorization)
    bookmark = create_analysis_bookmark(survey_id, body, username=username)
    return bookmark.model_dump()


@router.delete("/projects/{survey_id}/bookmarks/{bookmark_id}")
def remove_analysis_bookmark(
    survey_id: int,
    bookmark_id: str,
    authorization: str | None = Header(default=None),
):
    username = _optional_username(authorization)
    ok = delete_analysis_bookmark(survey_id, bookmark_id, username=username)
    if not ok:
        raise HTTPException(status_code=404, detail="Bookmark not found")
    return {"ok": True}


@router.get("/projects/{survey_id}/weight-config")
def get_survey_weight_config(
    survey_id: int,
    authorization: str | None = Header(default=None),
):
    username = _optional_username(authorization)
    return get_weight_config(survey_id, username=username).model_dump()


@router.put("/projects/{survey_id}/weight-config")
def put_survey_weight_config(
    survey_id: int,
    body: WeightConfig,
    authorization: str | None = Header(default=None),
):
    username = _optional_username(authorization)
    config = set_weight_config(survey_id, body, username=username)
    return {**config.model_dump(), "saved": True}


@router.post("/projects/{survey_id}/analysis/report")
def export_analysis_report(
    survey_id: int,
    body: ReportExportRequest,
    authorization: str | None = Header(default=None),
):
    _optional_username(authorization)
    title = f"Survey {survey_id} report"
    fmt = (body.format or "pdf").lower()
    if body.report_type == "banner" and body.banner_request:
        result = run_banner_table(survey_id, **body.banner_request)
        data = banner_to_pdf(result, title) if fmt == "pdf" else banner_to_pptx(result, title)
        media = "application/pdf" if fmt == "pdf" else "application/vnd.openxmlformats-officedocument.presentationml.presentation"
        ext = "pdf" if fmt == "pdf" else "pptx"
    elif body.variable_id:
        result = run_question_profile(
            survey_id,
            body.variable_id,
            completion_status=body.completion_status,
            filters=[f for f in body.filters] if not body.filter_tree else None,
            filter_tree=body.filter_tree,
        )
        data = profile_to_pdf(result, title) if fmt == "pdf" else profile_to_pptx(result, title)
        media = "application/pdf" if fmt == "pdf" else "application/vnd.openxmlformats-officedocument.presentationml.presentation"
        ext = "pdf" if fmt == "pdf" else "pptx"
    else:
        raise HTTPException(status_code=400, detail="variable_id or banner_request required")

    return StreamingResponse(
        iter([data]),
        media_type=media,
        headers={"Content-Disposition": f'attachment; filename="report.{ext}"'},
    )


@router.get("/projects/{survey_id}/variables/custom")
def list_survey_custom_variables(
    survey_id: int,
    authorization: str | None = Header(default=None),
):
    username = _optional_username(authorization)
    return {"variables": [v.model_dump() for v in list_custom_variables(survey_id, username=username)]}


@router.put("/projects/{survey_id}/variables/custom/sync")
def sync_survey_custom_variables(
    survey_id: int,
    body: CustomVariableSyncRequest,
    authorization: str | None = Header(default=None),
):
    username = _optional_username(authorization)
    variables = sync_custom_variables(
        survey_id,
        [v.model_dump() for v in body.variables],
        username=username,
    )
    return {"variables": [v.model_dump() for v in variables], "saved": True}


@router.post("/projects/{survey_id}/variables/custom")
def create_survey_custom_variable(
    survey_id: int,
    body: CustomVariableCreate,
    authorization: str | None = Header(default=None),
):
    username = _optional_username(authorization)
    var = create_custom_variable(survey_id, body, username=username)
    return var.model_dump()


@router.put("/projects/{survey_id}/variables/custom/{variable_id}")
def update_survey_custom_variable(
    survey_id: int,
    variable_id: str,
    body: CustomVariableUpdate,
    authorization: str | None = Header(default=None),
):
    username = _optional_username(authorization)
    var = update_custom_variable(survey_id, variable_id, body, username=username)
    if not var:
        raise HTTPException(status_code=404, detail="Custom variable not found")
    return var.model_dump()


@router.delete("/projects/{survey_id}/variables/custom/{variable_id}")
def delete_survey_custom_variable(
    survey_id: int,
    variable_id: str,
    authorization: str | None = Header(default=None),
):
    username = _optional_username(authorization)
    if not delete_custom_variable(survey_id, variable_id, username=username):
        raise HTTPException(status_code=404, detail="Custom variable not found")
    return {"ok": True}


@router.post("/projects/{survey_id}/variables/custom/preview")
def preview_survey_custom_variable(
    survey_id: int,
    body: CustomVariableCreate,
    completion_status: str = "complete",
):
    try:
        from app.models.custom_variable import CustomVariable
        import time

        schema = build_survey_schema(survey_id, completion_status=completion_status)
        df = get_responses(survey_id, completion_status=completion_status).dataframe
        temp = CustomVariable(
            id="preview",
            survey_id=survey_id,
            created_at=time.time(),
            updated_at=time.time(),
            **body.model_dump(),
        )
        return preview_custom_variable(temp, schema, df)
    except Exception as exc:
        raise _handle_lime_error(exc) from exc


@router.get("/projects/{survey_id}/data/raw")
def raw_data_page(
    survey_id: int,
    completion_status: str = "complete",
    page: int = 1,
    page_size: int = 50,
    search: str = "",
    search_column: str = "",
    authorization: str | None = Header(default=None),
):
    try:
        username = _optional_username(authorization)
        return get_raw_data_page(
            survey_id,
            completion_status=completion_status,
            page=page,
            page_size=page_size,
            username=username,
            search=search or None,
            search_column=search_column or None,
        )
    except Exception as exc:
        raise _handle_lime_error(exc) from exc


@router.get("/projects/{survey_id}/data/raw/export")
def raw_data_export(
    survey_id: int,
    completion_status: str = "complete",
    search: str = "",
    search_column: str = "",
    authorization: str | None = Header(default=None),
):
    try:
        username = _optional_username(authorization)
        content = raw_data_to_csv(
            survey_id,
            completion_status=completion_status,
            username=username,
            search=search or None,
            search_column=search_column or None,
        )
        return StreamingResponse(
            iter([content]),
            media_type="text/csv",
            headers={"Content-Disposition": 'attachment; filename="survey_data.csv"'},
        )
    except Exception as exc:
        raise _handle_lime_error(exc) from exc


@router.post("/projects/{survey_id}/analysis/profile")
def question_profile(survey_id: int, body: ProfileRequest):
    try:
        return run_question_profile(
            survey_id,
            body.variable_id,
            completion_status=body.completion_status,
            filters=[f.model_dump() for f in body.filters] if not body.filter_tree else None,
            filter_tree=body.filter_tree,
        )
    except Exception as exc:
        raise _handle_lime_error(exc) from exc


@router.post("/projects/{survey_id}/analysis/chart")
def chart_data(survey_id: int, body: ChartRequest):
    try:
        return run_chart_data(
            survey_id,
            body.variable_id,
            completion_status=body.completion_status,
            filters=[f.model_dump() for f in body.filters] if not body.filter_tree else None,
            filter_tree=body.filter_tree,
            chart_type=body.chart_type,
            bins=body.bins,
            banner_variable_id=body.banner_variable_id,
            y_variable_id=body.y_variable_id,
            z_variable_id=body.z_variable_id,
        )
    except Exception as exc:
        raise _handle_lime_error(exc) from exc


@router.post("/projects/{survey_id}/analysis/advanced")
def advanced_analysis(survey_id: int, body: AdvancedAnalysisRequest):
    try:
        return run_advanced_analysis(
            survey_id,
            analysis_type=body.analysis_type,
            completion_status=body.completion_status,
            filters=[f.model_dump() for f in body.filters] if not body.filter_tree else None,
            filter_tree=body.filter_tree,
            variable_ids=body.variable_ids,
            dependent_id=body.dependent_id,
            independent_ids=body.independent_ids,
            group_variable_id=body.group_variable_id,
            numeric_variable_id=body.numeric_variable_id,
            method=body.method,
        )
    except Exception as exc:
        raise _handle_lime_error(exc) from exc


def _flatten_banner_layers(
    banner_variable_ids: list[str],
    banner_layers: list[list[str]],
) -> tuple[list[str], list[list[str]]]:
    layers = [layer for layer in banner_layers if layer]
    if not layers and banner_variable_ids:
        layers = [banner_variable_ids]
    flat: list[str] = []
    for layer in layers:
        for bid in layer:
            if bid not in flat:
                flat.append(bid)
    return flat, layers


@router.post("/projects/{survey_id}/analysis/banner")
def banner_analysis(survey_id: int, body: BannerRequest):
    try:
        row_ids = body.row_variable_ids or [body.row_variable_id]
        banner_ids, banner_layers = _flatten_banner_layers(
            body.banner_variable_ids,
            body.banner_layers,
        )
        return run_banner_table(
            survey_id,
            row_variable_id=body.row_variable_id,
            row_variable_ids=row_ids,
            banner_variable_ids=banner_ids,
            banner_layers=banner_layers,
            filters=[f.model_dump() for f in body.filters] if not body.filter_tree else None,
            filter_tree=body.filter_tree,
            row_filters={
                k: [f.model_dump() for f in v]
                for k, v in body.row_filters.items()
            },
            completion_status=body.completion_status,
            show_counts=body.show_counts,
            show_col_pct=body.show_col_pct,
            show_row_pct=body.show_row_pct,
            show_significance=body.show_significance,
            confidence_level=body.confidence_level,
            metric=body.metric,
        )
    except Exception as exc:
        raise _handle_lime_error(exc) from exc


@router.post("/projects/{survey_id}/analysis/banner/export")
def banner_export(survey_id: int, body: BannerRequest):
    try:
        row_ids = body.row_variable_ids or [body.row_variable_id]
        banner_ids, banner_layers = _flatten_banner_layers(
            body.banner_variable_ids,
            body.banner_layers,
        )
        result = run_banner_table(
            survey_id,
            row_variable_id=body.row_variable_id,
            row_variable_ids=row_ids,
            banner_variable_ids=banner_ids,
            banner_layers=banner_layers,
            filters=[f.model_dump() for f in body.filters] if not body.filter_tree else None,
            filter_tree=body.filter_tree,
            row_filters={
                k: [f.model_dump() for f in v]
                for k, v in body.row_filters.items()
            },
            completion_status=body.completion_status,
            show_counts=body.show_counts,
            show_col_pct=body.show_col_pct,
            show_row_pct=body.show_row_pct,
            show_significance=body.show_significance,
            confidence_level=body.confidence_level,
            metric=body.metric,
        )
        if result.get("error") and not result.get("tables"):
            raise HTTPException(status_code=400, detail=result["error"])
        content = banner_result_to_excel(result)
        return StreamingResponse(
            iter([content]),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": 'attachment; filename="crosstab.xlsx"'},
        )
    except HTTPException:
        raise
    except Exception as exc:
        raise _handle_lime_error(exc) from exc
