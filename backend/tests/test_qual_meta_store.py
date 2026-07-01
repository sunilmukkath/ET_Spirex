from app.models.qual_asset import QualComparePresetCreate, QualReportSave
from app.services.qual_meta_store import (
    create_compare_preset_scope,
    get_qual_meta_scope,
    pm_scope,
    save_qual_report_scope,
)


def test_qual_meta_compare_and_reports(tmp_path, monkeypatch):
    from app.services import qual_meta_store

    monkeypatch.setattr(qual_meta_store, "_META_DIR", tmp_path)

    scope = pm_scope("proj-1")
    preset = create_compare_preset_scope(
        scope,
        QualComparePresetCreate(name="Tags × moderator"),
        username="Sunil",
    )
    assert preset.id.startswith("qcp_")

    meta = get_qual_meta_scope(scope)
    assert len(meta.compare_presets) == 1
    assert meta.report_template.sections

    report = save_qual_report_scope(
        scope,
        QualReportSave(title="Wave 1 readout", sections=meta.report_template.sections[:2]),
        username="Sunil",
    )
    assert report.id.startswith("qr_")
    meta2 = get_qual_meta_scope(scope)
    assert len(meta2.reports) == 1
