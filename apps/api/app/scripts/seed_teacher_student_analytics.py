import argparse
import asyncio
import json
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import UUID, uuid5

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import PROJECT_ROOT
from app.db.base import Base
from app.db.session import async_session_factory
from app.db.session import engine as default_engine
from app.models.chat import Conversation, Message, MessageCitation, MessageRole
from app.models.course import Course, CourseMember, CourseStatus
from app.models.document import Document, DocumentPage, DocumentStatus
from app.models.knowledge import Chapter, KnowledgeChunk, KnowledgePoint
from app.models.learning import (
    LearningEvent,
    LearningEventType,
    MasterySnapshot,
    StudentKnowledgeState,
)
from app.models.review import (
    AIReviewFlag,
    ReviewReason,
    ReviewSeverity,
    ReviewStatus,
)
from app.models.user import User, UserRole

SEED_NAMESPACE = UUID("6edf8df4-0db6-4d39-9f54-9fd3a4cb13c7")
DEMO_COURSE_ID = uuid5(SEED_NAMESPACE, "course:software-engineering")
DEMO_TEACHER_ID = uuid5(SEED_NAMESPACE, "user:teacher")
DEMO_DOCUMENT_ID = uuid5(SEED_NAMESPACE, "document:software-engineering-demo")
TARGET_MESSAGE_ID = uuid5(SEED_NAMESPACE, "message:target")
CONVERSATION_STUDENT_KEYS = ("student01", "student09")


@dataclass(frozen=True)
class StudentProfile:
    key: str
    display_name: str
    band: str
    base_score: float | None


STUDENT_PROFILES = (
    StudentProfile("student01", "张晨", "high", 88.0),
    StudentProfile("student02", "李雨桐", "high", 92.0),
    StudentProfile("student03", "王浩然", "high", 85.0),
    StudentProfile("student04", "陈思远", "medium", 74.0),
    StudentProfile("student05", "赵可欣", "medium", 71.0),
    StudentProfile("student06", "周子墨", "medium", 67.0),
    StudentProfile("student07", "刘佳宁", "attention", 59.0),
    StudentProfile("student08", "孙宇航", "attention", 54.0),
    StudentProfile("student09", "黄晓雨", "low", 42.0),
    StudentProfile("student10", "吴一凡", "insufficient", None),
)

CHAPTER_DEFINITIONS = (
    (
        "chapter_basics",
        "软件测试基础",
        (
            ("testing_goal", "软件测试目标", "验证软件是否满足需求并发现缺陷。"),
            ("black_box", "黑盒测试", "只关注输入与输出，不依赖内部实现。"),
            ("white_box", "白盒测试", "基于代码结构与执行路径设计测试。"),
            ("test_case", "测试用例", "由前置条件、步骤、输入和预期结果组成。"),
        ),
    ),
    (
        "chapter_equivalence",
        "等价类与边界值",
        (
            ("equivalence_partition", "等价类划分", "把输入域划分为若干等价类。"),
            ("valid_class", "有效等价类", "符合规格说明的合法输入集合。"),
            ("invalid_class", "无效等价类", "不符合规格说明的输入集合。"),
            ("boundary_value", "边界值分析", "重点检查输入域边界及邻近值。"),
        ),
    ),
    (
        "chapter_process",
        "测试流程与度量",
        (
            ("test_planning", "测试计划", "确定范围、策略、资源和进度。"),
            ("test_execution", "测试执行", "按用例执行测试并记录结果。"),
            ("defect_lifecycle", "缺陷生命周期", "缺陷从发现到关闭的状态流转。"),
            ("coverage", "覆盖率", "衡量测试对需求、代码或风险的覆盖程度。"),
        ),
    ),
)

CONVERSATION_TITLES = (
    "黑盒测试与白盒测试的区别",
    "等价类划分和边界值分析",
    "软件测试流程复盘",
)


def _seed_id(kind: str, key: str) -> UUID:
    return uuid5(SEED_NAMESPACE, f"{kind}:{key}")


def _student_user_id(key: str) -> UUID:
    return _seed_id("user", key)


