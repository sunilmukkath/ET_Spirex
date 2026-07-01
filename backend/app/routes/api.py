import os
from typing import Any

from fastapi import APIRouter, File, Header, HTTPException, UploadFile
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
    list_projects_cached,
)
from app.services.et_survey_projects import et_survey_project_detail, et_surveys_as_projects
from app.services.et_survey_registry import is_et_survey
from app.models.analysis import (
    AdvancedAnalysisRequest,
    BannerRequest,
    ChartRequest,
    ProfileRequest,
    ProjectStatsRequest,
)
from app.models.pinned_surveys import PinnedSurveys
from app.models.pm import AgentDraftResponse
from app.models.project_workflow import (
    CreateTaskRequest,
    ProjectActivityCreate,
    ProjectWorkflow,
    TaskCommentCreate,
)
from app.models.team_hr import StaffMemberOut, StaffProfileUpdate, TeamDirectoryOut
from app.models.team_registry import TeamRegistry, PROJECT_MODULES
from app.models.custom_variable import CustomVariableCreate, CustomVariableSyncRequest, CustomVariableUpdate
from app.services.auth import get_session, list_active_sessions, logout
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
from app.services.questionnaire_spec import questionnaire_spec_docx, questionnaire_spec_excel
from app.services.filter_preset_store import create_filter_preset, delete_filter_preset, list_filter_presets
from app.services.analysis_bookmark_store import (
    create_analysis_bookmark,
    delete_analysis_bookmark,
    list_analysis_bookmarks,
)
from app.services.weight_config_store import get_weight_config, set_weight_config
from app.models.variable_setup import VariableSetupUpdate
from app.services.variable_setup import default_value_weights
from app.services.variable_setup_store import (
    clear_variable_setup_entry,
    get_variable_setup_config,
    set_variable_setup_entry,
)
from app.models.qc_config import QcConfig
from app.services.qc_config_store import get_qc_config, set_qc_config
from app.models.quota_config import QuotaConfig
from app.services.quota_config_store import get_quota_config, set_quota_config
from app.services.quota_check import check_quotas, quota_eligible_variables
from app.services.field_reports import interviewer_rejections_csv, qc_checks_csv, quota_completion_csv
from app.models.workspace_prefs import (
    AnalysisBookmarkCreate,
    FilterPresetCreate,
    ReportDeckExportRequest,
    ReportExportRequest,
    ReportNarrativeRequest,
    ReportSlidePlanRequest,
    ReportSectionInput,
    ReportWritingRequest,
    SlidePlanItem,
    WeightConfig,
)
from app.services.report_export import (
    DeckSection,
    banner_to_pdf,
    banner_to_pptx,
    merge_deck_pptx,
    profile_to_pdf,
    profile_to_pptx,
)
from app.services.report_agent import run_report_writing_agent
from app.services.task_manager_agent import format_last_run_for_user, run_task_manager_agent
from app.services.report_template import save_template_bytes, template_info
from app.services.ai_narrative import (
    ai_status,
    banner_context,
    generate_narrative,
    generate_slide_plan,
    probe_ai_connection,
    profile_context,
)
from app.services.raw_data import get_raw_data_page, raw_data_to_csv
from app.services.response_store import get_responses
from app.services.project_workflow_store import (
    add_manual_activity,
    add_task_comment,
    assign_unassigned_task,
    can_access_module,
    can_manage_project_team,
    create_manual_task,
    get_project_workflow,
    list_my_tasks,
    list_unassigned_tasks,
    list_team_assigned_tasks,
    set_project_workflow,
    workflow_access_summary,
)
from app.models.task_manager import TaskAssignRequest, TaskManagerAgentRequest, TaskManagerAgentResponse
from app.models.qual_asset import QualAssetCreate, QualAssetUpdate, QualSummaryRequest
from app.services.team_preset_store import (
    apply_team_preset,
    create_team_preset,
    delete_team_preset,
    list_team_presets,
)
from app.services.qual_store import (
    create_qual_asset,
    delete_qual_asset,
    get_qual_asset,
    list_qual_assets,
    search_qual_assets,
    update_qual_asset,
)
from app.services.qual_analysis import generate_qual_summary
from app.services.pinned_survey_store import get_pinned_survey_ids, set_pinned_survey_ids
from app.services.user_preferences_store import get_user_preferences, set_user_preferences
from app.models.user_preferences import UserPreferences, UserPreferencesUpdate
from app.services.team_registry_store import (
    get_global_role,
    get_team_registry,
    get_user_modules,
    is_global_admin,
    is_global_manager_or_above,
    set_team_registry,
)
from app.services.team_hr_store import (
    get_staff_member,
    get_team_directory,
    update_staff_profile,
)
from app.services.super_admin import all_super_admins, is_super_admin, super_admin_email, super_admin_username, email_for_username

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
    commit = (
        os.environ.get("RAILWAY_GIT_COMMIT_SHA")
        or os.environ.get("RENDER_GIT_COMMIT")
        or os.environ.get("GIT_COMMIT")
    )
    return {
        "status": "ok",
        "git_commit": commit,
        "features": {
            "pinned_surveys": True,
            "user_preferences": True,
            "project_requirements": True,
            "project_workflow": True,
            "crosstabs_total_only": True,
        },
    }


