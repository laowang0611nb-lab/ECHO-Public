from typing import Annotated
from uuid import UUID

from database.db.session import get_db_session
from database.models.user import User
from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.services.chat_provider import QwenChatProvider
from app.services.embedding import QwenEmbeddingProvider
from app.services.llm import QwenKnowledgeStructureProvider
from app.services.storage import LocalDocumentStorage

DBSession = Annotated[AsyncSession, Depends(get_db_session)]


def get_document_storage() -> LocalDocumentStorage:
    return LocalDocumentStorage(settings.document_storage_root)


DocumentStorageDep = Annotated[LocalDocumentStorage, Depends(get_document_storage)]


def get_knowledge_structure_provider() -> QwenKnowledgeStructureProvider:
    return QwenKnowledgeStructureProvider(
        api_key=settings.llm_api_key,
        base_url=settings.llm_base_url,
        model=settings.llm_model,
        timeout_seconds=settings.llm_timeout_seconds,
        max_input_tokens=settings.llm_max_input_tokens,
        batch_overlap_tokens=settings.llm_batch_overlap_tokens,
        max_output_tokens=settings.llm_max_output_tokens,
    )


KnowledgeProviderDep = Annotated[
    QwenKnowledgeStructureProvider,
    Depends(get_knowledge_structure_provider),
]


def get_embedding_provider() -> QwenEmbeddingProvider:
    return QwenEmbeddingProvider(
        api_key=settings.embedding_api_key,
        base_url=settings.embedding_base_url,
        model=settings.embedding_model,
        dimension=settings.embedding_dimension,
        timeout_seconds=settings.llm_timeout_seconds,
        batch_size=settings.embedding_batch_size,
    )


EmbeddingProviderDep = Annotated[
    QwenEmbeddingProvider,
    Depends(get_embedding_provider),
]


def get_chat_provider() -> QwenChatProvider:
    return QwenChatProvider(
        api_key=settings.chat_api_key,
        base_url=settings.chat_base_url,
        model=settings.chat_model,
        timeout_seconds=settings.chat_timeout_seconds,
    )


ChatProviderDep = Annotated[
    QwenChatProvider,
    Depends(get_chat_provider),
]


async def get_current_user(
    session: DBSession,
    x_user_id: Annotated[str | None, Header(alias="X-User-Id")] = None,
) -> User:
    if not settings.development_auth_enabled:
        raise _invalid_user_header()
    if x_user_id is None or not x_user_id.strip():
        raise _invalid_user_header()

    try:
        user_id = UUID(x_user_id)
    except ValueError:
        raise _invalid_user_header() from None

    user = await session.get(User, user_id)
    if user is None:
        raise _invalid_user_header()
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def _invalid_user_header() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Missing or invalid X-User-Id",
        headers={"WWW-Authenticate": "X-User-Id"},
    )
