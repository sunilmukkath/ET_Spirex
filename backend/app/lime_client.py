from __future__ import annotations

import io
import threading
import time
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, TypeVar

import pandas as pd
from citric import Client
from citric.exceptions import LimeSurveyApiError

from app.config import settings
from app.services.survey_text import clean_survey_text

T = TypeVar("T")

_lime_client: Client | None = None
_lime_client_lock = threading.Lock()


class LimeSurveyError(Exception):
    pass


class LimeSurveyNotConfiguredError(LimeSurveyError):
    pass


def is_stale_session_error(exc: Exception) -> bool:
    text = str(exc).lower()
    return (
        "invalid session" in text
        or "session key" in text
        or "session expired" in text
        or (isinstance(exc, LimeSurveyApiError) and "session" in text)
    )


def invalidate_lime_client() -> None:
    global _lime_client
    with _lime_client_lock:
        _lime_client = None


def get_client(*, force_new: bool = False) -> Client:
    global _lime_client
    if not settings.is_configured:
        raise LimeSurveyNotConfiguredError(
            "LimeSurvey credentials are not configured. Copy .env.example to .env and fill in your details."
        )
    with _lime_client_lock:
        if force_new or _lime_client is None:
            _lime_client = Client(
                settings.limesurvey_url,
                settings.limesurvey_username,
                settings.limesurvey_password,
            )
        return _lime_client


def execute_lime(operation: Callable[[Client], T]) -> T:
    """Run a LimeSurvey RPC call, re-authenticating once if the session key expired."""
    last_error: Exception | None = None
    for attempt in range(2):
        try:
            client = get_client(force_new=attempt > 0)
            return operation(client)
        except Exception as exc:
            last_error = exc
            if attempt == 0 and is_stale_session_error(exc):
                invalidate_lime_client()
                continue
            raise
    assert last_error is not None
    raise last_error


def clear_client_cache() -> None:
    invalidate_lime_client()
    _survey_list_cache.clear()
    _projects_cache.clear()
    _stats_cache.clear()


_survey_list_cache: dict[str, tuple[float, dict[int, dict[str, Any]]]] = {}
_projects_cache: dict[str, tuple[float, list[dict[str, Any]]]] = {}
_stats_cache: dict[int, tuple[float, dict[str, Any]]] = {}
_SURVEY_LIST_TTL = 300
_PROJECTS_TTL = 300


def _survey_list_index() -> dict[int, dict[str, Any]]:
    """Map survey ID → list_surveys entry (includes surveyls_title)."""
    import time

    username = settings.limesurvey_filter_user or settings.limesurvey_username
    cache_key = username or ""
    now = time.time()

    if cache_key in _survey_list_cache:
        cached_at, index = _survey_list_cache[cache_key]
        if now - cached_at < _SURVEY_LIST_TTL:
            return index

    def load_surveys(client: Client) -> dict[int, dict[str, Any]]:
        surveys = client.list_surveys(username)
        return {int(s["sid"]): s for s in surveys}

    index = execute_lime(load_surveys)
    _survey_list_cache[cache_key] = (now, index)
    return index


def _survey_title(survey_id: int, props: dict[str, Any] | None = None) -> str:
    listing = _survey_list_index().get(survey_id, {})
    title = listing.get("surveyls_title")
    if title:
        return str(title)
    if props and props.get("surveyls_title"):
        return str(props["surveyls_title"])
    return "Untitled"


def _survey_status(active: str | None, expires: str | None) -> str:
    if active != "Y":
        return "inactive"
    if expires and expires not in ("", "0000-00-00 00:00:00"):
        try:
            if pd.Timestamp(expires) < pd.Timestamp.now():
                return "expired"
        except (ValueError, TypeError):
            pass
    return "active"


