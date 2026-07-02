"""Scout task manager — review team tasks and apply safe updates."""

from __future__ import annotations

import json
import time
from datetime import date
from typing import Any

from app.models.task_manager import TaskManagerAgentResponse, TaskManagerUpdate
from app.services.agent_helpers import parse_agent_brief_text
from app.services.ai_narrative import ai_status, complete_custom, complete_json
from app.services.auth import get_valid_users
from app.services.personal_tasks_store import patch_personal_task
from app.services.project_workflow_store import (
    list_my_tasks,
    list_team_assigned_tasks,
    list_unassigned_tasks,
    patch_project_task,
)
from app.services.task_manager_run_store import get_last_task_manager_run, save_task_manager_run
from app.services.team_hr_store import build_workload

TASK_MANAGER_SYSTEM = """You are Scout, Elastic Tree's task operations agent.
Review the team task snapshot and return JSON only:
{
  "summary": "2-3 sentences",
  "actions": ["bullet recommendations"],
  "risks": ["overdue or blocked items"],
  "updates": [
    {
      "task_id": "abc",
      "survey_id": 12345,
      "personal": false,
      "field": "assignee",
      "new_value": "Tony",
      "reason": "Unassigned general task; Tony has light load"
    }
  ]
}
Rules:
- Use ONLY tasks from the JSON context.
- updates.field may be: assignee, priority, status, due_date
- status values: todo, in_progress, blocked, done
- priority values: low, medium, high
- Only suggest updates you are confident about.
- Prefer assigning unassigned tasks to users with light load.
- Email-sourced unassigned tasks (needs_email_review) should use suggested_assignee when present.
- Flag overdue tasks (due_date before today) in risks.
- British English."""

MAX_AUTO_ASSIGN = 5
STALE_DAYS = 14


def run_scheduled_task_manager() -> TaskManagerAgentResponse:
    return run_task_manager_agent(apply=True, triggered_by="scheduler")


def run_task_manager_agent(
    *,
    apply: bool = False,
    username: str | None = None,
    triggered_by: str = "manual",
) -> TaskManagerAgentResponse:
    ctx = _build_context(username, triggered_by=triggered_by)
    status = ai_status()
    configured = bool(status.get("configured"))

    if configured:
        ai_result = _run_ai(ctx, configured)
        if ai_result:
            if apply:
                ai_result.updates = _apply_updates(ai_result.updates, editor="Scout")
                ai_result.applied = True
            ai_result.next_run_hint = _next_run_hint()
            save_task_manager_run(ai_result)
            return ai_result

    result = _heuristic_review(ctx, configured=configured)
    if apply:
        result.updates = _apply_updates(result.updates, editor="Scout")
        result.applied = True
    result.next_run_hint = _next_run_hint()
    save_task_manager_run(result)
    return result


def _next_run_hint() -> str:
    from app.config import settings

    hours = settings.task_manager_interval_hours
    return f"Scout auto-checks tasks every {hours:g} hours."


def _build_context(username: str | None, *, triggered_by: str = "manual") -> dict[str, Any]:
    today = date.today().isoformat()
    workloads: dict[str, dict[str, Any]] = {}
    for member in sorted(get_valid_users()):
        wl, _ = build_workload(member)
        workloads[member] = {
            "open_tasks": wl.open_tasks,
            "load_level": wl.load_level,
            "high_priority": wl.high_priority,
        }

    unassigned = [_enrich_email_task(_compact_row(row)) for row in list_unassigned_tasks()]
    overdue: list[dict[str, Any]] = []
    stale: list[dict[str, Any]] = []
    my_scope: list[dict[str, Any]] = []

    if username:
        my_scope = [_compact_row(row) for row in list_my_tasks(username)]
    else:
        for member in sorted(get_valid_users()):
            for row in list_my_tasks(member):
                compact = _compact_row(row)
                compact["assignee"] = member
                my_scope.append(compact)

    team_open = [_compact_row(row) for row in list_team_assigned_tasks(username)]

    for row in unassigned + my_scope + team_open:
        task = row.get("task") or row
        due = task.get("due_date")
        if due and due < today and task.get("status") != "done":
            overdue.append(row)
        updated = task.get("updated_at") or task.get("created_at") or 0
        if task.get("status") == "in_progress" and updated:
            age_days = (time.time() - float(updated)) / 86400
            if age_days >= STALE_DAYS:
                stale.append({**row, "stale_days": int(age_days)})

    return {
        "today": today,
        "scope_user": username,
        "triggered_by": triggered_by,
        "workloads": workloads,
        "unassigned": unassigned,
        "overdue": overdue,
        "stale": stale,
        "my_tasks": my_scope[:40],
        "team_tasks": team_open[:30],
        "counts": {
            "unassigned": len(unassigned),
            "email_review": sum(1 for row in unassigned if row.get("needs_email_review")),
            "overdue": len(overdue),
            "stale": len(stale),
            "open_team": len(my_scope) + len(team_open),
        },
    }


