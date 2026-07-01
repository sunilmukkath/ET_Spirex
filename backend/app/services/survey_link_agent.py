"""Agent to match unlinked LimeSurvey / ET studies to PM projects."""

from __future__ import annotations

import json
import re
from difflib import SequenceMatcher
from typing import Any, Literal
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.pm import SurveyLinkAgentResponse, SurveyLinkSuggestion
from app.services import pm_ops_store
from app.services.ai_narrative import ai_status, complete_custom
from app.services.pm_import import _load_lime_surveys, _survey_indexes

Confidence = Literal["high", "medium", "low"]

_STOPWORDS = {
    "the",
    "a",
    "an",
    "and",
    "or",
    "for",
    "of",
    "in",
    "on",
    "to",
    "wave",
    "study",
    "survey",
    "tracker",
    "project",
    "research",
    "et",
    "ls",
}


def _tokens(text: str) -> set[str]:
    parts = re.findall(r"[a-z0-9]+", (text or "").lower())
    return {p for p in parts if len(p) > 1 and p not in _STOPWORDS}


def _ratio(a: str, b: str) -> float:
    if not a or not b:
        return 0.0
    return SequenceMatcher(None, a.lower(), b.lower()).ratio()


def _load_all_surveys() -> list[dict[str, Any]]:
    surveys = list(_load_lime_surveys())
    try:
        from app.services.et_survey_projects import et_surveys_as_projects

        seen = {int(s.get("id")) for s in surveys if s.get("id") is not None}
        for row in et_surveys_as_projects():
            sid = row.get("id")
            if sid is None:
                continue
            iid = int(sid)
            if iid not in seen:
                surveys.append(
                    {
                        "id": iid,
                        "title": row.get("title") or row.get("name") or f"ET Survey {iid}",
                        "provider": "et",
                    }
                )
                seen.add(iid)
    except Exception:
        pass
    return surveys


def _heuristic_score(
    project_name: str,
    client_name: str | None,
    survey_title: str,
) -> tuple[Confidence | None, str]:
    pn = project_name.strip()
    st = survey_title.strip()
    if not pn or not st:
        return None, ""

    pn_l, st_l = pn.lower(), st.lower()
    if pn_l == st_l:
        return "high", "Project name matches survey title exactly"

    if pn_l in st_l or st_l in pn_l:
        return "high", "Project name and survey title overlap strongly"

    client = (client_name or "").strip()
    if client and client.lower() in st_l:
        overlap = _tokens(pn) & _tokens(st)
        if overlap:
            return "medium", f"Client '{client}' and shared keywords ({', '.join(sorted(overlap)[:4])})"

    tok_p, tok_s = _tokens(pn), _tokens(st)
    if tok_p and tok_s:
        shared = tok_p & tok_s
        if len(shared) >= 2:
            return "medium", f"Shared keywords: {', '.join(sorted(shared)[:5])}"
        if len(shared) == 1 and _ratio(pn, st) >= 0.55:
            return "medium", f"Similar title with keyword '{next(iter(shared))}'"

    if _ratio(pn, st) >= 0.82:
        return "medium", "High string similarity between names"

    if _ratio(pn, st) >= 0.65:
        return "low", "Moderate string similarity — review manually"

    return None, ""


def _heuristic_suggestions(
    projects: list[dict[str, Any]],
    surveys: list[dict[str, Any]],
) -> list[SurveyLinkSuggestion]:
    by_id, by_title = _survey_indexes(surveys)
    suggestions: list[SurveyLinkSuggestion] = []
    used_surveys: set[int] = set()

    for project in projects:
        pid = project["project_id"]
        pname = project["project_name"]
        client = project.get("client_name")

        norm = pname.strip().lower()
        if norm in by_title and len(by_title[norm]) == 1:
            sid = by_title[norm][0]
            if sid not in used_surveys:
                suggestions.append(
                    SurveyLinkSuggestion(
                        project_id=pid,
                        project_name=pname,
                        client_name=client,
                        limesurvey_survey_id=sid,
                        survey_title=by_id.get(sid, ""),
                        confidence="high",
                        reason="Exact survey title match",
                    )
                )
                used_surveys.add(sid)
                continue

        best: tuple[int, int, Confidence, str] | None = None
        for sid, title in by_id.items():
            if sid in used_surveys:
                continue
            conf, reason = _heuristic_score(pname, client, title)
            if not conf:
                continue
            rank = {"high": 3, "medium": 2, "low": 1}[conf]
            if best is None or rank > best[0] or (
                rank == best[0] and _ratio(pname, title) > _ratio(pname, by_id.get(best[1], ""))
            ):
                best = (rank, sid, conf, reason)

        if best:
            _, sid, conf, reason = best
            suggestions.append(
                SurveyLinkSuggestion(
                    project_id=pid,
                    project_name=pname,
                    client_name=client,
                    limesurvey_survey_id=sid,
                    survey_title=by_id.get(sid, ""),
                    confidence=conf,
                    reason=reason,
                )
            )
            used_surveys.add(sid)

    return suggestions


