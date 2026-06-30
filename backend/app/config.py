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
