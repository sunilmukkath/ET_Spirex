from __future__ import annotations

import uuid
from typing import Any

from app.models.project_workflow import (
    MAX_ACTIVITIES,
    ProjectActivity,
    ProjectTask,
    ProjectWorkflow,
)

PHASE_LABELS = {
    "proposal": "Proposal",
    "design": "Design",
    "pilot": "Pilot",
    "field": "Field",
    "analysis": "Analysis",
    "delivery": "Delivery",
    "closed": "Closed",
}


def _new_activity(
    activity_type: str,
    message: str,
    *,
    actor: str | None = None,
    task_id: str | None = None,
) -> ProjectActivity:
    import time

    return ProjectActivity(
        id=uuid.uuid4().hex[:12],
        type=activity_type,  # type: ignore[arg-type]
        message=message.strip(),
        actor=actor,
        created_at=time.time(),
        task_id=task_id,
    )


def _trim_activities(activities: list[ProjectActivity]) -> list[ProjectActivity]:
    if len(activities) <= MAX_ACTIVITIES:
        return activities
    return activities[-MAX_ACTIVITIES:]


def append_activities(
    workflow: ProjectWorkflow,
    new_items: list[ProjectActivity],
) -> ProjectWorkflow:
    if not new_items:
        return workflow
    merged = _trim_activities([*workflow.activities, *new_items])
    data = workflow.model_dump()
    data["activities"] = [a.model_dump() for a in merged]
    return ProjectWorkflow(**data)


def diff_workflow_activities(
    previous: ProjectWorkflow,
    current: ProjectWorkflow,
    *,
    editor: str | None,
) -> list[ProjectActivity]:
    events: list[ProjectActivity] = []

    if previous.phase != current.phase:
        events.append(
            _new_activity(
                "phase_change",
                f"Phase changed to {PHASE_LABELS.get(current.phase, current.phase)}",
                actor=editor,
            )
        )

    prev_members = {m.username for m in previous.members}
    curr_members = {m.username for m in current.members}
    for username in sorted(curr_members - prev_members):
        events.append(
            _new_activity("member_added", f"{username} joined the project team", actor=editor)
        )
    for username in sorted(prev_members - curr_members):
        events.append(
            _new_activity("member_removed", f"{username} removed from the project team", actor=editor)
        )

    prev_tasks = {t.id: t for t in previous.tasks}
    curr_tasks = {t.id: t for t in current.tasks}

    for task_id, task in curr_tasks.items():
        if task_id not in prev_tasks:
            events.append(
                _new_activity(
                    "task_created",
                    f"Task created: {task.title}",
                    actor=editor or task.created_by,
                    task_id=task_id,
                )
            )
            continue
        old = prev_tasks[task_id]
        changes: list[str] = []
        if old.status != task.status:
            changes.append(f"status → {task.status.replace('_', ' ')}")
        if old.assignee != task.assignee:
            assignee = task.assignee or "unassigned"
            changes.append(f"assignee → {assignee}")
        if old.title != task.title:
            changes.append("title updated")
        if changes:
            events.append(
                _new_activity(
                    "task_updated",
                    f"Task updated ({task.title}): {', '.join(changes)}",
                    actor=editor,
                    task_id=task_id,
                )
            )

        prev_comment_ids = {c.id for c in old.comments}
        for comment in task.comments:
            if comment.id not in prev_comment_ids:
                preview = comment.body[:80] + ("…" if len(comment.body) > 80 else "")
                events.append(
                    _new_activity(
                        "task_comment",
                        f"Comment on “{task.title}”: {preview}",
                        actor=comment.author,
                        task_id=task_id,
                    )
                )

    return events
