"""ET Scout Survey Studio API — native survey programming."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Header, HTTPException

from app.models.et_survey import (
    EtCollectorSurvey,
    EtResponseSubmit,
    EtResponseSubmitResult,
    EtSurveyCreate,
    EtSurveyOut,
    EtSurveyUpdate,
)
from app.services.auth import get_session
from app.services.et_survey_responses import invalidate_et_response_cache
from app.services.et_survey_store import (
    collector_payload,
    create_et_survey,
    delete_et_survey,
    get_et_survey,
    get_et_survey_by_slug,
    list_et_surveys,
    studio_available,
    submit_response,
    update_et_survey,
)

router = APIRouter(tags=["et-surveys"])
collector_router = APIRouter(tags=["collector"])


def _extract_token(authorization: str | None) -> str | None:
    if not authorization:
        return None
    if authorization.lower().startswith("bearer "):
        return authorization[7:].strip()
    return authorization.strip()


def require_auth(authorization: str | None = Header(default=None)) -> str:
    record = get_session(_extract_token(authorization))
    if not record:
        raise HTTPException(status_code=401, detail="Not signed in")
    return record.username


def _require_studio() -> None:
    if not studio_available():
        raise HTTPException(
            status_code=503,
            detail="Survey Studio requires DATABASE_URL (Postgres) on the server.",
        )


@router.get("/studio/status")
def studio_status(_: str = Depends(require_auth)):
    return {"available": studio_available()}


@router.get("/studio/surveys")
def studio_list_surveys(_: str = Depends(require_auth)):
    _require_studio()
    return {"surveys": [s.model_dump() for s in list_et_surveys()]}


@router.post("/studio/surveys", response_model=EtSurveyOut, status_code=201)
def studio_create_survey(body: EtSurveyCreate, username: str = Depends(require_auth)):
    _require_studio()
    try:
        return create_et_survey(body, created_by=username)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.get("/studio/surveys/{workspace_id}", response_model=EtSurveyOut)
def studio_get_survey(workspace_id: int, _: str = Depends(require_auth)):
    _require_studio()
    survey = get_et_survey(workspace_id)
    if not survey:
        raise HTTPException(status_code=404, detail="Survey not found")
    return survey


@router.put("/studio/surveys/{workspace_id}", response_model=EtSurveyOut)
def studio_update_survey(
    workspace_id: int,
    body: EtSurveyUpdate,
    _: str = Depends(require_auth),
):
    _require_studio()
    survey = update_et_survey(workspace_id, body)
    if not survey:
        raise HTTPException(status_code=404, detail="Survey not found")
    return survey


@router.delete("/studio/surveys/{workspace_id}")
def studio_delete_survey(workspace_id: int, _: str = Depends(require_auth)):
    _require_studio()
    if not delete_et_survey(workspace_id):
        raise HTTPException(status_code=404, detail="Survey not found")
    return {"ok": True}


@router.post("/studio/surveys/{workspace_id}/publish", response_model=EtSurveyOut)
def studio_publish_survey(workspace_id: int, _: str = Depends(require_auth)):
    _require_studio()
    survey = update_et_survey(workspace_id, EtSurveyUpdate(status="active"))
    if not survey:
        raise HTTPException(status_code=404, detail="Survey not found")
    return survey


@collector_router.get("/collector/{slug}", response_model=EtCollectorSurvey)
def collector_get_survey(slug: str):
    _require_studio()
    survey = get_et_survey_by_slug(slug)
    if not survey:
        raise HTTPException(status_code=404, detail="Survey not found")
    if survey.status != "active":
        raise HTTPException(status_code=403, detail="This survey is not accepting responses")
    return collector_payload(survey)


@collector_router.post("/collector/{slug}/responses", response_model=EtResponseSubmitResult)
def collector_submit(slug: str, body: EtResponseSubmit):
    _require_studio()
    result = submit_response(slug, body)
    if not result:
        raise HTTPException(status_code=404, detail="Survey not found or not active")
    survey = get_et_survey_by_slug(slug)
    if survey:
        invalidate_et_response_cache(survey.workspace_id)
    return result
