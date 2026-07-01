"""Structured project brief / requirements shared by workflow and PM projects."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class ProjectRequirements(BaseModel):
    summary: str = ""
    objectives: str = ""
    methodology: str = ""
    sample_design: str = ""
    deliverables: str = ""
    timeline: str = ""
    constraints: str = ""
    updated_at: float | None = None
    updated_by: str | None = None


REQUIREMENT_FIELDS = (
    "summary",
    "objectives",
    "methodology",
    "sample_design",
    "deliverables",
    "timeline",
    "constraints",
)


def requirements_from_raw(raw: Any) -> ProjectRequirements:
    if not isinstance(raw, dict):
        return ProjectRequirements()
    data: dict[str, Any] = {}
    for key in REQUIREMENT_FIELDS:
        data[key] = str(raw.get(key) or "").strip()
    if raw.get("updated_at") is not None:
        try:
            data["updated_at"] = float(raw["updated_at"])
        except (TypeError, ValueError):
            pass
    if raw.get("updated_by"):
        data["updated_by"] = str(raw["updated_by"]).strip()
    return ProjectRequirements(**data)


def requirements_to_context(req: ProjectRequirements) -> dict[str, str]:
    return {key: getattr(req, key) or "" for key in REQUIREMENT_FIELDS}
