"""Tests for Gmail token persistence helpers."""

from app.services import gmail_store


def test_merge_token_data_preserves_refresh_token():
    existing = {
        "token": "old-access",
        "refresh_token": "keep-me",
        "client_id": "cid",
    }
    incoming = {
        "token": "new-access",
        "refresh_token": None,
        "client_id": "cid",
    }
    merged = gmail_store.merge_token_data(existing, incoming)
    assert merged["token"] == "new-access"
    assert merged["refresh_token"] == "keep-me"


def test_merge_token_data_accepts_new_refresh_token():
    existing = {"token": "old-access", "refresh_token": "old-refresh"}
    incoming = {"token": "new-access", "refresh_token": "new-refresh"}
    merged = gmail_store.merge_token_data(existing, incoming)
    assert merged["refresh_token"] == "new-refresh"