@router.get("/auth/users")
def auth_users():
    return {"users": []}


@router.post("/auth/login")
def auth_login():
    raise HTTPException(status_code=410, detail="Password sign-in has been disabled. Use Google sign-in.")


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
    return {
        "username": record.username,
        "login_at": record.login_at,
        "role": get_global_role(record.username),
        "email": email_for_username(record.username) or (super_admin_email() if is_super_admin(record.username) else None),
        "is_super_admin": is_super_admin(record.username),
        "modules": get_user_modules(record.username),
    }


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


@router.get("/me/pinned-surveys")
def pinned_surveys_get(authorization: str | None = Header(default=None)):
    record = get_session(_extract_token(authorization))
    if not record:
        raise HTTPException(status_code=401, detail="Not signed in")
    return {"survey_ids": get_pinned_survey_ids(record.username)}


@router.put("/me/pinned-surveys")
def pinned_surveys_update(
    body: PinnedSurveys,
    authorization: str | None = Header(default=None),
):
    record = get_session(_extract_token(authorization))
    if not record:
        raise HTTPException(status_code=401, detail="Not signed in")
    saved = set_pinned_survey_ids(record.username, body.survey_ids)
    return {"survey_ids": saved}


@router.get("/me/preferences", response_model=UserPreferences)
def user_preferences_get(authorization: str | None = Header(default=None)):
    record = get_session(_extract_token(authorization))
    if not record:
        raise HTTPException(status_code=401, detail="Not signed in")
    return get_user_preferences(record.username)


@router.put("/me/preferences", response_model=UserPreferences)
def user_preferences_update(
    body: UserPreferencesUpdate,
    authorization: str | None = Header(default=None),
):
    record = get_session(_extract_token(authorization))
    if not record:
        raise HTTPException(status_code=401, detail="Not signed in")
    return set_user_preferences(record.username, body)


@router.get("/team/registry")
def team_registry(authorization: str | None = Header(default=None)):
    record = get_session(_extract_token(authorization))
    if not record:
        raise HTTPException(status_code=401, detail="Not signed in")
    reg = get_team_registry()
    return {
        **reg.model_dump(),
        "primary_super_admin": super_admin_username(),
        "super_admins": all_super_admins(),
    }


@router.put("/team/registry")
def team_registry_update(
    body: TeamRegistry,
    authorization: str | None = Header(default=None),
):
    record = get_session(_extract_token(authorization))
    if not record:
        raise HTTPException(status_code=401, detail="Not signed in")
    if not is_super_admin(record.username):
        raise HTTPException(status_code=403, detail="Only super admins can update team roles and module access")
    return set_team_registry(body)


@router.get("/team/directory", response_model=TeamDirectoryOut)
def team_directory(authorization: str | None = Header(default=None)):
    record = get_session(_extract_token(authorization))
    if not record:
        raise HTTPException(status_code=401, detail="Not signed in")
    return get_team_directory()


@router.get("/team/staff/{username}", response_model=StaffMemberOut)
def team_staff_member(username: str, authorization: str | None = Header(default=None)):
    record = get_session(_extract_token(authorization))
    if not record:
        raise HTTPException(status_code=401, detail="Not signed in")
    member = get_staff_member(username)
    if not member:
        raise HTTPException(status_code=404, detail="Team member not found")
    return member


