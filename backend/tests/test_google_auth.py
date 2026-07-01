"""Tests for Google sign-in helpers."""

from app.services.google_auth import decode_login_state, encode_login_state
from app.services.super_admin import email_for_username


def test_google_login_state_roundtrip():
    state = encode_login_state()
    assert decode_login_state(state)


def test_email_for_super_admin():
    assert email_for_username("Sunil") == "sunilmukkath@elastictree.com"