def _conversation_id(student_key: str, index: int) -> UUID:
    return _seed_id("conversation", f"{student_key}:{index}")


def _message_id(student_key: str, conversation_index: int, message_index: int) -> UUID:
    if student_key == "student01" and conversation_index == 0 and message_index == 5:
        return TARGET_MESSAGE_ID
    return _seed_id(
        "message",
        f"{student_key}:{conversation_index}:{message_index}",
    )


def _event_id(student_key: str, index: int) -> UUID:
    return _seed_id("event", f"{student_key}:{index}")


def _state_id(student_key: str, point_key: str) -> UUID:
    return _seed_id("state", f"{student_key}:{point_key}")


def _snapshot_id(student_key: str, point_key: str, index: int) -> UUID:
    return _seed_id("snapshot", f"{student_key}:{point_key}:{index}")


async def _get_or_create_course(
    session: AsyncSession,
    requested_course_id: UUID | None,
    creator_id: UUID,
) -> Course:
    course_id = requested_course_id or DEMO_COURSE_ID
    course = await session.get(Course, course_id)
    if course is not None:
        if requested_course_id is None:
            course.name = "软件工程 / ECHO 演示课程"
        return course
    if requested_course_id is not None:
        raise ValueError(f"Course not found: {requested_course_id}")
    course = Course(
        id=DEMO_COURSE_ID,
        name="软件工程 / ECHO 演示课程",
        description="用于教师端学生学情、完整对话、知识点和教材来源闭环验证。",
        term="2026 秋季",
        status=CourseStatus.PUBLISHED,
        code=f"E{DEMO_COURSE_ID.int % 10_000_000:07d}",
        created_by=creator_id,
    )
    session.add(course)
    return course


async def _get_or_create_teacher(session: AsyncSession, course: Course) -> User:
    teacher_id = await session.scalar(
        select(CourseMember.user_id).where(
            CourseMember.course_id == course.id,
            CourseMember.role == UserRole.TEACHER,
        )
    )
    if teacher_id is not None:
        teacher = await session.get(User, teacher_id)
        if teacher is not None:
            return teacher
    teacher = await session.get(User, DEMO_TEACHER_ID)
    if teacher is None:
        teacher = User(
            id=DEMO_TEACHER_ID,
            email="demo.teacher@example.com",
            display_name="演示教师",
            role=UserRole.TEACHER,
        )
        session.add(teacher)
        await session.flush()
    membership = await session.scalar(
        select(CourseMember).where(
            CourseMember.course_id == course.id,
            CourseMember.user_id == teacher.id,
        )
    )
    if membership is None:
        session.add(
            CourseMember(
                course_id=course.id,
                user_id=teacher.id,
                role=UserRole.TEACHER,
            )
        )
    return teacher


async def _clear_previous_seed(session: AsyncSession, course_id: UUID) -> None:
    student_ids = [_student_user_id(profile.key) for profile in STUDENT_PROFILES]
    conversation_ids = [
        _conversation_id(student_key, index)
        for student_key in CONVERSATION_STUDENT_KEYS
        for index in range(len(CONVERSATION_TITLES))
    ]
    await session.execute(
        delete(AIReviewFlag).where(
            AIReviewFlag.course_id == course_id,
            AIReviewFlag.student_id.in_(student_ids),
        )
    )
    await session.execute(
        delete(MessageCitation).where(
            MessageCitation.message_id.in_(
                select(Message.id).where(Message.conversation_id.in_(conversation_ids))
            )
        )
    )
    await session.execute(
        delete(LearningEvent).where(
            LearningEvent.course_id == course_id,
            LearningEvent.user_id.in_(student_ids),
        )
    )
    await session.execute(
        delete(MasterySnapshot).where(
            MasterySnapshot.course_id == course_id,
            MasterySnapshot.user_id.in_(student_ids),
        )
    )
    await session.execute(
        delete(StudentKnowledgeState).where(
            StudentKnowledgeState.course_id == course_id,
            StudentKnowledgeState.user_id.in_(student_ids),
        )
    )
    await session.execute(delete(Message).where(Message.conversation_id.in_(conversation_ids)))
    await session.execute(delete(Conversation).where(Conversation.id.in_(conversation_ids)))
    await session.execute(
        delete(KnowledgeChunk).where(KnowledgeChunk.document_id == DEMO_DOCUMENT_ID)
    )
    await session.execute(delete(DocumentPage).where(DocumentPage.document_id == DEMO_DOCUMENT_ID))
    await session.execute(
        delete(KnowledgePoint).where(
            KnowledgePoint.chapter_id.in_(
                select(Chapter.id).where(Chapter.document_id == DEMO_DOCUMENT_ID)
            )
        )
    )
    await session.execute(delete(Chapter).where(Chapter.document_id == DEMO_DOCUMENT_ID))
    await session.execute(delete(Document).where(Document.id == DEMO_DOCUMENT_ID))
    await session.execute(
        delete(CourseMember).where(
            CourseMember.course_id == course_id,
            CourseMember.user_id.in_(student_ids),
        )
    )
    await session.flush()