def _project_dashboard_sort_key(project: dict[str, Any]) -> tuple[float, int]:
    """Newest created first; fall back to survey id when creation date is missing."""
    created = _parse_timestamp(project.get("created_date"))
    if created <= 0:
        return (0.0, -int(project["id"]))
    return (-created, -int(project["id"]))


def _sort_projects_for_dashboard(projects: list[dict[str, Any]]) -> None:
    projects.sort(key=_project_dashboard_sort_key)


def _parse_timestamp(value: str | None) -> float:
    if not value or str(value).startswith("0000"):
        return 0.0
    try:
        return float(pd.Timestamp(value).timestamp())
    except (ValueError, TypeError):
        return 0.0


def _fetch_project_meta(survey_id: int) -> dict[str, Any]:
    """Fetch completed sample size and creation date for one survey."""
    cached = _stats_cache.get(survey_id)
    if cached and time.time() - cached[0] < _PROJECTS_TTL:
        return cached[1]

    def load_meta(active_client: Client) -> dict[str, Any]:
        summary = active_client.get_summary(survey_id) or {}
        datecreated = None
        try:
            props = active_client.get_survey_properties(
                survey_id, properties=["datecreated"]
            )
            datecreated = props.get("datecreated") or None
        except Exception:
            pass
        return {
            "completed": int(summary.get("completed_responses") or 0),
            "incomplete": int(summary.get("incomplete_responses") or 0),
            "total": int(summary.get("count_total") or 0),
            "datecreated": datecreated,
        }

    meta = execute_lime(load_meta)
    _stats_cache[survey_id] = (time.time(), meta)
    return meta


def fetch_projects_stats(survey_ids: list[int]) -> dict[int, dict[str, Any]]:
    """Fetch stats for a batch of surveys (cached per survey)."""
    if not survey_ids:
        return {}

    missing = [
        sid
        for sid in survey_ids
        if sid not in _stats_cache
        or time.time() - _stats_cache[sid][0] >= _PROJECTS_TTL
    ]

    if missing:
        workers = min(16, len(missing))
        with ThreadPoolExecutor(max_workers=workers) as pool:
            futures = {pool.submit(_fetch_project_meta, sid): sid for sid in missing}
            for future in as_completed(futures):
                sid = futures[future]
                try:
                    future.result()
                except Exception:
                    _stats_cache[sid] = (
                        time.time(),
                        {
                            "completed": 0,
                            "incomplete": 0,
                            "total": 0,
                            "datecreated": None,
                        },
                    )

    return {sid: _stats_cache[sid][1] for sid in survey_ids if sid in _stats_cache}


def _enrich_projects_parallel(projects: list[dict[str, Any]]) -> None:
    ids = [p["id"] for p in projects]
    stats = fetch_projects_stats(ids)
    for project in projects:
        meta = stats.get(project["id"], {})
        project["created_date"] = meta.get("datecreated")
        project["responses"] = {
            "completed": meta.get("completed", 0),
            "incomplete": meta.get("incomplete", 0),
            "total": meta.get("total", 0),
            "loaded": bool(meta),
        }


def list_projects(*, include_stats: bool = False, limit: int | None = None) -> list[dict[str, Any]]:
    username = settings.limesurvey_filter_user or settings.limesurvey_username
    cache_key = username or ""
    now = time.time()

    if not include_stats and cache_key in _projects_cache:
        cached_at, cached = _projects_cache[cache_key]
        if now - cached_at < _PROJECTS_TTL:
            projects = cached
            if limit is not None:
                return projects[: max(1, min(limit, 100))]
            return projects

    def load_projects(client: Client) -> list[dict[str, Any]]:
        surveys = client.list_surveys(username)
        projects: list[dict[str, Any]] = []
        for survey in surveys:
            sid = int(survey["sid"])
            projects.append(
                {
                    "id": sid,
                    "title": survey.get("surveyls_title", "Untitled"),
                    "language": survey.get("language", ""),
                    "owner": survey.get("owner_id", ""),
                    "status": _survey_status(
                        survey.get("active"),
                        survey.get("expires"),
                    ),
                    "active": survey.get("active") == "Y",
                    "start_date": survey.get("startdate") or None,
                    "expire_date": survey.get("expires") or None,
                    "created_date": survey.get("datecreated") or None,
                    "responses": {
                        "completed": 0,
                        "incomplete": 0,
                        "total": 0,
                        "loaded": False,
                    },
                }
            )
        return projects

    projects = execute_lime(load_projects)
    _sort_projects_for_dashboard(projects)

    if not include_stats:
        _projects_cache[cache_key] = (now, projects)

    result = projects
    if limit is not None:
        result = projects[: max(1, min(limit, 100))]

    if include_stats:
        _enrich_projects_parallel(result)

    return result


