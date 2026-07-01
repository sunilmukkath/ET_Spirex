from app.models.qual_asset import QualAssetCreate, QualAssetUpdate
from app.services.qual_store import (
    create_qual_asset,
    create_qual_asset_pm,
    delete_qual_asset,
    delete_qual_asset_pm,
    list_qual_assets,
    search_qual_assets,
    update_qual_asset,
)


def test_qual_asset_crud_pm(tmp_path, monkeypatch):
    from app.services import qual_store

    monkeypatch.setattr(qual_store, "_DATA_DIR", tmp_path)

    created = qual_store.create_qual_asset_pm(
        "proj-abc",
        QualAssetCreate(
            title="IDI 1",
            content="The packaging stood out on shelf and felt premium.",
            tags=["packaging"],
        ),
        username="Sunil",
    )
    assert created.project_id == "proj-abc"
    assert created.survey_id == 0

    assets = qual_store.list_qual_assets_pm("proj-abc")
    assert len(assets) == 1
    assert delete_qual_asset_pm("proj-abc", created.id) is True


def test_qual_asset_crud(tmp_path, monkeypatch):
    from app.services import qual_store

    monkeypatch.setattr(qual_store, "_DATA_DIR", tmp_path)

    created = create_qual_asset(
        42,
        QualAssetCreate(
            title="FG1 Respondent A",
            content="We really liked the packaging and found it easy to open at home.",
            respondent_id="R001",
            tags=["packaging", "usability"],
        ),
        username="Sunil",
    )
    assert created.id.startswith("qa_")
    assert created.word_count > 0

    assets = list_qual_assets(42)
    assert len(assets) == 1
    assert assets[0].title == "FG1 Respondent A"

    updated = update_qual_asset(42, created.id, QualAssetUpdate(status="reviewed"))
    assert updated is not None
    assert updated.status == "reviewed"

    hits = search_qual_assets(42, "packaging")
    assert len(hits) == 1

    assert delete_qual_asset(42, created.id) is True
    assert list_qual_assets(42) == []
