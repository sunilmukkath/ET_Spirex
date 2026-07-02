from app.models.team_registry import TeamUserCreate
from app.services import team_registry_store, user_roster_store
from app.services.user_roster_store import add_team_user, get_valid_users, remove_team_user


def test_add_and_remove_team_user(tmp_path, monkeypatch):
    monkeypatch.setattr(user_roster_store, "_DATA_DIR", tmp_path)
    monkeypatch.setattr(user_roster_store, "_ROSTER_PATH", tmp_path / "roster.json")
    monkeypatch.setattr(team_registry_store, "_DATA_DIR", tmp_path)
    monkeypatch.setattr(team_registry_store, "_REGISTRY_PATH", tmp_path / "registry.json")

    created = add_team_user(
        TeamUserCreate(
            username="jordan",
            full_name="Jordan Lee",
            email="jordan@elastictree.com",
            job_title="Research Analyst",
            role="member",
        )
    )
    assert created.username == "Jordan"
    assert "Jordan" in get_valid_users()

    assert remove_team_user("Jordan", actor="Sunil") is True
    assert "Jordan" not in get_valid_users()
