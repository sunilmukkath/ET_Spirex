from app.models.quota_config import QuotaConfig
from app.models.qc_config import QcConfig
from app.models.team_preset import TeamPresetCreate
from app.services.quota_config_store import get_quota_config
from app.services.qc_config_store import get_qc_config
from app.services.team_preset_store import (
    apply_team_preset,
    create_team_preset,
    delete_team_preset,
    list_team_presets,
)


def test_team_preset_crud_and_apply(tmp_path, monkeypatch):
    monkeypatch.setattr("app.services.team_preset_store._DATA_DIR", tmp_path)

    survey_id = 99001
    quota_body = TeamPresetCreate(
        name="Standard quotas",
        kind="quota",
        config={
            "basis": "qc_approved",
            "tolerance_count": 2,
            "tolerance_pct": 5.0,
            "fields": [],
            "layers": [],
        },
    )
    created = create_team_preset(survey_id, quota_body, username="Sunil")
    assert created.id.startswith("tp_")
    assert created.created_by == "Sunil"

    listed = list_team_presets(survey_id, kind="quota")
    assert len(listed) == 1
    assert listed[0].name == "Standard quotas"

    apply_team_preset(survey_id, created.id)
    quota = get_quota_config(survey_id)
    assert quota.basis == "qc_approved"
    assert quota.tolerance_count == 2

    qc_body = TeamPresetCreate(
        name="Strict QC",
        kind="qc",
        config=QcConfig(
            disabled_checks=["test_responses"],
            thresholds={"speeder_min_seconds": 120},
        ).model_dump(),
    )
    qc_preset = create_team_preset(survey_id, qc_body, username="Sunil")
    apply_team_preset(survey_id, qc_preset.id)
    qc = get_qc_config(survey_id)
    assert "test_responses" in qc.disabled_checks
    assert qc.thresholds.speeder_min_seconds == 120

    assert delete_team_preset(survey_id, created.id)
    assert list_team_presets(survey_id, kind="quota") == []


def test_list_team_presets_filters_by_kind(tmp_path, monkeypatch):
    monkeypatch.setattr("app.services.team_preset_store._DATA_DIR", tmp_path)

    survey_id = 99002
    create_team_preset(
        survey_id,
        TeamPresetCreate(name="Banner A", kind="banner", config={"side_row_ids": []}),
    )
    create_team_preset(
        survey_id,
        TeamPresetCreate(name="Quota A", kind="quota", config=QuotaConfig().model_dump()),
    )

    banners = list_team_presets(survey_id, kind="banner")
    quotas = list_team_presets(survey_id, kind="quota")
    assert len(banners) == 1
    assert len(quotas) == 1
    assert banners[0].kind == "banner"
    assert quotas[0].kind == "quota"
