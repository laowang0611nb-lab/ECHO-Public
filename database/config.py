from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DATABASE_ROOT = Path(__file__).resolve().parent
PROJECT_ROOT = DATABASE_ROOT.parent
DEFAULT_AUTH_SECRET = "development-only-change-me-0000000000"

__all__ = ["DATABASE_ROOT", "PROJECT_ROOT", "DatabaseSettings", "settings"]


class DatabaseSettings(BaseSettings):
    environment: Literal["development", "test", "production"] = "development"
    database_url: str = "postgresql+asyncpg://echo:echo@localhost:5432/echo"
    auth_secret_key: str = DEFAULT_AUTH_SECRET
    auth_jwt_algorithm: str = "HS256"
    auth_access_token_minutes: int = 30
    auth_refresh_token_days: int = 14

    model_config = SettingsConfigDict(
        env_file=(PROJECT_ROOT / ".env", PROJECT_ROOT / "apps" / "api" / ".env"),
        env_prefix="ECHO_",
        case_sensitive=False,
        extra="ignore",
    )

    @model_validator(mode="after")
    def reject_default_secret_in_production(self) -> "DatabaseSettings":
        if (
            self.environment == "production"
            and self.auth_secret_key == DEFAULT_AUTH_SECRET
        ):
            raise ValueError("production authentication requires a non-default secret")
        return self


@lru_cache
def get_settings() -> DatabaseSettings:
    return DatabaseSettings()


settings = get_settings()