@router.put("/team/staff/{username}", response_model=StaffMemberOut)
def team_staff_update(
    username: str,
    body: StaffProfileUpdate,
    authorization: str | None = Header(default=None),
):
    record = get_session(_extract_token(authorization))
    if not record:
        raise HTTPException(status_code=401, detail="Not signed in")
    if not is_global_manager_or_above(record.username):
        raise HTTPException(status_code=403, detail="Only managers and admins can update staff profiles")
    updated = update_staff_profile(username, body)
    if not updated:
        raise HTTPException(status_code=404, detail="Team member not found")
    member = get_staff_member(username)
    if not member:
        raise HTTPException(status_code=404, detail="Team member not found")
    return member


@router.get("/projects/{survey_id}/workflow")
def project_workflow_get(
    survey_id: int,
    authorization: str | None = Header(default=None),
):
    from app.services.task_pm_resolve import resolve_pm_project_id_for_survey

    record = get_session(_extract_token(authorization))
    if not record:
        raise HTTPException(status_code=401, detail="Not signed in")
    workflow = get_project_workflow(survey_id)
    project_id = resolve_pm_project_id_for_survey(survey_id)
    return {
        "workflow": workflow,
        "access": workflow_access_summary(record.username, survey_id),
        "modules": list(PROJECT_MODULES),
        "project_id": project_id,
    }


@router.put("/projects/{survey_id}/workflow")
def project_workflow_update(
    survey_id: int,
    body: ProjectWorkflow,
    authorization: str | None = Header(default=None),
):
    record = get_session(_extract_token(authorization))
    if not record:
        raise HTTPException(status_code=401, detail="Not signed in")
    if not can_manage_project_team(record.username, survey_id):
        raise HTTPException(status_code=403, detail="You do not have permission to edit project workflow")
    saved = set_project_workflow(survey_id, body, editor=record.username)
    return {
        "workflow": saved,
        "access": workflow_access_summary(record.username, survey_id),
    }


@router.post("/projects/{survey_id}/workflow/activities")
def project_workflow_add_activity(
    survey_id: int,
    body: ProjectActivityCreate,
    authorization: str | None = Header(default=None),
):
    record = get_session(_extract_token(authorization))
    if not record:
        raise HTTPException(status_code=401, detail="Not signed in")
    message = (body.message or "").strip()
    if not message:
        raise HTTPException(status_code=400, detail="Message required")
    if not can_manage_project_team(record.username, survey_id):
        raise HTTPException(status_code=403, detail="You do not have permission to post project updates")
    saved = add_manual_activity(survey_id, actor=record.username, message=message)
    return {
        "workflow": saved,
        "access": workflow_access_summary(record.username, survey_id),
    }


