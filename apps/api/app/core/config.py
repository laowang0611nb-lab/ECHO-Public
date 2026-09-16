from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

API_ROOT = Path(__file__).resolve().parents[2]
PROJECT_ROOT = API_ROOT.parents[1]


class Settings(BaseSettings):
    app_name: str = "ECHO API"
    app_version: str = "0.0.44"
    environment: Literal["development", "test", "production"] = "development"
    api_v1_prefix: str = "/api/v1"
    database_url: str = "postgresql+asyncpg://echo:echo@localhost:5432/echo"
    document_storage_root: Path = PROJECT_ROOT / "tmp" / "uploads"
    development_auth_enabled: bool = False
    retrieval_max_distance: float = 0.65
    max_upload_bytes: int = 20 * 1024 * 1024
    llm_api_key: str | None = None
    llm_base_url: str = "https://dashscope.aliyuncs.com/compatible-mode/v1"
    llm_model: str = "qwen3.8-flash"
    llm_timeout_seconds: float = 60.0
    llm_max_context_chars: int = 60000
    chat_api_key: str | None = None
    chat_base_url: str = "https://dashscope.aliyuncs.com/compatible-mode/v1"
    chat_model: str = "qwen3.8-flash"
    chat_timeout_seconds: float = 60.0
    embedding_api_key: str | None = None
    embedding_base_url: str = "https://dashscope.aliyuncs.com/compatible-mode/v1"
    embedding_model: str = "text-embedding-v3"
    embedding_dimension: int = 1024
    embedding_batch_size: int = 10
    chunk_size_chars: int = 1200
    chunk_overlap_chars: int = 200
    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]

    model_config = SettingsConfigDict(
        env_file=API_ROOT / ".env",
        env_prefix="ECHO_",
        case_sensitive=False,
        extra="ignore",
    )

    @field_validator("document_storage_root")
    @classmethod
    def resolve_storage_root(cls, value: Path) -> Path:
        return value if value.is_absolute() else PROJECT_ROOT / value

    @field_validator("embedding_dimension")
    @classmethod
    def require_supported_embedding_dimension(cls, value: int) -> int:
        if value != 1024:
            raise ValueError("embedding_dimension must remain 1024 until a migration is applied")
        return value

    @model_validator(mode="after")
    def reject_dev_auth_in_production(self) -> "Settings":
        if self.environment == "production" and self.development_auth_enabled:
            raise ValueError("development authentication must be disabled in production")
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