async def _create_students(
    session: AsyncSession,
    course: Course,
    now: datetime,
) -> list[User]:
    students: list[User] = []
    for index, profile in enumerate(STUDENT_PROFILES):
        user_id = _student_user_id(profile.key)
        user = await session.get(User, user_id)
        if user is None:
            user = User(
                id=user_id,
                email=f"demo.{profile.key}@example.com",
                display_name=profile.display_name,
                role=UserRole.STUDENT,
            )
            session.add(user)
            await session.flush()
        else:
            user.display_name = profile.display_name
            user.email = f"demo.{profile.key}@example.com"
            user.role = UserRole.STUDENT
        joined_at = now - timedelta(days=70 - index * 3)
        membership = await session.scalar(
            select(CourseMember).where(
                CourseMember.course_id == course.id,
                CourseMember.user_id == user.id,
            )
        )
        if membership is None:
            membership = CourseMember(
                course_id=course.id,
                user_id=user.id,
                role=UserRole.STUDENT,
                joined_at=joined_at,
            )
            session.add(membership)
        else:
            membership.joined_at = joined_at
            membership.role = UserRole.STUDENT
        students.append(user)
    await session.flush()
    return students


async def _create_resource(
    session: AsyncSession, course: Course, teacher: User
) -> tuple[Document, list[KnowledgeChunk]]:
    document = Document(
        id=DEMO_DOCUMENT_ID,
        course_id=course.id,
        uploaded_by=teacher.id,
        original_name="软件工程测试教材_演示.pdf",
        storage_key=f"seed/{course.id}/software-testing-demo.pdf",
        content_type="application/pdf",
        size_bytes=1024 * 1024,
        status=DocumentStatus.READY,
        page_count=6,
    )
    session.add(document)
    page_texts = (
        "软件测试的目标是验证需求实现并尽可能早地发现缺陷。",
        "黑盒测试从输入输出行为验证功能，不依赖代码实现。",
        "白盒测试关注代码结构、分支和路径覆盖。",
        "等价类划分把输入划分为有效等价类和无效等价类。",
        "边界值分析重点检查最小值、最大值及邻近边界。",
        "测试计划、执行、缺陷跟踪和覆盖率共同构成测试闭环。",
    )
    session.add_all(
        [
            DocumentPage(
                document_id=document.id,
                page_number=index,
                text=text,
                char_count=len(text),
            )
            for index, text in enumerate(page_texts, start=1)
        ]
    )
    chunks = [
        KnowledgeChunk(
            id=_seed_id("chunk", f"chunk-{index}"),
            course_id=course.id,
            document_id=document.id,
            chunk_index=index,
            page_start=index * 2 + 1,
            page_end=index * 2 + 2,
            content="\n".join(page_texts[index * 2 : index * 2 + 2]),
            char_count=sum(len(text) for text in page_texts[index * 2 : index * 2 + 2]),
            metadata_json={"source": "seed_document", "page_range": [index * 2 + 1, index * 2 + 2]},
        )
        for index in range(3)
    ]
    session.add_all(chunks)
    await session.flush()
    return document, chunks


