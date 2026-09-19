from datetime import UTC, datetime
from typing import Annotated
from uuid import UUID

import jwt
from database.auth.tokens import decode_access_token
from database.db.session import get_db_session
from database.models.auth import AuthSession
from database.models.user import User, UserStatus
from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.services.aliyun_pnvs import AliyunPnvsProvider
from app.services.chat_provider import QwenChatProvider
from app.services.embedding import QwenEmbeddingProvider
from app.services.llm import QwenKnowledgeStructureProvider
from app.services.storage import LocalDocumentStorage

DBSession = Annotated[AsyncSession, Depends(get_db_session)]


def get_document_storage() -> LocalDocumentStorage:
    return LocalDocumentStorage(settings.document_storage_root)


DocumentStorageDep = Annotated[LocalDocumentStorage, Depends(get_document_storage)]


def get_avatar_storage() -> LocalDocumentStorage:
    return LocalDocumentStorage(settings.avatar_storage_root)


AvatarStorageDep = Annotated[LocalDocumentStorage, Depends(get_avatar_storage)]


def get_aliyun_pnvs_provider() -> AliyunPnvsProvider:
    return AliyunPnvsProvider(
        access_key_id=settings.alibaba_cloud_access_key_id,
        access_key_secret=settings.alibaba_cloud_access_key_secret,
        sign_name=settings.aliyun_pnvs_sign_name,
        template_code=settings.aliyun_pnvs_template_code,
        country_code=settings.aliyun_pnvs_country_code,
        valid_time=settings.aliyun_pnvs_valid_time,
        interval=settings.aliyun_pnvs_interval,
        timeout_seconds=settings.aliyun_pnvs_timeout_seconds,
    )


AliyunPnvsProviderDep = Annotated[
    AliyunPnvsProvider,
    Depends(get_aliyun_pnvs_provider),
]


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
    authorization: Annotated[str | None, Header(alias="Authorization")] = None,
    x_user_id: Annotated[str | None, Header(alias="X-User-Id")] = None,
) -> User:
    if authorization is not None and authorization.strip():
        scheme, _, token = authorization.partition(" ")
        if scheme.lower() != "bearer" or not token.strip():
            raise _invalid_user_header()
        try:
            claims = decode_access_token(token.strip())
            user_id = UUID(str(claims["sub"]))
            session_id = claims.get("sid")
        except (KeyError, ValueError, jwt.InvalidTokenError):
            raise _invalid_user_header() from None
        if session_id is not None:
            try:
                auth_session = await session.get(AuthSession, UUID(str(session_id)))
            except ValueError:
                raise _invalid_user_header() from None
            if (
                auth_session is None
                or auth_session.user_id != user_id
                or auth_session.revoked_at is not None
                or _as_utc(auth_session.expires_at) <= datetime.now(UTC)
            ):
                raise _invalid_user_header()
        user = await session.get(User, user_id)
        if user is None or user.status != UserStatus.ACTIVE:
            raise _invalid_user_header()
        return user

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


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _invalid_user_header() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Missing or invalid X-User-Id",
        headers={"WWW-Authenticate": "X-User-Id"},
    )
