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