async def _create_structure(
    session: AsyncSession,
    course: Course,
    document: Document,
) -> tuple[list[Chapter], list[KnowledgePoint]]:
    chapters: list[Chapter] = []
    points: list[KnowledgePoint] = []
    for chapter_index, (chapter_key, title, point_definitions) in enumerate(CHAPTER_DEFINITIONS):
        chapter = Chapter(
            id=_seed_id("chapter", chapter_key),
            course_id=course.id,
            document_id=document.id,
            title=title,
            summary=f"{title}演示章节",
            order_index=chapter_index,
        )
        session.add(chapter)
        await session.flush()
        chapters.append(chapter)
        for point_index, (point_key, name, description) in enumerate(point_definitions):
            point = KnowledgePoint(
                id=_seed_id("point", point_key),
                course_id=course.id,
                chapter_id=chapter.id,
                name=name,
                description=description,
                order_index=point_index,
            )
            session.add(point)
            points.append(point)
    await session.flush()
    return chapters, points


def _event_types_for_student(index: int) -> list[LearningEventType]:
    event_types = list(LearningEventType)
    return [event_types[(index + offset) % len(event_types)] for offset in range(8)]


async def _create_conversations_and_messages(
    session: AsyncSession,
    course: Course,
    teacher: User,
    students: list[User],
    points: list[KnowledgePoint],
    chunks: list[KnowledgeChunk],
    now: datetime,
) -> dict[str, object]:
    conversations: list[Conversation] = []
    messages: list[Message] = []
    citations: list[MessageCitation] = []
    flags: list[AIReviewFlag] = []
    first_user_messages: dict[str, list[Message]] = {}
    message_knowledge_point_ids: dict[str, list[str]] = {}

    for student_key in CONVERSATION_STUDENT_KEYS:
        student = next(user for user in students if user.id == _student_user_id(student_key))
        for conversation_index, title in enumerate(CONVERSATION_TITLES):
            conversation = Conversation(
                id=_conversation_id(student_key, conversation_index),
                course_id=course.id,
                user_id=student.id,
                title=title,
                created_at=now - timedelta(days=18 - conversation_index * 5),
                updated_at=now - timedelta(days=17 - conversation_index * 5),
            )
            session.add(conversation)
            await session.flush()
            conversations.append(conversation)
            point = points[(conversation_index * 4) % len(points)]
            conversation_messages: list[Message] = []
            for message_index in range(9):
                role = MessageRole.USER if message_index % 2 == 0 else MessageRole.ASSISTANT
                if role == MessageRole.USER:
                    content = (
                        f"请解释一下“{point.name}”，并说明在软件测试中的应用。"
                        if message_index == 0
                        else "这个解释我还是没解决，请换一种方式说明。"
                        if message_index == 8
                        else f"那么“{point.name}”在实际项目中应该怎么判断？"
                    )
                else:
                    content = f"“{point.name}”需要结合输入范围、预期行为和测试目标理解 [1]。"
                message = Message(
                    id=_message_id(student_key, conversation_index, message_index),
                    conversation_id=conversation.id,
                    role=role,
                    content=content,
                    created_at=conversation.created_at + timedelta(minutes=message_index * 3),
                )
                session.add(message)
                conversation_messages.append(message)
                message_knowledge_point_ids[str(message.id)] = [str(point.id)]
            await session.flush()
            messages.extend(conversation_messages)
            first_user_messages.setdefault(student_key, []).append(conversation_messages[0])
            message_knowledge_point_ids[str(conversation_messages[0].id)] = [str(point.id)]
            message_knowledge_point_ids[str(conversation_messages[1].id)] = [str(point.id)]

            citation_message = conversation_messages[1]
            citation_chunk = chunks[conversation_index % len(chunks)]
            citations.append(
                MessageCitation(
                    message_id=citation_message.id,
                    citation_index=1,
                    chunk_id=citation_chunk.id,
                    document_id=citation_chunk.document_id,
                    page_start=citation_chunk.page_start,
                    page_end=citation_chunk.page_end,
                    quote=citation_chunk.content[:120],
                )
            )

    target_message = await session.get(Message, TARGET_MESSAGE_ID)
    assert target_message is not None
    target_point_id = message_knowledge_point_ids[str(target_message.id)][0]
    target_chunk = chunks[0]
    target_citation = MessageCitation(
        message_id=target_message.id,
        citation_index=1,
        chunk_id=target_chunk.id,
        document_id=target_chunk.document_id,
        page_start=target_chunk.page_start,
        page_end=target_chunk.page_end,
        quote=target_chunk.content[:120],
    )
    citations.append(target_citation)
    student01_messages = [
        message
        for message in messages
        if message.conversation_id == _conversation_id("student01", 0)
    ]
    student09_messages = [
        message
        for message in messages
        if message.conversation_id == _conversation_id("student09", 0)
    ]
    flags.extend(
        [
            AIReviewFlag(
                id=_seed_id("flag", "open"),
                course_id=course.id,
                conversation_id=target_message.conversation_id,
                message_id=target_message.id,
                student_id=_student_user_id("student01"),
                reason=ReviewReason.STUDENT_NOT_RESOLVED,
                severity=ReviewSeverity.HIGH,
                status=ReviewStatus.OPEN,
                details={
                    "seed": True,
                    "knowledge_point_ids": [target_point_id],
                    "citations": [
                        {
                            "chunk_id": str(target_citation.chunk_id),
                            "document_id": str(target_citation.document_id),
                            "page_start": target_citation.page_start,
                            "page_end": target_citation.page_end,
                        }
                    ],
                },
            ),
            AIReviewFlag(
                id=_seed_id("flag", "confirmed"),
                course_id=course.id,
                conversation_id=student01_messages[1].conversation_id,
                message_id=student01_messages[1].id,
                student_id=_student_user_id("student01"),
                reason=ReviewReason.MISSING_COURSE_BASIS,
                severity=ReviewSeverity.MEDIUM,
                status=ReviewStatus.CONFIRMED_CORRECT,
                details={"seed": True},
                reviewed_by=teacher.id,
                reviewed_at=now - timedelta(days=2),
            ),
            AIReviewFlag(
                id=_seed_id("flag", "incorrect"),
                course_id=course.id,
                conversation_id=student09_messages[1].conversation_id,
                message_id=student09_messages[1].id,
                student_id=_student_user_id("student09"),
                reason=ReviewReason.OUTSIDE_MATERIAL_HEAVY,
                severity=ReviewSeverity.HIGH,
                status=ReviewStatus.MARKED_INCORRECT,
                details={"seed": True},
                teacher_note="回答偏离了教材定义。",
                corrected_answer="应按教材中的输入范围和预期行为重新解释。",
                reviewed_by=teacher.id,
                reviewed_at=now - timedelta(days=1),
            ),
        ]
    )
    session.add_all(citations + flags)
    await session.flush()
    return {
        "conversations": conversations,
        "messages": messages,
        "citations": citations,
        "flags": flags,
        "first_user_messages": first_user_messages,
        "message_knowledge_point_ids": message_knowledge_point_ids,
    }


