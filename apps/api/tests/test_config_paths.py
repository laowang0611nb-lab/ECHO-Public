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
