from fastapi import APIRouter, Header, HTTPException
from fastapi.responses import StreamingResponse

from app.lime_client import (
    LimeSurveyError,
    LimeSurveyNotConfiguredError,
    fetch_projects_stats,
    get_connection_status,
    get_project_detail,
    get_survey_questions,
    list_projects,
)
from app.models.analysis import BannerRequest, ProfileRequest, ProjectStatsRequest
from app.models.auth import LoginRequest, LoginResponse
from app.models.custom_variable import CustomVariableCreate, CustomVariableSyncRequest, CustomVariableUpdate
from app.services.auth import VALID_USERS, authenticate, get_session, list_active_sessions, logout
from app.services.banner_analysis import run_banner_table, run_question_profile, get_filter_options
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
from app.services.raw_data import get_raw_data_page, raw_data_to_csv
from app.services.response_store import get_responses

router = APIRouter(prefix="/api")


def _handle_lime_error(exc: Exception) -> HTTPException:
    if isinstance(exc, LimeSurveyNotConfiguredError):
        return HTTPException(status_code=503, detail=str(exc))
    if isinstance(exc, LimeSurveyError):
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
def projects():
    try:
        return {"projects": list_projects(include_stats=False)}
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
            filters=[f.model_dump() for f in body.filters],
        )
    except Exception as exc:
        raise _handle_lime_error(exc) from exc


@router.post("/projects/{survey_id}/analysis/banner")
def banner_analysis(survey_id: int, body: BannerRequest):
    try:
        row_ids = body.row_variable_ids or [body.row_variable_id]
        return run_banner_table(
            survey_id,
            row_variable_id=body.row_variable_id,
            row_variable_ids=row_ids,
            banner_variable_ids=body.banner_variable_ids,
            filters=[f.model_dump() for f in body.filters],
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
        result = run_banner_table(
            survey_id,
            row_variable_id=body.row_variable_id,
            row_variable_ids=row_ids,
            banner_variable_ids=body.banner_variable_ids,
            filters=[f.model_dump() for f in body.filters],
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
