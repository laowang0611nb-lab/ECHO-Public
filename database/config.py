from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

DATABASE_ROOT = Path(__file__).resolve().parent
PROJECT_ROOT = DATABASE_ROOT.parent

__all__ = ["DATABASE_ROOT", "PROJECT_ROOT", "DatabaseSettings", "settings"]


class DatabaseSettings(BaseSettings):
    database_url: str = "postgresql+asyncpg://echo:echo@localhost:5432/echo"
    auth_secret_key: str = "development-only-change-me-0000000000"
    auth_jwt_algorithm: str = "HS256"
    auth_access_token_minutes: int = 30
    auth_refresh_token_days: int = 14

    model_config = SettingsConfigDict(
        env_file=(PROJECT_ROOT / ".env", PROJECT_ROOT / "apps" / "api" / ".env"),
        env_prefix="ECHO_",
        case_sensitive=False,
        extra="ignore",
    )


@lru_cache
def get_settings() -> DatabaseSettings:
    return DatabaseSettings()


settings = get_settings()
