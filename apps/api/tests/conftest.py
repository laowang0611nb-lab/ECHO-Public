from collections.abc import AsyncIterator
from pathlib import Path

import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.api.dependencies import (
    get_chat_provider,
    get_document_storage,
    get_embedding_provider,
    get_knowledge_structure_provider,
)
from app.db.base import Base
from app.db.session import get_db_session
from app.main import app
from app.schemas.knowledge import ChapterDraft, KnowledgePointDraft
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


class FakeChatProvider:
    def __init__(self, answer: str = "Echo [1] answer") -> None:
        self.answer = answer
        self.last_messages: list[dict[str, str]] = []

    async def stream(self, messages: list[dict[str, str]]):
        self.last_messages = messages
        yield self.answer


class FakeEmbeddingProvider:
    async def embed(self, texts: list[str]) -> list[list[float]]:
        return [self._vector(text) for text in texts]

    @staticmethod
    def _vector(text: str) -> list[float]:
        vector = [0.0] * 1024
        normalized = text.casefold()
        if "alpha" in normalized:
            vector[0] = 1.0
        elif "beta" in normalized:
            vector[1] = 1.0
        else:
            vector[2] = 1.0
        return vector


class FakeKnowledgeStructureProvider:
    async def generate(self, pages: list[str]) -> list[ChapterDraft]:
        return [
            ChapterDraft(
                title="Chapter 1",
                summary="Generated chapter",
                knowledge_points=[
                    KnowledgePointDraft(name="Point 1", description="First point"),
                    KnowledgePointDraft(name="Point 2", description="Second point"),
                ],
            ),
            ChapterDraft(
                title="Chapter 2",
                summary=None,
                knowledge_points=[KnowledgePointDraft(name="Point 3")],
            ),
        ]


@pytest_asyncio.fixture
async def knowledge_provider() -> AsyncIterator[FakeKnowledgeStructureProvider]:
    provider = FakeKnowledgeStructureProvider()
    app.dependency_overrides[get_knowledge_structure_provider] = lambda: provider
    try:
        yield provider
    finally:
        app.dependency_overrides.pop(get_knowledge_structure_provider, None)


@pytest_asyncio.fixture
async def embedding_provider() -> AsyncIterator[FakeEmbeddingProvider]:
    provider = FakeEmbeddingProvider()
    app.dependency_overrides[get_embedding_provider] = lambda: provider
    try:
        yield provider
    finally:
        app.dependency_overrides.pop(get_embedding_provider, None)


@pytest_asyncio.fixture
async def chat_provider() -> AsyncIterator[FakeChatProvider]:
    provider = FakeChatProvider()
    app.dependency_overrides[get_chat_provider] = lambda: provider
    try:
        yield provider
    finally:
        app.dependency_overrides.pop(get_chat_provider, None)


@pytest_asyncio.fixture
async def client(
    session_factory: async_sessionmaker[AsyncSession],
    document_storage: LocalDocumentStorage,
    chat_provider: FakeChatProvider,
    embedding_provider: FakeEmbeddingProvider,
    knowledge_provider: FakeKnowledgeStructureProvider,
) -> AsyncIterator[AsyncClient]:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as test_client:
        yield test_client
