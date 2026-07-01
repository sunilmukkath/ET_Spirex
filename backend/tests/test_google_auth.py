"""Tests for Google sign-in helpers."""

import os
from unittest.mock import patch

from app.config import Settings
from app.services.google_auth import decode_login_state, encode_login_state
from app.services.super_admin import email_for_username


def test_google_login_state_roundtrip():
    state = encode_login_state("test-verifier-123")
    assert decode_login_state(state) == "test-verifier-123"


def test_email_for_super_admin():
    assert email_for_username("Sunil") == "sunilmukkath@elastictree.com"


def test_resolved_redirect_uris_from_railway_domain():
    with patch.dict(os.environ, {"RAILWAY_PUBLIC_DOMAIN": "et-scout.up.railway.app"}, clear=False):
        settings = Settings()
        assert settings.resolved_app_public_url == "https://et-scout.up.railway.app"
        assert (
            settings.resolved_google_auth_redirect_uri
            == "https://et-scout.up.railway.app/api/auth/google/callback"
        )
        assert (
            settings.resolved_google_redirect_uri
            == "https://et-scout.up.railway.app/api/gmail/oauth/callback"
        )
