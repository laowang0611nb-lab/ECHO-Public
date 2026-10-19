from functools import lru_cache
from pathlib import Path
from typing import Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import AliasChoices, Field, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

API_ROOT = Path(__file__).resolve().parents[2]
PROJECT_ROOT = API_ROOT.parents[1]


class Settings(BaseSettings):
    app_name: str = "ECHO API"
    app_version: str = "0.0.266"
    environment: Literal["development", "test", "production"] = "development"
    deployment_mode: Literal["local", "public_demo"] = "local"
    public_base_url: str = "http://127.0.0.1:8000"
    teacher_web_base_url: str = "http://127.0.0.1:3000"
    api_v1_prefix: str = "/api/v1"
    database_url: str = "postgresql+asyncpg://echo:echo@localhost:5432/echo"
    document_storage_root: Path = PROJECT_ROOT / "tmp" / "uploads"
    chat_attachment_storage_root: Path = PROJECT_ROOT / "tmp" / "chat_attachments"
    avatar_storage_root: Path = PROJECT_ROOT / "tmp" / "avatars"
    development_auth_enabled: bool = False
    public_registration_enabled: bool = True
    business_timezone: str = "Asia/Shanghai"
    retrieval_max_distance: float = 0.65
    max_upload_bytes: int = 20 * 1024 * 1024
    chat_image_max_upload_bytes: int = 10 * 1024 * 1024
    chat_audio_max_upload_bytes: int = 20 * 1024 * 1024
    chat_video_max_upload_bytes: int = 50 * 1024 * 1024
    chat_video_enabled: bool = True
    chat_attachment_expiry_hours: int = 24
    chat_rate_limit_per_minute: int = 30
    sms_send_phone_limit_per_hour: int = 5
    sms_send_ip_limit_per_hour: int = 20
    document_processing_max_concurrency: int = 1
    analysis_max_concurrency: int = 1
    asr_enabled: bool = False
    asr_model: str = "small"
    asr_device: str = "cpu"
    asr_compute_type: str = "int8"
    asr_language: str = "zh"
    asr_beam_size: int = 5
    asr_model_root: str | None = None
    asr_remote_enabled: bool = True
    asr_remote_model: str = "qwen3-asr-flash"
    analysis_progress_heartbeat_seconds: int = 5
    chat_media_upload_enabled: bool = True
    chat_media_upload_base_url: str = "https://dashscope.aliyuncs.com"
    chat_video_normalization_fps: int = 10
    chat_video_max_dimension: int = 1280
    chat_model_file_expiry_hours: int = 48
    chat_attachment_cleanup_interval_seconds: int = 3600
    avatar_max_upload_bytes: int = 2 * 1024 * 1024
    alibaba_cloud_access_key_id: str | None = Field(
        default=None,
        validation_alias=AliasChoices(
            "ALIBABA_CLOUD_ACCESS_KEY_ID",
            "ECHO_ALIBABA_CLOUD_ACCESS_KEY_ID",
            "ECHO_ALIYUN_ACCESS_KEY_ID",
        ),
    )
    alibaba_cloud_access_key_secret: str | None = Field(
        default=None,
        validation_alias=AliasChoices(
            "ALIBABA_CLOUD_ACCESS_KEY_SECRET",
            "ECHO_ALIBABA_CLOUD_ACCESS_KEY_SECRET",
            "ECHO_ALIYUN_ACCESS_KEY_SECRET",
        ),
    )
    aliyun_pnvs_sign_name: str | None = Field(
        default=None,
        validation_alias=AliasChoices(
            "ALIYUN_PNVS_SIGN_NAME",
            "ECHO_ALIYUN_PNVS_SIGN_NAME",
        ),
    )
    aliyun_pnvs_template_code: str = Field(
        default="100001",
        validation_alias=AliasChoices(
            "ALIYUN_PNVS_TEMPLATE_CODE",
            "ECHO_ALIYUN_PNVS_TEMPLATE_CODE",
        ),
    )
    aliyun_pnvs_country_code: str = Field(
        default="86",
        validation_alias=AliasChoices(
            "ALIYUN_PNVS_COUNTRY_CODE",
            "ECHO_ALIYUN_PNVS_COUNTRY_CODE",
        ),
    )
    aliyun_pnvs_valid_time: int = Field(
        default=300,
        validation_alias=AliasChoices(
            "ALIYUN_PNVS_VALID_TIME",
            "ECHO_ALIYUN_PNVS_VALID_TIME",
        ),
    )
    aliyun_pnvs_interval: int = Field(
        default=60,
        validation_alias=AliasChoices(
            "ALIYUN_PNVS_INTERVAL",
            "ECHO_ALIYUN_PNVS_INTERVAL",
        ),
    )
    aliyun_pnvs_timeout_seconds: int = Field(
        default=10,
        validation_alias=AliasChoices(
            "ALIYUN_PNVS_TIMEOUT_SECONDS",
            "ECHO_ALIYUN_PNVS_TIMEOUT_SECONDS",
        ),
    )
    llm_api_key: str | None = None
    llm_base_url: str = "https://dashscope.aliyuncs.com/compatible-mode/v1"
    llm_model: str = "qwen3.8-flash"
    llm_timeout_seconds: float = 180.0
    llm_context_window_tokens: int = 1_000_000
    llm_context_safety_ratio: float = 0.7
    llm_batch_overlap_tokens: int = 2000
    llm_max_output_tokens: int = 32768
    chat_api_key: str | None = None
    chat_base_url: str = "https://dashscope.aliyuncs.com/compatible-mode/v1"
    chat_model: str = "qwen3.8-flash"
    chat_timeout_seconds: float = 60.0
    teacher_assistant_enabled: bool = True
    teacher_assistant_max_message_chars: int = 4000
    teacher_assistant_max_history_messages: int = 16
    teacher_assistant_max_history_message_chars: int = 1500
    teacher_assistant_max_context_days: int = 180
    teacher_assistant_max_planning_rounds: int = 4
    teacher_assistant_max_tool_calls: int = 8
    teacher_assistant_max_students: int = 50
    teacher_assistant_max_question_messages: int = 30
    teacher_assistant_tool_timeout_seconds: float = 20.0
    teacher_assistant_provider_timeout_seconds: float = 45.0
    teaching_flow_enabled: bool = True
    teaching_flow_llm_classifier_enabled: bool = True
    teaching_flow_max_hint_levels: int = 3
    teaching_flow_max_incorrect_attempts: int = 2
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
        "http://localhost:3001",
        "http://127.0.0.1:3001",
        "https://example.com",
    ]

    model_config = SettingsConfigDict(
        env_file=API_ROOT / ".env",
        env_prefix="ECHO_",
        case_sensitive=False,
        populate_by_name=True,
        extra="ignore",
    )

    @field_validator("aliyun_pnvs_country_code")
    @classmethod
    def require_mainland_china_country_code(cls, value: str) -> str:
        normalized = value.strip()
        if normalized != "86":
            raise ValueError("aliyun_pnvs_country_code must remain 86")
        return normalized

    @field_validator("aliyun_pnvs_valid_time")
    @classmethod
    def require_positive_valid_time(cls, value: int) -> int:
        if value <= 0:
            raise ValueError("aliyun_pnvs_valid_time must be positive")
        return value

    @field_validator("aliyun_pnvs_interval")
    @classmethod
    def require_positive_interval(cls, value: int) -> int:
        if value <= 0:
            raise ValueError("aliyun_pnvs_interval must be positive")
        return value

    @field_validator("aliyun_pnvs_timeout_seconds")
    @classmethod
    def require_positive_pnvs_timeout(cls, value: int) -> int:
        if value <= 0 or value > 60:
            raise ValueError("aliyun_pnvs_timeout_seconds must be between 1 and 60")
        return value

    @field_validator("public_base_url", "teacher_web_base_url")
    @classmethod
    def normalize_public_url(cls, value: str) -> str:
        normalized = value.strip().rstrip("/")
        if not normalized.startswith(("http://", "https://")):
            raise ValueError("public URLs must start with http:// or https://")
        return normalized

    @field_validator(
        "document_storage_root",
        "avatar_storage_root",
        "chat_attachment_storage_root",
    )
    @classmethod
    def resolve_storage_root(cls, value: Path) -> Path:
        return value if value.is_absolute() else PROJECT_ROOT / value

    @field_validator("embedding_dimension")
    @classmethod
    def require_supported_embedding_dimension(cls, value: int) -> int:
        if value != 1024:
            raise ValueError("embedding_dimension must remain 1024 until a migration is applied")
        return value

    @field_validator(
        "chat_image_max_upload_bytes",
        "chat_audio_max_upload_bytes",
        "chat_video_max_upload_bytes",
        "chat_attachment_expiry_hours",
        "chat_rate_limit_per_minute",
        "sms_send_phone_limit_per_hour",
        "sms_send_ip_limit_per_hour",
        "document_processing_max_concurrency",
        "analysis_max_concurrency",
        "asr_beam_size",
        "analysis_progress_heartbeat_seconds",
        "chat_video_normalization_fps",
        "chat_video_max_dimension",
        "chat_model_file_expiry_hours",
        "chat_attachment_cleanup_interval_seconds",
        "teacher_assistant_max_message_chars",
        "teacher_assistant_max_history_messages",
        "teacher_assistant_max_history_message_chars",
        "teacher_assistant_max_context_days",
        "teacher_assistant_max_planning_rounds",
        "teacher_assistant_max_tool_calls",
        "teacher_assistant_max_students",
        "teacher_assistant_max_question_messages",
    )
    @classmethod
    def require_positive_chat_attachment_limits(cls, value: int) -> int:
        if value <= 0:
            raise ValueError("chat attachment limits must be positive")
        return value

    @field_validator(
        "teacher_assistant_tool_timeout_seconds",
        "teacher_assistant_provider_timeout_seconds",
    )
    @classmethod
    def require_positive_assistant_timeouts(cls, value: float) -> float:
        if value <= 0:
            raise ValueError("teacher assistant timeouts must be positive")
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
    def aliyun_pnvs_configured(self) -> bool:
        return all(
            (
                self.alibaba_cloud_access_key_id,
                self.alibaba_cloud_access_key_secret,
                self.aliyun_pnvs_sign_name,
                self.aliyun_pnvs_template_code,
            )
        )

    @property
    def llm_max_input_tokens(self) -> int:
        return int(self.llm_context_window_tokens * self.llm_context_safety_ratio)


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