def get_project_detail(survey_id: int) -> dict[str, Any]:
    listing = _survey_list_index().get(survey_id, {})

    def load_detail(client: Client) -> dict[str, Any]:
        props = client.get_survey_properties(
            survey_id,
            properties=["active", "expires", "startdate", "language"],
        )
        summary = client.get_summary(survey_id) or {}

        active = props.get("active") or listing.get("active")
        expires = props.get("expires") if props.get("expires") is not None else listing.get("expires")
        startdate = props.get("startdate") or listing.get("startdate")

        return {
            "id": survey_id,
            "title": _survey_title(survey_id, props),
            "description": listing.get("surveyls_description") or "",
            "status": _survey_status(active, expires),
            "active": active == "Y",
            "start_date": startdate or None,
            "expire_date": expires or None,
            "language": props.get("language") or listing.get("language") or "",
            "responses": {
                "completed": int(summary.get("completed_responses") or 0),
                "incomplete": int(summary.get("incomplete_responses") or 0),
                "total": int(summary.get("count_total") or 0),
                "loaded": True,
            },
            "summary": summary,
        }

    return execute_lime(load_detail)


def get_survey_questions(survey_id: int) -> list[dict[str, Any]]:
    def load_questions(client: Client) -> list[dict[str, Any]]:
        groups = client.list_groups(survey_id)
        questions: list[dict[str, Any]] = []

        for group in groups:
            group_id = int(group["gid"])
            group_title = group.get("group_name", "")
            for q in client.list_questions(survey_id, group_id):
                questions.append(
                    {
                        "id": q.get("qid"),
                        "code": q.get("title", ""),
                        "text": clean_survey_text(str(q.get("question", "") or "")),
                        "type": q.get("type", ""),
                        "group_id": group_id,
                        "group_title": group_title,
                    }
                )
        return questions

    return execute_lime(load_questions)


def export_responses_dataframe(
    survey_id: int,
    *,
    completion_status: str = "all",
    fields: list[str] | None = None,
) -> pd.DataFrame:
    from app.services.qc_filter import normalize_export_status

    def load_export(client: Client) -> pd.DataFrame:
        raw = client.export_responses(
            survey_id,
            file_format="csv",
            completion_status=normalize_export_status(completion_status),
            fields=fields,
        )
        df = pd.read_csv(io.BytesIO(raw), delimiter=";", low_memory=False)
        df.columns = [str(c).strip() for c in df.columns]
        return df

    return execute_lime(load_export)


def get_connection_status() -> dict[str, Any]:
    if not settings.is_configured:
        return {
            "connected": False,
            "configured": False,
            "message": "LimeSurvey credentials not configured",
        }

    try:
        def check_connection(client: Client) -> dict[str, Any]:
            version = client.get_server_version()
            username = settings.limesurvey_filter_user or settings.limesurvey_username
            survey_count = len(client.list_surveys(username))
            return {
                "connected": True,
                "configured": True,
                "version": version,
                "survey_count": survey_count,
                "url": settings.limesurvey_url,
            }

        return execute_lime(check_connection)
    except Exception as exc:
        return {
            "connected": False,
            "configured": True,
            "message": str(exc),
        }