@router.post("/projects/{survey_id}/workflow/tasks/{task_id}/comments")
def project_workflow_add_task_comment(
    survey_id: int,
    task_id: str,
    body: TaskCommentCreate,
    authorization: str | None = Header(default=None),
):
    record = get_session(_extract_token(authorization))
    if not record:
        raise HTTPException(status_code=401, detail="Not signed in")
    workflow = get_project_workflow(survey_id)
    if not workflow.members and not can_manage_project_team(record.username, survey_id):
        raise HTTPException(status_code=403, detail="Not a project member")
    is_member = any(m.username == record.username for m in workflow.members)
    if not is_member and not can_manage_project_team(record.username, survey_id):
        raise HTTPException(status_code=403, detail="Not a project member")
    try:
        saved = add_task_comment(
            survey_id,
            task_id,
            author=record.username,
            body=body.body,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {
        "workflow": saved,
        "access": workflow_access_summary(record.username, survey_id),
    }


@router.get("/me/tasks")
def my_tasks_route(authorization: str | None = Header(default=None)):
    record = get_session(_extract_token(authorization))
    if not record:
        raise HTTPException(status_code=401, detail="Not signed in")
    rows = list_my_tasks(record.username)
    return {"tasks": _format_task_rows(rows), "count": len(rows)}


@router.post("/me/tasks")
def create_task_route(body: CreateTaskRequest, authorization: str | None = Header(default=None)):
    record = get_session(_extract_token(authorization))
    if not record:
        raise HTTPException(status_code=401, detail="Not signed in")
    try:
        row = create_manual_task(record.username, body.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"task": _format_task_rows([row])[0]}


@router.get("/tasks/unassigned")
def unassigned_tasks_route(authorization: str | None = Header(default=None)):
    record = get_session(_extract_token(authorization))
    if not record:
        raise HTTPException(status_code=401, detail="Not signed in")
    rows = list_unassigned_tasks()
    return {"tasks": _format_task_rows(rows), "count": len(rows)}


@router.get("/tasks/assigned")
def team_assigned_tasks_route(authorization: str | None = Header(default=None)):
    record = get_session(_extract_token(authorization))
    if not record:
        raise HTTPException(status_code=401, detail="Not signed in")
    rows = list_team_assigned_tasks(record.username)
    return {"tasks": _format_task_rows(rows), "count": len(rows)}


@router.post("/agents/task-manager", response_model=TaskManagerAgentResponse)
def task_manager_agent_route(
    body: TaskManagerAgentRequest,
    authorization: str | None = Header(default=None),
):
    record = get_session(_extract_token(authorization))
    if not record:
        raise HTTPException(status_code=401, detail="Not signed in")
    scope = body.username or record.username
    return run_task_manager_agent(apply=body.apply, username=scope, triggered_by=record.username)


@router.get("/agents/task-manager/last-run", response_model=TaskManagerAgentResponse | None)
def task_manager_last_run_route(authorization: str | None = Header(default=None)):
    record = get_session(_extract_token(authorization))
    if not record:
        raise HTTPException(status_code=401, detail="Not signed in")
    return format_last_run_for_user(record.username)


@router.post("/tasks/{task_id}/assign")
def assign_task_route(
    task_id: str,
    body: TaskAssignRequest,
    authorization: str | None = Header(default=None),
):
    record = get_session(_extract_token(authorization))
    if not record:
        raise HTTPException(status_code=401, detail="Not signed in")
    try:
        row = assign_unassigned_task(task_id, body.assignee, editor=record.username)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"task": _format_task_rows([row])[0]}


