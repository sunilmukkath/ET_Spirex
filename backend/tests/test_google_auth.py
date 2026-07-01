"""Tests for Google sign-in helpers."""

import os
from unittest.mock import patch

from app.config import Settings
from app.services.google_auth import decode_login_state, encode_login_state
from app.services.super_admin import email_for_username


def test_google_login_state_roundtrip():
    state = encode_login_state()
    assert decode_login_state(state)


def test_email_for_super_admin():
    assert email_for_username("Sunil") == "sunilmukkath@elastictree.com"


def test_resolved_redirect_uris_from_railway_domain():
    with patch.dict(os.environ, {"RAILWAY_PUBLIC_DOMAIN": "et-scout.up.railway.app"}, clear=False):
        settings = Settings(
            google_auth_redirect_uri="https://wrong.example.com/api/auth/google/callback",
            google_redirect_uri="https://wrong.example.com/api/gmail/oauth/callback",
            app_public_url="https://wrong.example.com",
        )
        assert settings.resolved_app_public_url == "https://et-scout.up.railway.app"
        assert (
            settings.resolved_google_auth_redirect_uri
            == "https://et-scout.up.railway.app/api/auth/google/callback"
        )
        assert (
            settings.resolved_google_redirect_uri
            == "https://et-scout.up.railway.app/api/gmail/oauth/callback"
        )


def test_google_signin_url_has_no_pkce_challenge():
    import urllib.parse

    from app.services.google_auth import build_google_signin_url

    with patch.dict(os.environ, {"RAILWAY_PUBLIC_DOMAIN": "et-scout.up.railway.app"}, clear=False):
        url = build_google_signin_url()
        query = urllib.parse.parse_qs(urllib.parse.urlparse(url).query)
        redirect = urllib.parse.unquote(query["redirect_uri"][0])
        assert "code_challenge" not in url
        assert redirect == "https://et-scout.up.railway.app/api/auth/google/callback"
