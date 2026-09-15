from typing import Annotated
from uuid import UUID

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import get_db_session
from app.models.user import User
from app.services.storage import LocalDocumentStorage

DBSession = Annotated[AsyncSession, Depends(get_db_session)]


def get_document_storage() -> LocalDocumentStorage:
    return LocalDocumentStorage(settings.document_storage_root)


DocumentStorageDep = Annotated[LocalDocumentStorage, Depends(get_document_storage)]


async def get_current_user(
    session: DBSession,
    x_user_id: Annotated[str | None, Header(alias="X-User-Id")] = None,
) -> User:
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