def _format_task_rows(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    tasks = []
    for row in rows:
        task = row["task"]
        if row.get("personal") or row.get("survey_id") is None:
            tasks.append(
                {
                    "survey_id": None,
                    "survey_title": "General activity",
                    "phase": None,
                    "client_name": "",
                    "project_code": "",
                    "personal": True,
                    "task": task,
                }
            )
            continue
        sid = int(row["survey_id"])
        client = str(row.get("client_name") or "").strip()
        code = str(row.get("project_code") or "").strip()
        if client and code:
            survey_title = f"{client} — {code}"
        elif client:
            survey_title = client
        elif code:
            survey_title = code
        else:
            survey_title = f"Survey {sid}"
        tasks.append(
            {
                "survey_id": sid,
                "project_id": row.get("project_id"),
                "survey_title": survey_title,
                "phase": row.get("phase"),
                "client_name": client,
                "project_code": code,
                "personal": False,
                "task": task,
            }
        )
    return tasks


@router.get("/connection")
def connection():
    return get_connection_status()


@router.get("/projects")
def projects(limit: int | None = None, include_stats: bool = False, cached_only: bool = False):
    et_projects = et_surveys_as_projects()
    try:
        if cached_only:
            cached = list_projects_cached(limit=limit)
            lime_projects = cached or []
            merged = _merge_project_lists(et_projects, lime_projects)
            return {"projects": merged, "from_cache": cached is not None}
        lime_projects = list_projects(include_stats=include_stats, limit=limit)
        merged = _merge_project_lists(et_projects, lime_projects)
        return {"projects": merged}
    except Exception as exc:
        if et_projects:
            return {"projects": et_projects, "lime_error": str(exc)}
        raise _handle_lime_error(exc) from exc


def _merge_project_lists(et_projects: list, lime_projects: list) -> list:
    combined = [*et_projects, *lime_projects]
    combined.sort(
        key=lambda p: (
            -(p.get("responses") or {}).get("total", 0),
            str(p.get("title") or "").lower(),
        )
    )
    return combined


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
    if is_et_survey(survey_id):
        detail = et_survey_project_detail(survey_id)
        if not detail:
            raise HTTPException(status_code=404, detail="Survey not found")
        return detail
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


@router.get("/projects/{survey_id}/questionnaire/export")
def export_questionnaire_spec(
    survey_id: int,
    format: str = "xlsx",
    authorization: str | None = Header(default=None),
):
    _optional_username(authorization)
    fmt = (format or "xlsx").lower()
    try:
        schema = build_survey_schema(survey_id, enrich_only=True)
        from app.lime_client import survey_title

        title = survey_title(survey_id)
        if fmt in ("xlsx", "excel"):
            data = questionnaire_spec_excel(schema, title=title)
            media = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            ext = "xlsx"
        elif fmt in ("docx", "word"):
            data = questionnaire_spec_docx(schema, title=title)
            media = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            ext = "docx"
        else:
            raise HTTPException(status_code=400, detail="format must be xlsx or docx")
    except HTTPException:
        raise
    except Exception as exc:
        raise _handle_lime_error(exc) from exc

    safe = title.replace('"', "").replace("/", "-")[:40]
    return StreamingResponse(
        iter([data]),
        media_type=media,
        headers={"Content-Disposition": f'attachment; filename="{safe}_questionnaire.{ext}"'},
    )


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
        if refresh:
            from app.services.qc_filter import invalidate_flagged_cache

            invalidate_flagged_cache(survey_id)
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


_PRESET_MODULE: dict[str, str] = {
    "banner": "analysis",
    "filter": "analysis",
    "quota": "field",
    "qc": "qc",
}


def _require_preset_access(username: str | None, survey_id: int, kind: str) -> None:
    module = _PRESET_MODULE.get(kind.strip().lower())
    if not module:
        raise HTTPException(status_code=400, detail="Invalid preset kind")
    if can_manage_project_team(username, survey_id):
        return
    if not can_access_module(username, survey_id, module):
        raise HTTPException(status_code=403, detail="No access to save team presets for this module")


@router.get("/projects/{survey_id}/team-presets")
def get_team_presets(
    survey_id: int,
    kind: str | None = None,
    authorization: str | None = Header(default=None),
):
    _optional_username(authorization)
    return {"presets": [p.model_dump() for p in list_team_presets(survey_id, kind=kind)]}


@router.post("/projects/{survey_id}/team-presets")
def post_team_preset(
    survey_id: int,
    body: TeamPresetCreate,
    authorization: str | None = Header(default=None),
):
    username = _optional_username(authorization)
    _require_preset_access(username, survey_id, body.kind)
    try:
        preset = create_team_preset(survey_id, body, username=username)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return preset.model_dump()


@router.delete("/projects/{survey_id}/team-presets/{preset_id}")
def remove_team_preset(
    survey_id: int,
    preset_id: str,
    authorization: str | None = Header(default=None),
):
    username = _optional_username(authorization)
    presets = list_team_presets(survey_id)
    match = next((p for p in presets if p.id == preset_id), None)
    if not match:
        raise HTTPException(status_code=404, detail="Preset not found")
    _require_preset_access(username, survey_id, match.kind)
    ok = delete_team_preset(survey_id, preset_id)
    if not ok:
        raise HTTPException(status_code=404, detail="Preset not found")
    return {"ok": True}


@router.post("/projects/{survey_id}/team-presets/{preset_id}/apply")
def apply_team_preset_route(
    survey_id: int,
    preset_id: str,
    authorization: str | None = Header(default=None),
):
    username = _optional_username(authorization)
    presets = list_team_presets(survey_id)
    match = next((p for p in presets if p.id == preset_id), None)
    if not match:
        raise HTTPException(status_code=404, detail="Preset not found")
    _require_preset_access(username, survey_id, match.kind)
    try:
        preset = apply_team_preset(survey_id, preset_id)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return preset.model_dump()


def _require_qual_access(username: str | None, survey_id: int) -> str:
    if not username:
        raise HTTPException(status_code=401, detail="Unauthorized")
    if can_manage_project_team(username, survey_id):
        return username
    workflow = get_project_workflow(survey_id)
    if any(m.username == username for m in workflow.members):
        return username
    if can_access_module(username, survey_id, "research"):
        return username
    raise HTTPException(status_code=403, detail="No access to qual library")


@router.get("/projects/{survey_id}/qual/assets")
def get_qual_assets(
    survey_id: int,
    authorization: str | None = Header(default=None),
):
    _require_qual_access(_optional_username(authorization), survey_id)
    assets = list_qual_assets(survey_id)
    return {"assets": [a.model_dump() for a in assets]}


@router.post("/projects/{survey_id}/qual/assets")
def post_qual_asset(
    survey_id: int,
    body: QualAssetCreate,
    authorization: str | None = Header(default=None),
):
    username = _require_qual_access(_optional_username(authorization), survey_id)
    try:
        asset = create_qual_asset(survey_id, body, username=username)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return asset.model_dump()


@router.put("/projects/{survey_id}/qual/assets/{asset_id}")
def put_qual_asset(
    survey_id: int,
    asset_id: str,
    body: QualAssetUpdate,
    authorization: str | None = Header(default=None),
):
    _require_qual_access(_optional_username(authorization), survey_id)
    updated = update_qual_asset(survey_id, asset_id, body)
    if not updated:
        raise HTTPException(status_code=404, detail="Qual asset not found")
    return updated.model_dump()


@router.delete("/projects/{survey_id}/qual/assets/{asset_id}")
def remove_qual_asset(
    survey_id: int,
    asset_id: str,
    authorization: str | None = Header(default=None),
):
    _require_qual_access(_optional_username(authorization), survey_id)
    if not delete_qual_asset(survey_id, asset_id):
        raise HTTPException(status_code=404, detail="Qual asset not found")
    return {"ok": True}


@router.get("/projects/{survey_id}/qual/search")
def qual_search(
    survey_id: int,
    q: str = "",
    authorization: str | None = Header(default=None),
):
    _require_qual_access(_optional_username(authorization), survey_id)
    hits = search_qual_assets(survey_id, q)
    return {"hits": [h.model_dump() for h in hits], "query": q}


@router.post("/projects/{survey_id}/qual/summary")
def qual_summary(
    survey_id: int,
    body: QualSummaryRequest,
    authorization: str | None = Header(default=None),
):
    _require_qual_access(_optional_username(authorization), survey_id)
    assets = list_qual_assets(survey_id)
    if body.asset_ids:
        allowed = {a.id for a in assets}
        assets = [a for a in assets if a.id in body.asset_ids and a.id in allowed]
    result = generate_qual_summary(assets, focus=body.focus)
    return result


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


@router.get("/projects/{survey_id}/variable-setup")
def get_survey_variable_setup(
    survey_id: int,
    authorization: str | None = Header(default=None),
):
    _optional_username(authorization)
    config = get_variable_setup_config(survey_id)
    return config.model_dump()


@router.put("/projects/{survey_id}/variables/{variable_id}/setup")
def put_variable_setup(
    survey_id: int,
    variable_id: str,
    body: VariableSetupUpdate,
    authorization: str | None = Header(default=None),
):
    _optional_username(authorization)
    entry = set_variable_setup_entry(survey_id, variable_id, body)
    return {**entry.model_dump(), "saved": True, "variable_id": variable_id}


@router.delete("/projects/{survey_id}/variables/{variable_id}/setup")
def delete_variable_setup(
    survey_id: int,
    variable_id: str,
    authorization: str | None = Header(default=None),
):
    _optional_username(authorization)
    clear_variable_setup_entry(survey_id, variable_id)
    return {"ok": True, "variable_id": variable_id}


@router.get("/projects/{survey_id}/variables/{variable_id}/setup/defaults")
def get_variable_setup_defaults(
    survey_id: int,
    variable_id: str,
    authorization: str | None = Header(default=None),
):
    _optional_username(authorization)
    schema = build_survey_schema(survey_id, light=False)
    var = next((v for v in schema.get("variables") or [] if v.get("id") == variable_id), None)
    if not var:
        raise HTTPException(status_code=404, detail="Variable not found")
    return {"value_weights": default_value_weights(var)}


@router.get("/ai/status")
def get_ai_status(authorization: str | None = Header(default=None)):
    _optional_username(authorization)
    return ai_status()


@router.get("/ai/health")
def get_ai_health(authorization: str | None = Header(default=None)):
    _optional_username(authorization)
    return probe_ai_connection()


@router.get("/settings/report-template")
def get_report_template(authorization: str | None = Header(default=None)):
    _optional_username(authorization)
    return template_info()


@router.post("/settings/report-template")
async def upload_report_template(
    file: UploadFile = File(...),
    authorization: str | None = Header(default=None),
):
    record = get_session(_extract_token(authorization))
    if not record:
        raise HTTPException(status_code=401, detail="Not signed in")
    if not is_global_admin(record.username):
        raise HTTPException(status_code=403, detail="Only admins can upload report templates")
    data = await file.read()
    try:
        save_template_bytes(data)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return template_info()


@router.post("/projects/{survey_id}/analysis/topline-agent", response_model=AgentDraftResponse)
def topline_writing_agent(
    survey_id: int,
    body: ReportWritingRequest,
    authorization: str | None = Header(default=None),
):
    _optional_username(authorization)
    if not body.sections:
        raise HTTPException(status_code=400, detail="At least one section required")
    return run_topline_agent(
        survey_id,
        body.sections,
        deck_title=body.deck_title,
        client_context=body.client_context,
    )


@router.post("/projects/{survey_id}/analysis/report-narrative")
def preview_report_narrative(
    survey_id: int,
    body: ReportNarrativeRequest,
    authorization: str | None = Header(default=None),
):
    _optional_username(authorization)
    if not ai_status()["configured"]:
        raise HTTPException(
            status_code=503,
            detail="AI not configured. Set ANTHROPIC_API_KEY or Azure OpenAI env vars on the server.",
        )
    try:
        if body.report_type == "banner" and body.banner_request:
            result = run_banner_table(survey_id, **body.banner_request)
            ctx = banner_context(result)
        elif body.variable_id:
            result = run_question_profile(
                survey_id,
                body.variable_id,
                completion_status=body.completion_status,
                filters=[f for f in body.filters] if not body.filter_tree else None,
                filter_tree=body.filter_tree,
            )
            ctx = profile_context(result)
        else:
            raise HTTPException(status_code=400, detail="variable_id or banner_request required")
        narrative = generate_narrative(ctx)
        if not narrative:
            raise HTTPException(status_code=503, detail="AI narrative unavailable")
        return {"narrative": narrative, "context_type": ctx.get("type")}
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"AI narrative failed: {exc}") from exc