def _parse_ai_matches(text: str) -> list[dict[str, Any]]:
    text = text.strip()
    if not text:
        return []
    try:
        data = json.loads(text)
        if isinstance(data, dict) and isinstance(data.get("matches"), list):
            return data["matches"]
    except json.JSONDecodeError:
        pass
    match = re.search(r"\{[\s\S]*\}", text)
    if match:
        try:
            data = json.loads(match.group(0))
            if isinstance(data, dict) and isinstance(data.get("matches"), list):
                return data["matches"]
        except json.JSONDecodeError:
            pass
    return []


def _filter_by_context(
    projects: list[dict[str, Any]],
    surveys: list[dict[str, Any]],
    extra_context: str | None,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    text = (extra_context or "").strip()
    if not text:
        return projects, surveys

    if re.fullmatch(r"\d+", text):
        sid = int(text)
        matched_surveys = [s for s in surveys if s.get("id") is not None and int(s["id"]) == sid]
        matched_projects = [
            p
            for p in projects
            if text in (p.get("project_name") or "")
            or text in (p.get("project_code") or "")
            or text in (p.get("client_name") or "")
        ]
        return (
            matched_projects or projects,
            matched_surveys or surveys,
        )

    q = text.lower()
    matched_surveys = [
        s
        for s in surveys
        if q in str(s.get("title") or "").lower()
        or q in str(s.get("id") or "")
    ]
    matched_projects = [
        p
        for p in projects
        if q in (p.get("project_name") or "").lower()
        or q in (p.get("client_name") or "").lower()
        or q in (p.get("project_code") or "").lower()
    ]
    return (
        matched_projects or projects,
        matched_surveys or surveys,
    )


def _ai_suggestions(
    projects: list[dict[str, Any]],
    surveys: list[dict[str, Any]],
    extra_context: str | None,
) -> list[SurveyLinkSuggestion]:
    payload = {
        "unlinked_projects": projects,
        "unlinked_surveys": surveys,
        "additional_context": extra_context,
    }
    system = """You match PM research projects to LimeSurvey / ET Scout survey studies.
Return ONLY valid JSON:
{"matches":[{"project_id":"uuid","survey_id":123,"confidence":"high|medium|low","reason":"short reason"}]}
Rules:
- Each survey_id at most once.
- Only suggest when names/clients/waves clearly align.
- Use "high" only for strong matches; omit weak guesses."""
    text = complete_custom(
        f"Suggest survey-to-project links:\n\n```json\n{json.dumps(payload, default=str, indent=2)}\n```",
        system=system,
        max_tokens=900,
    )
    if not text:
        return []

    by_id, _ = _survey_indexes(surveys)
    project_by_id = {str(p["project_id"]): p for p in projects}
    out: list[SurveyLinkSuggestion] = []
    used: set[int] = set()

    for row in _parse_ai_matches(text):
        try:
            pid = str(row.get("project_id") or "")
            sid = int(row.get("survey_id"))
            conf = str(row.get("confidence") or "medium").lower()
            if conf not in ("high", "medium", "low"):
                conf = "medium"
            if sid in used or sid not in by_id or pid not in project_by_id:
                continue
            proj = project_by_id[pid]
            out.append(
                SurveyLinkSuggestion(
                    project_id=UUID(pid),
                    project_name=proj["project_name"],
                    client_name=proj.get("client_name"),
                    limesurvey_survey_id=sid,
                    survey_title=by_id[sid],
                    confidence=conf,  # type: ignore[arg-type]
                    reason=str(row.get("reason") or "Suggested by AI"),
                )
            )
            used.add(sid)
        except (TypeError, ValueError):
            continue
    return out


def _merge_suggestions(
    heuristic: list[SurveyLinkSuggestion],
    ai: list[SurveyLinkSuggestion],
) -> list[SurveyLinkSuggestion]:
    merged: dict[str, SurveyLinkSuggestion] = {}
    rank = {"high": 3, "medium": 2, "low": 1}

    for item in heuristic + ai:
        key = str(item.project_id)
        prev = merged.get(key)
        if prev is None or rank[item.confidence] > rank[prev.confidence]:
            merged[key] = item

    used_surveys: set[int] = set()
    final: list[SurveyLinkSuggestion] = []
    for item in sorted(
        merged.values(),
        key=lambda s: (-rank[s.confidence], s.project_name.lower()),
    ):
        if item.limesurvey_survey_id in used_surveys:
            continue
        final.append(item)
        used_surveys.add(item.limesurvey_survey_id)
    return final


def run_survey_link_agent(
    session: Session,
    *,
    apply: bool = False,
    extra_context: str | None = None,
) -> SurveyLinkAgentResponse:
    surveys_raw = _load_all_surveys()
    survey_ids = [int(s["id"]) for s in surveys_raw if s.get("id") is not None]
    pipeline = pm_ops_store.pipeline_overview(session, survey_ids)

    linked = {p.limesurvey_survey_id for p in pipeline.projects if p.limesurvey_survey_id}
    unlinked_survey_ids = set(pipeline.unlinked_survey_ids)

    unlinked_projects: list[dict[str, Any]] = []
    for p in pipeline.projects:
        if p.limesurvey_survey_id:
            continue
        unlinked_projects.append(
            {
                "project_id": str(p.project_id),
                "project_name": p.project_name,
                "client_name": p.client_name,
                "stage": p.stage,
            }
        )

    surveys_for_match = [
        {"id": int(s["id"]), "title": str(s.get("title") or s.get("name") or "")}
        for s in surveys_raw
        if s.get("id") is not None and int(s["id"]) in unlinked_survey_ids
    ]

    unlinked_projects, surveys_for_match = _filter_by_context(
        unlinked_projects,
        surveys_for_match,
        extra_context,
    )

    if not unlinked_projects:
        return SurveyLinkAgentResponse(
            agent="survey_links",
            configured=bool(ai_status().get("configured")),
            summary="All PM projects already have a survey link.",
            suggestions=[],
        )
    if not surveys_for_match:
        return SurveyLinkAgentResponse(
            agent="survey_links",
            configured=bool(ai_status().get("configured")),
            summary="No unlinked surveys found — every study is assigned or LimeSurvey is unavailable.",
            suggestions=[],
        )

    heuristic = _heuristic_suggestions(unlinked_projects, surveys_for_match)
    ai: list[SurveyLinkSuggestion] = []
    if ai_status().get("configured"):
        ai = _ai_suggestions(unlinked_projects, surveys_for_match, extra_context)
    suggestions = _merge_suggestions(heuristic, ai)

    applied: list[SurveyLinkSuggestion] = []
    if apply:
        for item in suggestions:
            if item.confidence != "high":
                continue
            try:
                pm_ops_store.link_survey(session, item.project_id, item.limesurvey_survey_id)
                applied.append(item)
            except ValueError:
                continue

    high = sum(1 for s in suggestions if s.confidence == "high")
    summary = (
        f"Found {len(suggestions)} suggested link(s) for {len(unlinked_projects)} unlinked project(s) "
        f"and {len(surveys_for_match)} unlinked survey(s)."
    )
    if apply:
        summary += f" Applied {len(applied)} high-confidence link(s)."
    elif high:
        summary += f" {high} high-confidence — review and apply below."

    return SurveyLinkAgentResponse(
        agent="survey_links",
        configured=bool(ai_status().get("configured")),
        summary=summary,
        suggestions=suggestions,
        applied_count=len(applied),
        applied=applied,
    )


def apply_survey_links(
    session: Session,
    links: list[dict[str, Any]],
) -> tuple[int, list[str]]:
    """Apply explicit project → survey links. Returns (applied_count, errors)."""
    applied = 0
    errors: list[str] = []
    for row in links:
        try:
            pid = UUID(str(row["project_id"]))
            sid = int(row["limesurvey_survey_id"])
        except (TypeError, ValueError, KeyError):
            errors.append("Invalid link payload")
            continue
        try:
            result = pm_ops_store.link_survey(session, pid, sid)
            if result:
                applied += 1
            else:
                errors.append(f"Project {pid} not found")
        except ValueError as exc:
            errors.append(str(exc))
    return applied, errors
