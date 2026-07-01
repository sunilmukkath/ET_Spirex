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
