"""Tests for team HR directory."""

from app.models.team_hr import StaffProfileUpdate
from app.services.team_hr_store import (
    build_workload,
    get_staff_profile,
    get_team_directory,
    update_staff_profile,
)


def test_default_profile_has_email():
    profile = get_staff_profile("Sunil")
    assert profile is not None
    assert profile.email
    assert "@" in profile.email
    assert profile.username == "Sunil"


def test_team_directory_lists_all_users():
    directory = get_team_directory()
    usernames = {member.profile.username for member in directory.members}
    assert "Sunil" in usernames
    assert "Tony" in usernames
    assert directory.summary["headcount"] == len(directory.members)


def test_update_staff_phone(tmp_path, monkeypatch):
    from app.services import team_hr_store

    monkeypatch.setattr(team_hr_store, "_DATA_DIR", tmp_path)
    monkeypatch.setattr(team_hr_store, "_STAFF_PATH", tmp_path / "staff.json")

    updated = update_staff_profile(
        "Tony",
        StaffProfileUpdate(phone="+91 98765 43210", email="tony@elastictree.com"),
    )
    assert updated is not None
    assert updated.phone == "+91 98765 43210"
    assert updated.email == "tony@elastictree.com"

    reloaded = get_staff_profile("Tony")
    assert reloaded is not None
    assert reloaded.phone == "+91 98765 43210"


def test_workload_levels():
    workload, _ = build_workload("Sunil")
    assert workload.load_level in {"light", "balanced", "busy", "overloaded"}
    assert workload.load_label