async def _create_learning_data(
    session: AsyncSession,
    course: Course,
    students: list[User],
    points: list[KnowledgePoint],
    conversation_data: dict[str, object],
    now: datetime,
) -> tuple[list[LearningEvent], list[StudentKnowledgeState], list[MasterySnapshot]]:
    events: list[LearningEvent] = []
    states: list[StudentKnowledgeState] = []
    snapshots: list[MasterySnapshot] = []
    first_user_messages = conversation_data["first_user_messages"]
    assert isinstance(first_user_messages, dict)

    for student_index, (profile, student) in enumerate(
        zip(STUDENT_PROFILES, students, strict=True)
    ):
        for event_index, event_type in enumerate(_event_types_for_student(student_index)):
            knowledge_point = points[(student_index + event_index) % len(points)]
            days_ago = (
                8 + event_index * 2
                if profile.base_score is None
                else 1 + (event_index * 3 + student_index) % 28
            )
            message_id: UUID | None = None
            conversation_id: UUID | None = None
            if profile.key in CONVERSATION_STUDENT_KEYS and event_index < 3:
                message = first_user_messages[profile.key][event_index]
                message_id = message.id
                conversation_id = message.conversation_id
                knowledge_point = points[(event_index * 4) % len(points)]
                event_type = LearningEventType.QUESTION_ASKED
            event = LearningEvent(
                id=_event_id(profile.key, event_index),
                course_id=course.id,
                user_id=student.id,
                knowledge_point_id=knowledge_point.id,
                conversation_id=conversation_id,
                message_id=message_id,
                event_type=event_type,
                weight=1.0,
                evidence=f"{profile.display_name}的{event_type.value}演示证据",
                metadata_json={"seed": True},
                created_at=now - timedelta(days=days_ago, hours=event_index),
            )
            session.add(event)
            events.append(event)
        if profile.key in {"student01", "student09"}:
            for extra_index, (evidence, metadata) in enumerate(
                (
                    (
                        "教师将掌握度修正为 72 分。",
                        {"adjustment_type": "mastery_correction", "target_score": 72},
                    ),
                    (
                        "教师备注：该学生能理解定义，但需要加强边界条件判断。",
                        {"adjustment_type": "teacher_note"},
                    ),
                ),
                start=8,
            ):
                event = LearningEvent(
                    id=_event_id(profile.key, extra_index),
                    course_id=course.id,
                    user_id=student.id,
                    knowledge_point_id=points[(extra_index * 3) % len(points)].id,
                    event_type=LearningEventType.TEACHER_ADJUSTMENT,
                    weight=1.0,
                    evidence=evidence,
                    metadata_json={"seed": True, **metadata},
                    created_at=now - timedelta(days=3 + extra_index),
                )
                session.add(event)
                events.append(event)
        await session.flush()

        if profile.base_score is None:
            continue
        for point_index, point in enumerate(points):
            final_score = max(
                0.0,
                min(100.0, profile.base_score + (-5 if point_index % 2 else 4)),
            )
            state = StudentKnowledgeState(
                id=_state_id(profile.key, str(point_index)),
                course_id=course.id,
                user_id=student.id,
                knowledge_point_id=point.id,
                score=final_score,
            )
            session.add(state)
            states.append(state)
            for snapshot_index, days_ago in enumerate((21, 14, 7, 0)):
                progress_score = max(
                    0.0,
                    min(100.0, final_score - (3 - snapshot_index) * 4),
                )
                snapshot = MasterySnapshot(
                    id=_snapshot_id(profile.key, str(point_index), snapshot_index),
                    course_id=course.id,
                    user_id=student.id,
                    knowledge_point_id=point.id,
                    score=progress_score,
                    created_at=now - timedelta(days=days_ago),
                )
                session.add(snapshot)
                snapshots.append(snapshot)
    await session.flush()
    return events, states, snapshots


