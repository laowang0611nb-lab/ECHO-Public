import pytest
from pydantic import ValidationError

from app.core.config import API_ROOT, PROJECT_ROOT, Settings, settings


def test_storage_root_is_absolute_and_project_scoped() -> None:
    assert settings.document_storage_root.is_absolute()
    assert settings.document_storage_root.is_relative_to(PROJECT_ROOT)
    assert API_ROOT.is_absolute()


def test_qwen_model_defaults_match_runtime_limits() -> None:
    assert settings.llm_model == "qwen3.8-flash"
    assert settings.chat_model == "qwen3.8-flash"
    assert settings.embedding_batch_size <= 10
    assert settings.llm_context_window_tokens == 1_000_000
    assert settings.llm_context_safety_ratio == 0.7
    assert settings.llm_max_input_tokens == 700_000


def test_llm_context_ratio_must_stay_below_full_window() -> None:
    with pytest.raises(ValidationError):
        Settings(_env_file=None, llm_context_safety_ratio=1.0)


def test_embedding_dimension_must_match_database_vector() -> None:
    with pytest.raises(ValidationError):
        Settings(_env_file=None, embedding_dimension=768)


def test_production_rejects_development_auth() -> None:
    with pytest.raises(ValidationError):
        Settings(
            _env_file=None,
            environment="production",
            development_auth_enabled=True,
        )


def test_development_auth_defaults_to_disabled() -> None:
    assert Settings.model_fields["development_auth_enabled"].default is False


def test_business_timezone_defaults_and_validates() -> None:
    assert Settings().business_timezone == "Asia/Shanghai"
    with pytest.raises(ValidationError):
        Settings(_env_file=None, business_timezone="Mars/Olympus")
