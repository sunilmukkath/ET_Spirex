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
