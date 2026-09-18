from functools import lru_cache
from pathlib import Path
from typing import Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

API_ROOT = Path(__file__).resolve().parents[2]
PROJECT_ROOT = API_ROOT.parents[1]


class Settings(BaseSettings):
    app_name: str = "ECHO API"
    app_version: str = "0.0.76"
    environment: Literal["development", "test", "production"] = "development"
    api_v1_prefix: str = "/api/v1"
    database_url: str = "postgresql+asyncpg://echo:echo@localhost:5432/echo"
    document_storage_root: Path = PROJECT_ROOT / "tmp" / "uploads"
    development_auth_enabled: bool = False
    business_timezone: str = "Asia/Shanghai"
    retrieval_max_distance: float = 0.65
    max_upload_bytes: int = 20 * 1024 * 1024
    llm_api_key: str | None = None
    llm_base_url: str = "https://dashscope.aliyuncs.com/compatible-mode/v1"
    llm_model: str = "qwen3.8-flash"
    llm_timeout_seconds: float = 60.0
    llm_context_window_tokens: int = 1_000_000
    llm_context_safety_ratio: float = 0.7
    llm_batch_overlap_tokens: int = 2000
    llm_max_output_tokens: int = 32768
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

    @field_validator("llm_context_window_tokens")
    @classmethod
    def require_positive_context_window(cls, value: int) -> int:
        if value <= 0:
            raise ValueError("llm_context_window_tokens must be positive")
        return value

    @field_validator("llm_context_safety_ratio")
    @classmethod
    def require_context_safety_ratio(cls, value: float) -> float:
        if value <= 0 or value >= 1:
            raise ValueError("llm_context_safety_ratio must be between 0 and 1")
        return value

    @field_validator("llm_batch_overlap_tokens", "llm_max_output_tokens")
    @classmethod
    def require_non_negative_llm_budgets(cls, value: int) -> int:
        if value < 0:
            raise ValueError("LLM token budgets must not be negative")
        return value

    @field_validator("business_timezone")
    @classmethod
    def require_valid_business_timezone(cls, value: str) -> str:
        try:
            ZoneInfo(value)
        except ZoneInfoNotFoundError as exc:
            raise ValueError("business_timezone must be a valid IANA timezone") from exc
        return value

    @model_validator(mode="after")
    def reject_dev_auth_in_production(self) -> "Settings":
        if self.environment == "production" and self.development_auth_enabled:
            raise ValueError("development authentication must be disabled in production")
        return self

    @property
    def llm_max_input_tokens(self) -> int:
        return int(self.llm_context_window_tokens * self.llm_context_safety_ratio)


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
