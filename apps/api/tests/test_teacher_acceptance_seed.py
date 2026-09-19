from __future__ import annotations

import json
from pathlib import Path
from uuid import UUID

import pytest
from database.db.base import Base
from database.models.chat import Conversation, Message, MessageCitation
from database.models.course import Course, CourseMember, CourseStatus
from database.models.document import Document, DocumentPage
from database.models.knowledge import KnowledgeChunk
from database.models.learning import LearningEvent, LearningEventType
from database.models.review import AIReviewFlag, ReviewStatus
from database.models.user import User, UserRole
from database.seeds.seed_teacher_acceptance import (
    AcceptanceSeedConfig,
    reset_teacher_acceptance,
    seed_teacher_acceptance,
)
from pypdf import PdfReader
from sqlalchemy import event, func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine


def _acceptance_config() -> AcceptanceSeedConfig:
    return AcceptanceSeedConfig(
        course_count=4,
        student_count=12,
        target_event_count=400,
        target_message_count=32,
        pdf_page_count=100,
        snapshot_points=8,
        conversations_per_course=1,
    )


@pytest.mark.asyncio
async def test_teacher_acceptance_seed_is_repeatable_and_resettable(tmp_path: Path) -> None:
    database_path = tmp_path / "teacher_acceptance_test.db"
    storage_root = tmp_path / "uploads"
    engine = create_async_engine(f"sqlite+aiosqlite:///{database_path}")

    @event.listens_for(engine.sync_engine, "connect")
    def enable_foreign_keys(dbapi_connection: object, _: object) -> None:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

    config = _acceptance_config()
    try:
        async with factory() as session:
            first = await seed_teacher_acceptance(
                session,
                storage_root=storage_root,
                config=config,
                strict_validation=False,
            )
        async with factory() as session:
            second = await seed_teacher_acceptance(
                session,
                storage_root=storage_root,
                config=config,
                strict_validation=False,
            )

        assert first.manifest["courses"][0]["courseId"] == second.manifest["courses"][0]["courseId"]
        assert first.counts == second.counts
        assert second.counts["courses"] == 4
        assert second.counts["students"] == 12
        assert second.counts["events"] == 400
        assert second.counts["messages"] == 32
        assert second.counts["chunks"] > 1_000
        assert second.counts["embeddedChunks"] == second.counts["chunks"]
        assert second.counts["snapshots"] == 12 * 6 * 8 * 4

        manifest_text = json.dumps(second.manifest, ensure_ascii=False)
        assert "password" not in manifest_text.casefold()
        assert "api_key" not in manifest_text.casefold()

        async with factory() as session:
            big_document_id = UUID(second.manifest["fixedIds"]["bigDocumentId"])
            document = await session.get(Document, big_document_id)
            assert document is not None
            pdf_path = storage_root / document.storage_key
            assert pdf_path.is_file()
            assert pdf_path.stat().st_size == document.size_bytes
            reader = PdfReader(str(pdf_path))
            assert len(reader.pages) == 100
            assert "ECHO Teacher Acceptance Material" in (reader.pages[0].extract_text() or "")

            chunk = await session.scalar(
                select(KnowledgeChunk)
                .where(KnowledgeChunk.document_id == big_document_id)
                .order_by(KnowledgeChunk.chunk_index)
                .limit(1)
            )
            assert chunk is not None
            assert chunk.embedding is not None
            assert len(chunk.embedding) == 1024

            event_types = set(
                await session.scalars(
                    select(LearningEvent.event_type).where(
                        LearningEvent.course_id == UUID(second.manifest["courses"][0]["courseId"])
                    )
                )
            )
            assert {
                LearningEventType.QUIZ_CORRECT,
                LearningEventType.QUIZ_WRONG,
                LearningEventType.REPEATED_ERROR,
                LearningEventType.CONCEPT_CONFUSION,
                LearningEventType.TEACHER_ADJUSTMENT,
            } <= event_types

            review_statuses = set(await session.scalars(select(AIReviewFlag.status)))
            assert {
                ReviewStatus.OPEN,
                ReviewStatus.CONFIRMED_CORRECT,
                ReviewStatus.MARKED_INCORRECT,
            } <= review_statuses

            message_count = int(
                await session.scalar(select(func.count()).select_from(Message)) or 0
            )
            citation_count = int(
                await session.scalar(select(func.count()).select_from(MessageCitation)) or 0
            )
            conversation_count = int(
                await session.scalar(select(func.count()).select_from(Conversation)) or 0
            )
            assert message_count == 32
            assert citation_count == 16
            assert conversation_count == 4

        unrelated_user = User(
            email="acceptance-unrelated@example.com",
            display_name="Unrelated",
            role=UserRole.TEACHER,
        )
        async with factory() as session:
            session.add(unrelated_user)
            await session.commit()
            unrelated_course = Course(
                name="Unrelated Course",
                status=CourseStatus.PUBLISHED,
                code="UNREL001",
                created_by=unrelated_user.id,
            )
            session.add(unrelated_course)
            await session.commit()

        async with factory() as session:
            await reset_teacher_acceptance(
                session,
                config,
                strict_validation=False,
            )

        async with factory() as session:
            assert await session.scalar(select(func.count()).select_from(Course)) == 1
            assert (
                await session.get(Course, UUID(second.manifest["courses"][0]["courseId"])) is None
            )
            assert await session.get(User, unrelated_user.id) is not None
            for model in (
                CourseMember,
                Document,
                DocumentPage,
                KnowledgeChunk,
                LearningEvent,
                Conversation,
                Message,
                MessageCitation,
                AIReviewFlag,
            ):
                count = int(await session.scalar(select(func.count()).select_from(model)) or 0)
                assert count == 0
    finally:
        await engine.dispose()