@router.post("/projects/{survey_id}/analysis/report")
def export_analysis_report(
    survey_id: int,
    body: ReportExportRequest,
    authorization: str | None = Header(default=None),
):
    _optional_username(authorization)
    if body.ai_narrative and not ai_status()["configured"]:
        raise HTTPException(
            status_code=503,
            detail="AI not configured. Set ANTHROPIC_API_KEY or Azure OpenAI env vars on the server.",
        )
    title = f"Survey {survey_id} report"
    fmt = (body.format or "pdf").lower()
    narrative: str | None = None
    if body.report_type == "banner" and body.banner_request:
        result = run_banner_table(survey_id, **body.banner_request)
        if body.ai_narrative:
            try:
                narrative = generate_narrative(banner_context(result))
            except Exception as exc:
                raise HTTPException(status_code=502, detail=f"AI narrative failed: {exc}") from exc
        data = (
            banner_to_pdf(result, title, narrative=narrative)
            if fmt == "pdf"
            else banner_to_pptx(result, title, narrative=narrative)
        )
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
        if body.ai_narrative:
            try:
                narrative = generate_narrative(profile_context(result))
            except Exception as exc:
                raise HTTPException(status_code=502, detail=f"AI narrative failed: {exc}") from exc
        data = (
            profile_to_pdf(result, title, narrative=narrative)
            if fmt == "pdf"
            else profile_to_pptx(result, title, narrative=narrative)
        )
        media = "application/pdf" if fmt == "pdf" else "application/vnd.openxmlformats-officedocument.presentationml.presentation"
        ext = "pdf" if fmt == "pdf" else "pptx"
    else:
        raise HTTPException(status_code=400, detail="variable_id or banner_request required")

    return StreamingResponse(
        iter([data]),
        media_type=media,
        headers={"Content-Disposition": f'attachment; filename="report.{ext}"'},
    )


