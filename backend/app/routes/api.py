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
from app.services.auth import VALID_USERS, authenticate, get_session, list_active_sessions, logout
from app.services.banner_analysis import run_banner_table, run_question_profile
from app.services.data_quality import run_data_quality
from app.services.excel_export import banner_result_to_excel
from app.services.question_schema import build_survey_schema

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
def data_quality(survey_id: int, completion_status: str = "complete"):
    try:
        return run_data_quality(survey_id, completion_status=completion_status)
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
