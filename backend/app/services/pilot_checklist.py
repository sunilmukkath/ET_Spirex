"""Auto-create pilot-phase checklist tasks when a project enters pilot."""

from __future__ import annotations

import time
import uuid

from app.models.project_workflow import ProjectTask, ProjectWorkflow

PILOT_CHECKLIST: list[tuple[str, str, str]] = [
    ("programming", "Pilot link QA — test all routes and quotas", "Verify survey logic, piping, and terminate paths on the pilot link."),
    ("field", "Confirm pilot sample plan and targets", "Agree pilot n, markets, and field partner briefing."),
    ("research", "Review pilot completes for data quality", "Check speeders, straight-lining, and open-end quality."),
    ("general", "Pilot debrief and go / no-go notes", "Document changes required before full field launch."),
]


def seed_pilot_tasks(workflow: ProjectWorkflow, *, editor: str | None) -> ProjectWorkflow:
    if workflow.phase != "pilot" or workflow.pilot_tasks_seeded:
        return workflow

    now = time.time()
    existing_titles = {t.title.lower() for t in workflow.tasks}
    new_tasks: list[ProjectTask] = []
    for category, title, description in PILOT_CHECKLIST:
        if title.lower() in existing_titles:
            continue
        new_tasks.append(
            ProjectTask(
                id=uuid.uuid4().hex[:12],
                title=title,
                description=description,
                category=category,  # type: ignore[arg-type]
                status="todo",
                priority="high",
                created_by=editor,
                created_at=now,
                updated_at=now,
            )
        )

    if not new_tasks:
        data = workflow.model_dump()
        data["pilot_tasks_seeded"] = True
        return ProjectWorkflow(**data)

    data = workflow.model_dump()
    data["tasks"] = [*(t.model_dump() for t in workflow.tasks), *(t.model_dump() for t in new_tasks)]
    data["pilot_tasks_seeded"] = True
    return ProjectWorkflow(**data)
