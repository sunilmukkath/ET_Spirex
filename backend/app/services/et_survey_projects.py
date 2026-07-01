"""Map ET native surveys to dashboard project cards."""

from __future__ import annotations

from typing import Any

from app.services.et_survey_store import list_et_surveys


def et_surveys_as_projects() -> list[dict[str, Any]]:
    items = list_et_surveys()
    projects: list[dict[str, Any]] = []
    for item in items:
        active = item.status == "active"
        projects.append(
            {
                "id": item.workspace_id,
                "title": item.title,
                "language": item.language,
                "owner": item.created_by,
                "status": "active" if active else "inactive",
                "active": active,
                "start_date": None,
                "expire_date": None,
                "created_date": item.updated_at,
                "responses": {
                    "completed": item.response_count,
                    "incomplete": 0,
                    "total": item.response_count,
                    "loaded": True,
                },
                "provider": "et",
                "description": item.description,
                "et_status": item.status,
                "public_slug": item.public_slug,
            }
        )
    return projects


def et_survey_project_detail(workspace_id: int) -> dict[str, Any] | None:
    for project in et_surveys_as_projects():
        if project["id"] == workspace_id:
            return {
                **project,
                "description": project.get("description") or "",
                "summary": {
                    "provider": "et",
                    "public_slug": project.get("public_slug"),
                    "collector_path": f"/s/{project.get('public_slug')}",
                },
            }
    return None