def _run_report_section(survey_id: int, section: ReportSectionInput) -> tuple[str, dict[str, Any]]:
    if section.report_type == "banner" and section.banner_request:
        result = run_banner_table(survey_id, **section.banner_request)
        return "banner", result
    if section.variable_id:
        result = run_question_profile(
            survey_id,
            section.variable_id,
            completion_status=section.completion_status,
            filters=[f for f in section.filters] if not section.filter_tree else None,
            filter_tree=section.filter_tree,
        )
        return "profile", result
    raise HTTPException(status_code=400, detail=f"Section {section.section_id} is not configured")


def _section_ai_context(kind: str, result: dict[str, Any], section: ReportSectionInput) -> dict[str, Any]:
    ctx = banner_context(result) if kind == "banner" else profile_context(result)
    ctx["section_id"] = section.section_id
    ctx["label"] = section.label
    return ctx


@router.post("/projects/{survey_id}/analysis/report-slide-plan")
def preview_report_slide_plan(
    survey_id: int,
    body: ReportSlidePlanRequest,
    authorization: str | None = Header(default=None),
):
    _optional_username(authorization)
    if not ai_status()["configured"]:
        raise HTTPException(
            status_code=503,
            detail="AI not configured. Set ANTHROPIC_API_KEY or Azure OpenAI env vars on the server.",
        )
    if not body.sections:
        raise HTTPException(status_code=400, detail="At least one section required")

    contexts: list[dict[str, Any]] = []
    for section in body.sections:
        try:
            kind, result = _run_report_section(survey_id, section)
            contexts.append(_section_ai_context(kind, result, section))
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(
                status_code=502,
                detail=f"Failed to load section {section.label}: {exc}",
            ) from exc

    try:
        slides = generate_slide_plan(contexts)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"AI slide plan failed: {exc}") from exc

    return {"slides": slides, "deck_title": body.deck_title or f"Survey {survey_id}"}