async def seed_teacher_student_analytics(
    session: AsyncSession,
    requested_course_id: UUID | None,
) -> dict[str, object]:
    creator = await session.get(User, DEMO_TEACHER_ID)
    if creator is None:
        creator = User(
            id=DEMO_TEACHER_ID,
            email="demo.teacher@example.com",
            display_name="演示教师",
            role=UserRole.TEACHER,
        )
        session.add(creator)
        await session.flush()
    else:
        creator.email = "demo.teacher@example.com"
        creator.display_name = "演示教师"
    course = await _get_or_create_course(session, requested_course_id, creator.id)
    await _clear_previous_seed(session, course.id)
    course = await _get_or_create_course(session, course.id, creator.id)
    teacher = await _get_or_create_teacher(session, course)
    students = await _create_students(session, course, datetime.now(UTC))
    document, chunks = await _create_resource(session, course, teacher)
    chapters, points = await _create_structure(session, course, document)
    now = datetime.now(UTC)
    conversation_data = await _create_conversations_and_messages(
        session,
        course,
        teacher,
        students,
        points,
        chunks,
        now,
    )
    events, states, snapshots = await _create_learning_data(
        session,
        course,
        students,
        points,
        conversation_data,
        now,
    )
    await session.commit()

    conversations = conversation_data["conversations"]
    messages = conversation_data["messages"]
    citations = conversation_data["citations"]
    flags = conversation_data["flags"]
    assert isinstance(conversations, list)
    assert isinstance(messages, list)
    assert isinstance(citations, list)
    assert isinstance(flags, list)
    conversation_ids = [conversation.id for conversation in conversations]
    message_ids = [message.id for message in messages]
    knowledge_point_ids = [point.id for point in points]
    resource_ids = [document.id]
    chunk_ids = [chunk.id for chunk in chunks]
    active_cutoff = datetime.now(UTC) - timedelta(days=7)
    active_student_ids = {
        str(event.user_id) for event in events if event.created_at >= active_cutoff
    }
    return {
        "courseId": str(course.id),
        "courseName": course.name,
        "courseCode": course.code,
        "teacherUserId": str(teacher.id),
        "teacherEmail": teacher.email,
        "studentIds": [str(student.id) for student in students],
        "conversationIds": [str(conversation_id) for conversation_id in conversation_ids],
        "messageIds": [str(message_id) for message_id in message_ids],
        "knowledgePointIds": [str(point_id) for point_id in knowledge_point_ids],
        "resourceIds": [str(resource_id) for resource_id in resource_ids],
        "chunkIds": [str(chunk_id) for chunk_id in chunk_ids],
        "targetMessageId": str(TARGET_MESSAGE_ID),
        "students": [
            {
                "userId": str(student.id),
                "displayName": student.display_name,
                "band": profile.band,
                "joinedAt": (now - timedelta(days=70 - index * 3)).isoformat(),
                "activeLast7Days": str(student.id) in active_student_ids,
            }
            for index, (profile, student) in enumerate(zip(STUDENT_PROFILES, students, strict=True))
        ],
        "chapters": [
            {
                "chapterId": str(chapter.id),
                "chapterTitle": chapter.title,
                "knowledgePoints": [
                    {
                        "knowledgePointId": str(point.id),
                        "knowledgePointName": point.name,
                    }
                    for point in points
                    if point.chapter_id == chapter.id
                ],
            }
            for chapter in chapters
        ],
        "events": [
            {
                "eventId": str(event.id),
                "studentId": str(event.user_id),
                "knowledgePointId": str(event.knowledge_point_id)
                if event.knowledge_point_id
                else None,
                "eventType": event.event_type.value,
                "weight": event.weight,
                "evidence": event.evidence,
                "createdAt": event.created_at.isoformat(),
            }
            for event in events
        ],
        "masteryStates": [
            {
                "stateId": str(state.id),
                "studentId": str(state.user_id),
                "knowledgePointId": str(state.knowledge_point_id),
                "score": state.score,
            }
            for state in states
        ],
        "snapshots": [
            {
                "snapshotId": str(snapshot.id),
                "studentId": str(snapshot.user_id),
                "knowledgePointId": str(snapshot.knowledge_point_id),
                "score": snapshot.score,
                "createdAt": snapshot.created_at.isoformat(),
            }
            for snapshot in snapshots
        ],
        "reviews": [
            {
                "flagId": str(flag.id),
                "conversationId": str(flag.conversation_id),
                "messageId": str(flag.message_id),
                "studentId": str(flag.student_id),
                "status": flag.status.value,
                "reason": flag.reason.value,
            }
            for flag in flags
        ],
    }


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Seed teacher student analytics demo data.")
    parser.add_argument("--course-id", type=UUID, default=None)
    parser.add_argument("--database-url", default=None)
    parser.add_argument(
        "--output",
        type=Path,
        default=PROJECT_ROOT / "tmp" / "teacher_student_analytics_seed.json",
    )
    return parser.parse_args()


async def main() -> None:
    args = _parse_args()
    active_engine = (
        create_async_engine(args.database_url) if args.database_url is not None else default_engine
    )
    factory = (
        async_sessionmaker(active_engine, expire_on_commit=False)
        if args.database_url is not None
        else async_session_factory
    )
    if args.database_url is not None and args.database_url.startswith("sqlite"):
        async with active_engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
    try:
        async with factory() as session:
            result = await seed_teacher_student_analytics(session, args.course_id)
    finally:
        await active_engine.dispose()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