def _compact_row(row: dict[str, Any]) -> dict[str, Any]:
    task = row.get("task") or {}
    return {
        "task_id": task.get("id"),
        "title": task.get("title"),
        "status": task.get("status"),
        "priority": task.get("priority"),
        "assignee": task.get("assignee"),
        "due_date": task.get("due_date"),
        "category": task.get("category"),
        "source": task.get("source"),
        "gmail_message_id": task.get("gmail_message_id"),
        "personal": bool(row.get("personal")),
        "survey_id": row.get("survey_id"),
        "survey_title": row.get("survey_title") or row.get("client_name"),
        "created_at": task.get("created_at"),
        "updated_at": task.get("updated_at"),
    }


def _enrich_email_task(task: dict[str, Any]) -> dict[str, Any]:
    from app.services.gmail_suggest import suggest_assignee
    from app.services.gmail_tasks import resolve_message_for_task

    enriched = dict(task)
    is_email = enriched.get("source") == "email" or bool(enriched.get("gmail_message_id"))
    if not is_email:
        return enriched
    enriched["needs_email_review"] = True
    msg_id = str(enriched.get("gmail_message_id") or "")
    if msg_id:
        message = resolve_message_for_task(msg_id)
        if message:
            enriched["email_subject"] = message.get("subject")
            suggested = suggest_assignee(message)
            if suggested:
                enriched["suggested_assignee"] = suggested
    return enriched


def _run_ai(ctx: dict[str, Any], configured: bool) -> TaskManagerAgentResponse | None:
    raw = complete_json(
        f"Review tasks and suggest safe updates:\n\n```json\n{json.dumps(ctx, default=str, indent=2)}\n```",
        system=TASK_MANAGER_SYSTEM,
        max_tokens=1200,
    )
    if not raw:
        text = complete_custom(
            f"Review tasks:\n\n```json\n{json.dumps(ctx, default=str, indent=2)}\n```",
            system=TASK_MANAGER_SYSTEM.replace("return JSON only", "return SUMMARY / ACTIONS / RISKS sections"),
            max_tokens=800,
        )
        if not text:
            return None
        brief = parse_agent_brief_text("task_manager", configured, text)
        return TaskManagerAgentResponse(
            configured=configured,
            summary=brief.summary,
            actions=brief.actions,
            risks=brief.risks,
            ran_at=time.time(),
            unassigned_count=ctx["counts"]["unassigned"],
            overdue_count=ctx["counts"]["overdue"],
            stale_count=ctx["counts"]["stale"],
            email_review_count=ctx["counts"].get("email_review", 0),
        )

    try:
        data = json.loads(raw) if isinstance(raw, str) else raw
    except (TypeError, json.JSONDecodeError):
        return None

    updates: list[TaskManagerUpdate] = []
    for item in data.get("updates") or []:
        if not isinstance(item, dict) or not item.get("task_id") or not item.get("field"):
            continue
        updates.append(
            TaskManagerUpdate(
                task_id=str(item["task_id"]),
                survey_id=int(item["survey_id"]) if item.get("survey_id") else None,
                personal=bool(item.get("personal")),
                field=str(item["field"]),
                old_value=str(item["old_value"]) if item.get("old_value") is not None else None,
                new_value=str(item["new_value"]) if item.get("new_value") is not None else None,
                reason=str(item.get("reason") or "AI suggestion"),
            )
        )

    return TaskManagerAgentResponse(
        configured=configured,
        summary=str(data.get("summary") or "Task review complete."),
        actions=[str(a) for a in data.get("actions") or []],
        risks=[str(r) for r in data.get("risks") or []],
        ran_at=time.time(),
        updates=updates,
        unassigned_count=ctx["counts"]["unassigned"],
        overdue_count=ctx["counts"]["overdue"],
        stale_count=ctx["counts"]["stale"],
        email_review_count=ctx["counts"].get("email_review", 0),
    )