@router.post("/projects/{survey_id}/analysis/report-writing-agent", response_model=AgentDraftResponse)
def report_writing_agent(
    survey_id: int,
    body: ReportWritingRequest,
    authorization: str | None = Header(default=None),
):
    _optional_username(authorization)
    if not body.sections:
        raise HTTPException(status_code=400, detail="At least one section required")
    return run_report_writing_agent(
        survey_id,
        body.sections,
        deck_title=body.deck_title,
        client_context=body.client_context,
    )


@router.post("/projects/{survey_id}/analysis/report-deck")
def export_report_deck(
    survey_id: int,
    body: ReportDeckExportRequest,
    authorization: str | None = Header(default=None),
):
    _optional_username(authorization)
    if not body.sections:
        raise HTTPException(status_code=400, detail="At least one section required")
    fmt = (body.format or "pptx").lower()
    if fmt != "pptx":
        raise HTTPException(status_code=400, detail="Merged deck export supports PowerPoint only")

    plan_by_id = {p.section_id: p for p in body.slide_plan}
    deck_sections: list[DeckSection] = []

    for section in body.sections:
        kind, result = _run_report_section(survey_id, section)
        plan = plan_by_id.get(section.section_id)
        bullets: list[str] | None = None
        narrative: str | None = None
        speaker_notes = ""
        slide_title = section.label

        if plan:
            slide_title = plan.title or section.label
            bullets = plan.bullets
            speaker_notes = plan.speaker_notes or ""
        elif body.ai_narrative:
            if not ai_status()["configured"]:
                raise HTTPException(status_code=503, detail="AI not configured")
            try:
                narrative = generate_narrative(_section_ai_context(kind, result, section))
            except Exception as exc:
                raise HTTPException(status_code=502, detail=f"AI narrative failed: {exc}") from exc

        chart_png = None
        if body.include_charts and kind == "profile":
            from app.services.chart_image import profile_distribution_png

            chart_png = profile_distribution_png(result)

        deck_sections.append(
            DeckSection(
                section_id=section.section_id,
                title=slide_title,
                kind=kind,
                result=result,
                bullets=bullets,
                narrative=narrative,
                chart_png=chart_png,
                speaker_notes=speaker_notes,
            )
        )

    deck_title = body.deck_title or f"Survey {survey_id} — Research findings"
    data = merge_deck_pptx(deck_sections, deck_title=deck_title)
    safe_name = deck_title.replace('"', "").replace("/", "-")[:60]
    return StreamingResponse(
        iter([data]),
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        headers={"Content-Disposition": f'attachment; filename="{safe_name}.pptx"'},
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
            show_base_row=body.show_base_row,
            summary_stats=body.summary_stats,
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
            show_base_row=body.show_base_row,
            summary_stats=body.summary_stats,
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
