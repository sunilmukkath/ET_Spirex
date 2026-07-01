"""Tests for app module visibility."""

from app.models.team_registry import TeamRegistry, TeamUser
from app.services.app_module_access import get_user_app_modules, resolve_user_modules
from app.services.team_registry_store import get_user_modules, set_team_registry


def test_default_modules_for_member():
    user = TeamUser(username="Tony", role="member", modules=[])
    assert "home" in resolve_user_modules(user, role="member")
    assert "operations" not in resolve_user_modules(user, role="member")


def test_explicit_modules_override_role_defaults():
    user = TeamUser(username="Tony", role="member", modules=["operations", "team"])
    resolved = resolve_user_modules(user, role="member")
    assert resolved == ["operations", "team"]


def test_super_admin_gets_all_modules():
    registry = TeamRegistry(users=[TeamUser(username="Sunil", role="admin", modules=[])])
    mods = get_user_app_modules("Sunil", registry, "admin")
    assert "home" in mods
    assert "accounting" in mods
    assert "settings" in mods


def test_registry_persists_modules(tmp_path, monkeypatch):
    from app.services import team_registry_store

    monkeypatch.setattr(team_registry_store, "_DATA_DIR", tmp_path)
    monkeypatch.setattr(team_registry_store, "_REGISTRY_PATH", tmp_path / "registry.json")

    registry = TeamRegistry(
        users=[
            TeamUser(username="Sunil", role="admin", modules=[]),
            TeamUser(username="Tony", role="member", modules=["home", "my_work"]),
        ]
    )
    set_team_registry(registry)
    assert get_user_modules("Tony") == ["home", "my_work"]
