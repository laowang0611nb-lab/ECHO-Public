from collections.abc import AsyncIterator
from pathlib import Path

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.api.dependencies import get_document_storage
from app.db.base import Base
from app.db.session import get_db_session
from app.main import app
from app.services.storage import LocalDocumentStorage


@pytest_asyncio.fixture
async def session_factory() -> AsyncIterator[async_sessionmaker[AsyncSession]]:
    engine = create_async_engine(
        "sqlite+aiosqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

    factory = async_sessionmaker(engine, expire_on_commit=False)

    async def override_get_db_session() -> AsyncIterator[AsyncSession]:
        async with factory() as session:
            yield session

    app.dependency_overrides[get_db_session] = override_get_db_session
    try:
        yield factory
    finally:
        app.dependency_overrides.pop(get_db_session, None)
        await engine.dispose()


@pytest_asyncio.fixture
async def document_storage(tmp_path: Path) -> AsyncIterator[LocalDocumentStorage]:
    storage = LocalDocumentStorage(tmp_path / "uploads")
    app.dependency_overrides[get_document_storage] = lambda: storage
    try:
        yield storage
    finally:
        app.dependency_overrides.pop(get_document_storage, None)


@pytest_asyncio.fixture
async def client(
    session_factory: async_sessionmaker[AsyncSession],
    document_storage: LocalDocumentStorage,
) -> AsyncIterator[AsyncClient]:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as test_client:
        yield test_client