def _heuristic_review(ctx: dict[str, Any], *, configured: bool) -> TaskManagerAgentResponse:
    actions: list[str] = []
    risks: list[str] = []
    updates: list[TaskManagerUpdate] = []

    unassigned = ctx["unassigned"]
    overdue = ctx["overdue"]
    stale = ctx["stale"]
    workloads = ctx["workloads"]

    if unassigned:
        email_review = [row for row in unassigned if row.get("needs_email_review")]
        if email_review:
            actions.append(
                f"Review {len(email_review)} email-sourced task(s) in the new queue before assigning."
            )
            risks.append("Unassigned email tasks need a human or Scout assignee review.")
        actions.append(f"Assign {len(unassigned)} unassigned task(s) from the new-task queue.")
        updates.extend(_suggest_assignments(unassigned, workloads))

    if overdue:
        risks.append(f"{len(overdue)} task(s) are past due — review priorities and due dates.")
        for row in overdue[:10]:
            task = row if "task_id" in row else _compact_row(row)
            if task.get("priority") != "high":
                updates.append(
                    TaskManagerUpdate(
                        task_id=str(task["task_id"]),
                        survey_id=task.get("survey_id"),
                        personal=bool(task.get("personal")),
                        field="priority",
                        old_value=task.get("priority"),
                        new_value="high",
                        reason="Overdue — elevated priority",
                    )
                )

    if stale:
        risks.append(f"{len(stale)} in-progress task(s) unchanged for {STALE_DAYS}+ days.")
        actions.append("Follow up on stale in-progress items or move back to todo.")

    light_users = sorted(
        [u for u, w in workloads.items() if w.get("load_level") == "light"],
        key=lambda u: workloads[u].get("open_tasks", 0),
    )
    if light_users:
        actions.append(f"Capacity available: {', '.join(light_users[:3])} have light load.")

    summary_parts = [
        f"{ctx['counts']['open_team']} open team tasks",
        f"{ctx['counts']['unassigned']} unassigned",
        f"{ctx['counts']['overdue']} overdue",
    ]
    if not actions and not risks:
        actions.append("No urgent changes — team queue looks healthy.")

    return TaskManagerAgentResponse(
        configured=configured,
        summary="Scout reviewed tasks: " + ", ".join(summary_parts) + ".",
        actions=actions,
        risks=risks,
        ran_at=time.time(),
        updates=updates[:MAX_AUTO_ASSIGN + 10],
        unassigned_count=ctx["counts"]["unassigned"],
        overdue_count=ctx["counts"]["overdue"],
        stale_count=ctx["counts"]["stale"],
        email_review_count=ctx["counts"].get("email_review", 0),
    )


def _suggest_assignments(
    rows: list[dict[str, Any]],
    workloads: dict[str, dict[str, Any]],
) -> list[TaskManagerUpdate]:
    candidates = sorted(get_valid_users(), key=lambda u: workloads.get(u, {}).get("open_tasks", 999))
    updates: list[TaskManagerUpdate] = []
    workload_idx = 0

    email_rows = [row for row in rows if row.get("needs_email_review")]
    other_rows = [row for row in rows if not row.get("needs_email_review")]

    for row in email_rows:
        if len(updates) >= MAX_AUTO_ASSIGN:
            break
        if not row.get("task_id"):
            continue
        assignee = row.get("suggested_assignee")
        reason = "Email task — assignee from source message"
        if not assignee:
            assignee = candidates[workload_idx % len(candidates)] if candidates else None
            reason = f"Email task — balanced to {assignee}"
            workload_idx += 1
        if not assignee:
            continue
        updates.append(
            TaskManagerUpdate(
                task_id=str(row["task_id"]),
                survey_id=row.get("survey_id"),
                personal=bool(row.get("personal")),
                field="assignee",
                old_value=None,
                new_value=assignee,
                reason=reason,
            )
        )

    for row in other_rows:
        if len(updates) >= MAX_AUTO_ASSIGN:
            break
        if not row.get("task_id"):
            continue
        assignee = candidates[workload_idx % len(candidates)] if candidates else None
        workload_idx += 1
        if not assignee:
            continue
        updates.append(
            TaskManagerUpdate(
                task_id=str(row["task_id"]),
                survey_id=row.get("survey_id"),
                personal=bool(row.get("personal")),
                field="assignee",
                old_value=None,
                new_value=assignee,
                reason=f"Auto-assign to {assignee} (balanced workload)",
            )
        )
    return updates


def _apply_updates(updates: list[TaskManagerUpdate], *, editor: str) -> list[TaskManagerUpdate]:
    applied: list[TaskManagerUpdate] = []
    for upd in updates:
        field = upd.field.strip().lower()
        if field not in {"assignee", "priority", "status", "due_date"}:
            continue
        value = upd.new_value
        if value is None:
            continue
        if upd.personal or not upd.survey_id:
            result = patch_personal_task(upd.task_id, editor=editor, **{field: value})
            if result:
                applied.append(upd)
            continue
        try:
            patch_project_task(upd.survey_id, upd.task_id, editor=editor, **{field: value})
            applied.append(upd)
        except ValueError:
            continue
    return applied


def format_last_run_for_user(username: str | None) -> TaskManagerAgentResponse | None:
    last = get_last_task_manager_run()
    if not last:
        return None
    if not username:
        return last
    # Personalize summary for manual view — full team run still shown
    return last
