from __future__ import annotations

import json
from pathlib import Path
from uuid import UUID

import pytest
from database.db.base import Base
from database.models.chat import Conversation, Message, MessageCitation
from database.models.course import Course, CourseMember, CourseStatus
from database.models.document import Document, DocumentPage
from database.models.knowledge import Chapter, KnowledgeChunk, KnowledgePoint
from database.models.learning import (
    LearningEvent,
    LearningEventType,
    MasterySnapshot,
    QuickCheckAttempt,
    StudentKnowledgeState,
)
from database.models.planning import ExecutionPlan, TeachingStrategy
from database.models.resource import QuestionItem, question_item_knowledge_points
from database.models.review import AIReviewFlag, ReviewAnswerVersion, ReviewStatus
from database.models.user import User, UserRole
from database.seeds.seed_software_engineering_class import (
    COURSE_CODE,
    STUDENT_COUNT,
    reset_software_engineering_class,
    seed_software_engineering_class,
)
from pypdf import PdfReader
from sqlalchemy import event, func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine


@pytest.mark.asyncio
async def test_software_engineering_seed_is_complete_repeatable_and_resettable(
    tmp_path: Path,
) -> None:
    database_path = tmp_path / "se101_demo_test.db"
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

    try:
        async with factory() as session:
            first = await seed_software_engineering_class(
                session,
                storage_root=storage_root,
            )
        async with factory() as session:
            second = await seed_software_engineering_class(
                session,
                storage_root=storage_root,
            )

        assert first["course"] == second["course"]
        assert first["counts"] == second["counts"]
        assert first["students"] == second["students"]
        assert [
            resource["sha256"] for resource in first["resources"]
        ] == [
            resource["sha256"] for resource in second["resources"]
        ]

        counts = second["counts"]
        assert counts["courses"] == 1
        assert counts["students"] == STUDENT_COUNT == 48
        assert counts["members"] == 49
        assert counts["resources"] == 4
        assert counts["pages"] == 140
        assert counts["chapters"] == 12
        assert counts["knowledgePoints"] == 84
        assert counts["chunks"] == 140
        assert counts["embeddedChunks"] == 140
        assert counts["learningEvents"] == 2183
        assert counts["knowledgeStates"] == 4032
        assert counts["masterySnapshots"] == 28320
        assert counts["conversations"] == 144
        assert counts["messages"] == 768
        assert counts["citations"] == 384
        assert counts["reviews"] == 144
        assert counts["questions"] == 30
        assert counts["quickCheckAttempts"] == 480
        assert counts["strategies"] == 3
        assert counts["plans"] == 2
        assert counts["analyses"] == 4

        manifest_text = json.dumps(second, ensure_ascii=False)
        assert "password" not in manifest_text.casefold()
        assert "api_key" not in manifest_text.casefold()
        assert second["course"]["courseCode"] == COURSE_CODE
        assert second["course"]["courseName"] == "软件工程"

        course_id = UUID(second["course"]["courseId"])
        async with factory() as session:
            course = await session.get(Course, course_id)
            assert course is not None
            assert course.status == CourseStatus.PUBLISHED
            assert course.expected_student_count == 48

            documents = list(
                await session.scalars(
                    select(Document)
                    .where(Document.course_id == course_id)
                    .order_by(Document.created_at)
                )
            )
            assert len(documents) == 4
            ready_documents = [
                document
                for document in documents
                if document.status.value == "ready"
            ]
            assert len(ready_documents) == 3
            for document in documents:
                pdf_path = storage_root / document.storage_key
                assert pdf_path.is_file()
                assert pdf_path.stat().st_size == document.size_bytes
                reader = PdfReader(str(pdf_path))
                assert len(reader.pages) == next(
                    resource["pageCount"]
                    for resource in second["resources"]
                    if resource["resourceId"] == str(document.id)
                )
                assert (reader.pages[0].extract_text() or "").strip()

            main_text = (
                PdfReader(
                    str(
                        storage_root
                        / next(
                            document.storage_key
                            for document in documents
                            if document.original_name.startswith("软件工程核心")
                        )
                    )
                )
                .pages[0]
                .extract_text()
                or ""
            )
            assert "软件工程导论" in main_text
            assert "第 1 页" in main_text

            student_states = (
                await session.execute(
                    select(
                        StudentKnowledgeState.user_id,
                        func.count(StudentKnowledgeState.id),
                    )
                    .where(StudentKnowledgeState.course_id == course_id)
                    .group_by(StudentKnowledgeState.user_id)
                )
            ).all()
            assert len(student_states) == 48
            assert {int(count) for _, count in student_states} == {84}

            snapshot_count = int(
                await session.scalar(
                    select(func.count())
                    .select_from(MasterySnapshot)
                    .where(MasterySnapshot.course_id == course_id)
                )
                or 0
            )
            assert snapshot_count == 28320

            event_types = set(
                await session.scalars(
                    select(LearningEvent.event_type).where(
                        LearningEvent.course_id == course_id
                    )
                )
            )
            assert event_types == set(LearningEventType)

            review_statuses = set(
                await session.scalars(
                    select(AIReviewFlag.status).where(
                        AIReviewFlag.course_id == course_id
                    )
                )
            )
            assert review_statuses == set(ReviewStatus)

            sample_review_version = await session.scalar(
                select(ReviewAnswerVersion).limit(1)
            )
            assert sample_review_version is not None
            assert sample_review_version.citations
            assert set(sample_review_version.citations[0]) >= {
                "chunk_id",
                "document_id",
                "page_start",
                "page_end",
                "quote",
            }

            question_link_count = int(
                await session.scalar(
                    select(func.count()).select_from(question_item_knowledge_points)
                )
                or 0
            )
            assert question_link_count == 30

            assert (
                await session.scalar(
                    select(func.count()).select_from(Chapter).where(
                        Chapter.course_id == course_id
                    )
                )
                == 12
            )
            assert (
                await session.scalar(
                    select(func.count()).select_from(KnowledgePoint).where(
                        KnowledgePoint.course_id == course_id
                    )
                )
                == 84
            )
            assert (
                await session.scalar(
                    select(func.count()).select_from(KnowledgeChunk).where(
                        KnowledgeChunk.course_id == course_id
                    )
                )
                == 140
            )
            assert (
                await session.scalar(
                    select(func.count()).select_from(DocumentPage).where(
                        DocumentPage.document_id.in_(
                            select(Document.id).where(Document.course_id == course_id)
                        )
                    )
                )
                == 140
            )
            assert (
                await session.scalar(
                    select(func.count()).select_from(Conversation).where(
                        Conversation.course_id == course_id
                    )
                )
                == 144
            )
            assert (
                await session.scalar(
                    select(func.count()).select_from(Message).where(
                        Message.conversation_id.in_(
                            select(Conversation.id).where(
                                Conversation.course_id == course_id
                            )
                        )
                    )
                )
                == 768
            )
            assert (
                await session.scalar(
                    select(func.count()).select_from(MessageCitation).where(
                        MessageCitation.message_id.in_(
                            select(Message.id).where(
                                Message.conversation_id.in_(
                                    select(Conversation.id).where(
                                        Conversation.course_id == course_id
                                    )
                                )
                            )
                        )
                    )
                )
                == 384
            )
            assert (
                await session.scalar(
                    select(func.count()).select_from(TeachingStrategy).where(
                        TeachingStrategy.course_id == course_id
                    )
                )
                == 3
            )
            assert (
                await session.scalar(
                    select(func.count()).select_from(ExecutionPlan).where(
                        ExecutionPlan.course_id == course_id
                    )
                )
                == 2
            )
            assert (
                await session.scalar(
                    select(func.count()).select_from(QuestionItem).where(
                        QuestionItem.course_id == course_id
                    )
                )
                == 30
            )
            assert (
                await session.scalar(
                    select(func.count()).select_from(QuickCheckAttempt).where(
                        QuickCheckAttempt.course_id == course_id
                    )
                )
                == 480
            )

        unrelated_teacher = User(
            email="se101-unrelated@example.com",
            display_name="Unrelated Teacher",
            role=UserRole.TEACHER,
        )
        async with factory() as session:
            session.add(unrelated_teacher)
            await session.commit()
            unrelated_course = Course(
                name="Unrelated Course",
                status=CourseStatus.PUBLISHED,
                code="UNRELSE1",
                created_by=unrelated_teacher.id,
            )
            session.add(unrelated_course)
            await session.commit()

        async with factory() as session:
            await reset_software_engineering_class(session, storage_root)

        async with factory() as session:
            assert await session.get(Course, course_id) is None
            assert (
                await session.scalar(
                    select(func.count()).select_from(Course).where(
                        Course.code == "UNRELSE1"
                    )
                )
                == 1
            )
            assert await session.get(User, unrelated_teacher.id) is not None
            for model in (
                CourseMember,
                Document,
                DocumentPage,
                Chapter,
                KnowledgePoint,
                KnowledgeChunk,
                LearningEvent,
                StudentKnowledgeState,
                MasterySnapshot,
                Conversation,
                Message,
                MessageCitation,
                AIReviewFlag,
                TeachingStrategy,
                ExecutionPlan,
                QuestionItem,
                QuickCheckAttempt,
            ):
                count = int(
                    await session.scalar(
                        select(func.count())
                        .select_from(model)
                    )
                    or 0
                )
                assert count == 0
        assert not (storage_root / "courses" / str(course_id)).exists()
    finally:
        await engine.dispose()
