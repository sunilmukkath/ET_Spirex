from __future__ import annotations

import json
import time
import uuid
from pathlib import Path
from typing import Any

from app.models.qual_asset import (
    QualComparePreset,
    QualComparePresetCreate,
    QualReportSave,
    QualReportTemplate,
    QualSavedReport,
    QualWorkspaceMeta,
)
from app.services.qual_store import _path as _qual_path, pm_scope, survey_scope

_META_DIR = Path(__file__).resolve().parents[2] / "data" / "qual_meta"


def _meta_path(scope: str) -> Path:
    _META_DIR.mkdir(parents=True, exist_ok=True)
    return _META_DIR / f"{_qual_path(scope).stem}.json"


def _default_template() -> QualReportTemplate:
    return QualReportTemplate(
        sections=[
            {
                "id": "exec",
                "heading": "Executive summary",
                "section_type": "executive_summary",
                "enabled": True,
                "body": "",
            },
            {
                "id": "method",
                "heading": "Methodology",
                "section_type": "methodology",
                "enabled": True,
                "body": "",
            },
            {
                "id": "themes",
                "heading": "Key themes",
                "section_type": "themes",
                "enabled": True,
                "body": "",
            },
            {
                "id": "verbatims",
                "heading": "Verbatims",
                "section_type": "verbatims",
                "enabled": True,
                "body": "",
            },
            {
                "id": "recs",
                "heading": "Recommendations",
                "section_type": "recommendations",
                "enabled": True,
                "body": "",
            },
        ]
    )


def _load_raw(scope: str) -> dict[str, Any]:
    path = _meta_path(scope)
    if not path.is_file():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (json.JSONDecodeError, OSError):
        return {}


def _save_raw(scope: str, data: dict[str, Any]) -> None:
    _meta_path(scope).write_text(json.dumps(data, indent=2), encoding="utf-8")


def get_qual_meta_scope(scope: str) -> QualWorkspaceMeta:
    raw = _load_raw(scope)
    if not raw:
        return QualWorkspaceMeta(report_template=_default_template())
    if not raw.get("report_template"):
        raw["report_template"] = _default_template().model_dump()
    return QualWorkspaceMeta.model_validate(raw)


def get_qual_meta(survey_id: int) -> QualWorkspaceMeta:
    return get_qual_meta_scope(survey_scope(survey_id))


def get_qual_meta_pm(project_id: str) -> QualWorkspaceMeta:
    return get_qual_meta_scope(pm_scope(project_id))


def save_qual_meta_scope(scope: str, meta: QualWorkspaceMeta) -> QualWorkspaceMeta:
    _save_raw(scope, meta.model_dump())
    return meta


def create_compare_preset_scope(
    scope: str,
    body: QualComparePresetCreate,
    *,
    username: str | None = None,
) -> QualComparePreset:
    meta = get_qual_meta_scope(scope)
    preset = QualComparePreset(
        id=f"qcp_{uuid.uuid4().hex[:10]}",
        created_at=time.time(),
        created_by=username,
        **body.model_dump(),
    )
    meta.compare_presets.append(preset)
    save_qual_meta_scope(scope, meta)
    return preset


def delete_compare_preset_scope(scope: str, preset_id: str) -> bool:
    meta = get_qual_meta_scope(scope)
    next_presets = [p for p in meta.compare_presets if p.id != preset_id]
    if len(next_presets) == len(meta.compare_presets):
        return False
    meta.compare_presets = next_presets
    save_qual_meta_scope(scope, meta)
    return True


def set_report_template_scope(scope: str, template: QualReportTemplate) -> QualReportTemplate:
    meta = get_qual_meta_scope(scope)
    meta.report_template = template
    save_qual_meta_scope(scope, meta)
    return template


def save_qual_report_scope(
    scope: str,
    body: QualReportSave,
    *,
    username: str | None = None,
) -> QualSavedReport:
    meta = get_qual_meta_scope(scope)
    report = QualSavedReport(
        id=f"qr_{uuid.uuid4().hex[:10]}",
        title=body.title.strip() or "Qual report",
        sections=body.sections,
        created_at=time.time(),
        created_by=username,
    )
    meta.reports.insert(0, report)
    save_qual_meta_scope(scope, meta)
    return report


def delete_qual_report_scope(scope: str, report_id: str) -> bool:
    meta = get_qual_meta_scope(scope)
    next_reports = [r for r in meta.reports if r.id != report_id]
    if len(next_reports) == len(meta.reports):
        return False
    meta.reports = next_reports
    save_qual_meta_scope(scope, meta)
    return True
