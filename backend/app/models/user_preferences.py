"""Per-user UI and analysis preferences."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


class UserPreferences(BaseModel):
    dashboard_view_mode: Literal["strips", "table"] = "strips"
    dashboard_sort_key: str = "newest"
    default_completion_status: Literal["complete", "partial", "all"] = "complete"
    default_report_format: Literal["pptx", "pdf"] = "pptx"
    ai_narrative_default: bool = False
    crosstab_heatmap_default: bool = True
    operations_default_tab: str = "pipeline"
    home_refresh_on_login: bool = True
    pinned_only_default: bool = False


class UserPreferencesUpdate(BaseModel):
    dashboard_view_mode: Literal["strips", "table"] | None = None
    dashboard_sort_key: str | None = None
    default_completion_status: Literal["complete", "partial", "all"] | None = None
    default_report_format: Literal["pptx", "pdf"] | None = None
    ai_narrative_default: bool | None = None
    crosstab_heatmap_default: bool | None = None
    operations_default_tab: str | None = None
    home_refresh_on_login: bool | None = None
    pinned_only_default: bool | None = None
