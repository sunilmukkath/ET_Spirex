import os

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    limesurvey_url: str = ""
    limesurvey_username: str = ""
    limesurvey_password: str = ""
    limesurvey_filter_user: str | None = None

    api_host: str = "0.0.0.0"
    api_port: int = 8000
    cors_origins: str = "http://localhost:5173,http://localhost:3000"

    # AI narratives for reports — anthropic | azure | auto (default: first key found)
    ai_provider: str = "auto"
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-sonnet-4-20250514"
    azure_openai_endpoint: str = ""
    azure_openai_api_key: str = ""
    azure_openai_deployment: str = "gpt-4o-mini"
    azure_openai_api_version: str = "2024-02-15-preview"

    lime_rpc_timeout: float = 30.0

    # Postgres spine for full project lifecycle (optional — ET Scout works without it)
    database_url: str = ""

    # Google Workspace / Gmail (optional)
    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = "http://localhost:8000/api/gmail/oauth/callback"
    google_oauth_success_url: str = "http://localhost:5173/my-work?gmail=connected"
    google_auth_redirect_uri: str = "http://localhost:8000/api/auth/google/callback"
    google_auth_success_url: str = "http://localhost:5173/"
    app_public_url: str = "http://localhost:5173"
    gmail_inbox_query: str = "in:inbox newer_than:14d"
    # Optional: sunil@elastictree.com:Sunil,ambika@elastictree.com:Ambika
    gmail_team_email_map: str = ""

    # Company owner / super admin (always full edit rights)
    super_admin_username: str = "Sunil"
    super_admin_email: str = "sunilmukkath@elastictree.com"
    workspace_domain: str = "elastictree.com"

    @staticmethod
    def _is_local_url(url: str) -> bool:
        lowered = url.strip().lower()
        return lowered.startswith("http://localhost") or lowered.startswith("http://127.0.0.1")

    @staticmethod
    def _railway_public_base() -> str | None:
        railway = os.environ.get("RAILWAY_PUBLIC_DOMAIN", "").strip()
        if railway:
            return f"https://{railway}".rstrip("/")
        return None

    @property
    def resolved_app_public_url(self) -> str:
        """Public app URL — Railway domain wins over manual env on Railway."""
        railway_base = self._railway_public_base()
        if railway_base:
            return railway_base
        explicit = self.app_public_url.strip().rstrip("/")
        if explicit and not self._is_local_url(explicit):
            return explicit
        render = os.environ.get("RENDER_EXTERNAL_URL", "").strip().rstrip("/")
        if render:
            return render
        return explicit or "http://localhost:5173"

    @property
    def resolved_google_auth_redirect_uri(self) -> str:
        railway_base = self._railway_public_base()
        if railway_base:
            return f"{railway_base}/api/auth/google/callback"
        explicit = self.google_auth_redirect_uri.strip()
        if explicit and not self._is_local_url(explicit):
            return explicit
        base = self.resolved_app_public_url.rstrip("/")
        if not self._is_local_url(base):
            return f"{base}/api/auth/google/callback"
        return explicit or "http://localhost:8000/api/auth/google/callback"

    @property
    def resolved_google_redirect_uri(self) -> str:
        railway_base = self._railway_public_base()
        if railway_base:
            return f"{railway_base}/api/gmail/oauth/callback"
        explicit = self.google_redirect_uri.strip()
        if explicit and not self._is_local_url(explicit):
            return explicit
        base = self.resolved_app_public_url.rstrip("/")
        if not self._is_local_url(base):
            return f"{base}/api/gmail/oauth/callback"
        return explicit or "http://localhost:8000/api/gmail/oauth/callback"

    @property
    def resolved_google_auth_success_url(self) -> str:
        railway_base = self._railway_public_base()
        if railway_base:
            return f"{railway_base}/dashboard"
        explicit = self.google_auth_success_url.strip().rstrip("/")
        if explicit and not self._is_local_url(explicit):
            return explicit
        base = self.resolved_app_public_url.rstrip("/")
        if not self._is_local_url(base):
            return f"{base}/dashboard"
        return explicit or "http://localhost:5173/"

    @property
    def resolved_google_oauth_success_url(self) -> str:
        railway_base = self._railway_public_base()
        if railway_base:
            return f"{railway_base}/my-work?gmail=connected"
        explicit = self.google_oauth_success_url.strip()
        if explicit and not self._is_local_url(explicit):
            return explicit
        base = self.resolved_app_public_url.rstrip("/")
        if not self._is_local_url(base):
            return f"{base}/my-work?gmail=connected"
        return explicit or "http://localhost:5173/my-work?gmail=connected"

    @property
    def resolved_gmail_team_email_map(self) -> str:
        """Gmail address → ET Scout username, with super admin always mapped."""
        extra: dict[str, str] = {}
        if self.super_admin_email.strip() and self.super_admin_username.strip():
            extra[self.super_admin_email.strip().lower()] = self.super_admin_username.strip()
        for pair in self.gmail_team_email_map.split(","):
            if ":" not in pair:
                continue
            email, name = pair.split(":", 1)
            email = email.strip().lower()
            name = name.strip()
            if email and name:
                extra[email] = name
        return ",".join(f"{email}:{name}" for email, name in sorted(extra.items()))

    @property
    def resolved_ai_provider(self) -> str | None:
        pref = (self.ai_provider or "auto").lower()
        if pref == "none":
            return None
        if pref == "anthropic":
            return "anthropic" if self.anthropic_api_key.strip() else None
        if pref == "azure":
            if self.azure_openai_endpoint.strip() and self.azure_openai_api_key.strip():
                return "azure"
            return None
        # auto
        if self.anthropic_api_key.strip():
            return "anthropic"
        if self.azure_openai_endpoint.strip() and self.azure_openai_api_key.strip():
            return "azure"
        return None

    @property
    def resolved_ai_model(self) -> str | None:
        provider = self.resolved_ai_provider
        if provider == "anthropic":
            return self.anthropic_model
        if provider == "azure":
            return self.azure_openai_deployment
        return None

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def is_configured(self) -> bool:
        return bool(
            self.limesurvey_url
            and self.limesurvey_username
            and self.limesurvey_password
        )


settings = Settings()
