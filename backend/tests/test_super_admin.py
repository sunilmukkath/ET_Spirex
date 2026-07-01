"""Tests for super admin identity and login resolution."""

from app.services.super_admin import is_super_admin, resolve_login_identifier
from app.services.team_registry_store import get_global_role, is_global_admin


def test_super_admin_email_login():
    assert resolve_login_identifier("sunilmukkath@elastictree.com") == "Sunil"
    assert resolve_login_identifier("Sunil") == "Sunil"
    assert resolve_login_identifier("unknown@elastictree.com") is None


def test_super_admin_always_admin():
    assert is_super_admin("Sunil")
    assert is_global_admin("Sunil")
    assert get_global_role("Sunil") == "admin"


def test_additional_super_admin(tmp_path, monkeypatch):
    from app.models.team_registry import TeamRegistry, TeamUser
    from app.services import team_registry_store

    monkeypatch.setattr(team_registry_store, "_DATA_DIR", tmp_path)
    monkeypatch.setattr(team_registry_store, "_REGISTRY_PATH", tmp_path / "registry.json")

    registry = TeamRegistry(
        users=[TeamUser(username="Sunil", role="admin"), TeamUser(username="Tony", role="manager")],
        super_admins=["Sunil", "Tony"],
    )
    team_registry_store.set_team_registry(registry)

    assert is_super_admin("Tony")
    assert not is_super_admin("Ravi")

