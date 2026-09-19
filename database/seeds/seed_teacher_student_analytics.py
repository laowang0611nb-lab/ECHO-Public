import argparse
import asyncio
import json
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import UUID, uuid5

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import selectinload

from database.config import PROJECT_ROOT
from database.db.base import Base
from database.db.session import async_session_factory
from database.db.session import engine as default_engine
from database.models.chat import Conversation, Message, MessageCitation, MessageRole
from database.models.course import Course, CourseMember, CourseStatus
from database.models.document import Document, DocumentPage, DocumentStatus
from database.models.knowledge import Chapter, KnowledgeChunk, KnowledgePoint
from database.models.learning import (
    LearningEvent,
    LearningEventType,
    MasterySnapshot,
    StudentKnowledgeState,
)
from database.models.planning import (
    ExecutionPlan,
    ExecutionPlanGeneration,
    ExecutionPlanStatus,
    ExecutionPlanWeek,
    PlanTargetScope,
    PlanTask,
    PlanTaskStatus,
    PlanTaskType,
    TeachingStrategy,
    TeachingStrategyHistoryAction,
    TeachingStrategyPriority,
    TeachingStrategySource,
    TeachingStrategyStatus,
    TeachingStrategyType,
    TeachingStrategyVersion,
    plan_target_knowledge_points,
    plan_target_students,
    plan_task_knowledge_points,
    plan_task_target_students,
    strategy_target_knowledge_points,
    strategy_target_students,
)
from database.models.resource import (
    QuestionDifficulty,
    QuestionItem,
    QuestionType,
)
from database.models.review import (
    AIReviewFlag,
    ReviewReason,
    ReviewSeverity,
    ReviewStatus,
)
from database.models.user import User, UserRole

SEED_NAMESPACE = UUID("6edf8df4-0db6-4d39-9f54-9fd3a4cb13c7")
DEMO_COURSE_ID = uuid5(SEED_NAMESPACE, "course:software-engineering")
DEMO_TEACHER_ID = uuid5(SEED_NAMESPACE, "user:teacher")
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

QUICK_CHECK_DEFINITIONS = (
    (
        "black_box",
        "快速检测：黑盒测试",
        "以下哪项更适合用黑盒测试发现？",
        [
            {"id": "a", "label": "代码中的空指针异常"},
            {"id": "b", "label": "功能不符合需求"},
            {"id": "c", "label": "未覆盖的条件分支"},
            {"id": "d", "label": "循环边界错误"},
        ],
        "b",
        "黑盒测试不依赖内部代码结构，主要根据输入和输出行为发现功能不符合需求的问题。",
        [
            "先想一想：黑盒测试是否需要阅读程序内部代码？",
            "排除必须查看代码结构才能判断的选项，再看哪一个体现外部功能行为。",
        ],
    ),
    (
        "white_box",
        "快速检测：白盒测试",
        "白盒测试最直接的依据是什么？",
        [
            {"id": "a", "label": "程序的内部结构和执行路径"},
            {"id": "b", "label": "用户是否满意"},
            {"id": "c", "label": "页面颜色是否统一"},
            {"id": "d", "label": "需求文档的排版"},
        ],
        "a",
        "白盒测试围绕代码结构、分支和路径设计测试用例。",
        [
            "回忆白盒测试为什么叫“白盒”。",
            "它关注的是代码内部还是软件外部表现？",
        ],
    ),
    (
        "equivalence_partition",
        "快速检测：等价类划分",
        "等价类划分的主要目的是什么？",
        [
            {"id": "a", "label": "把所有输入都一一穷举"},
            {"id": "b", "label": "用少量代表值覆盖输入集合"},
            {"id": "c", "label": "只测试最大值"},
            {"id": "d", "label": "只检查代码格式"},
        ],
        "b",
        "等价类划分把输入域分成若干类，并从每类选择具有代表性的值。",
        [
            "先想：等价类划分是为了减少还是增加测试输入数量？",
            "它强调代表值，还是穷举所有值？",
        ],
    ),
    (
        "boundary_value",
        "快速检测：边界值分析",
        "边界值分析通常重点测试什么？",
        [
            {"id": "a", "label": "任意随机输入"},
            {"id": "b", "label": "最小值、最大值及其邻近值"},
            {"id": "c", "label": "代码注释数量"},
            {"id": "d", "label": "界面字体大小"},
        ],
        "b",
        "边界值分析关注输入范围的边界以及边界附近的取值。",
        [
            "想一想：输入范围最容易出现什么问题？",
            "优先检查最小值、最大值以及它们相邻的取值。",
        ],
    ),
)


def _seed_id(kind: str, key: str) -> UUID:
    return uuid5(SEED_NAMESPACE, f"{kind}:{key}")


def _scoped_id(course_id: UUID, kind: str, key: str) -> UUID:
    return uuid5(SEED_NAMESPACE, f"course:{course_id}:{kind}:{key}")


def _document_id(course_id: UUID) -> UUID:
    return _scoped_id(course_id, "document", "software-engineering-demo")


def _strategy_id(course_id: UUID) -> UUID:
    return _scoped_id(course_id, "strategy", "boundary-value-demo")


def _plan_id(course_id: UUID) -> UUID:
    return _scoped_id(course_id, "plan", "boundary-value-demo")


def _week_id(course_id: UUID, week_number: int) -> UUID:
    return _scoped_id(course_id, "plan-week", f"{week_number}")


def _task_id(course_id: UUID, task_key: str) -> UUID:
    return _scoped_id(course_id, "plan-task", task_key)


def _target_message_id(course_id: UUID) -> UUID:
    return _scoped_id(course_id, "message", "target")


def _student_user_id(key: str) -> UUID:
    return _seed_id("user", key)


async def _get_or_create_user(
    session: AsyncSession,
    *,
    email: str,
    display_name: str,
    role: UserRole,
    seed_id: UUID,
) -> User:
    user = await session.scalar(select(User).where(User.email == email))
    if user is None:
        user = await session.get(User, seed_id)
    if user is None:
        user = User(
            id=seed_id,
            email=email,
            display_name=display_name,
            role=role,
        )
        session.add(user)
        await session.flush()
        return user
    user.email = email
    user.display_name = display_name
    user.role = role
    return user


def _conversation_id(course_id: UUID, student_key: str, index: int) -> UUID:
    return _scoped_id(course_id, "conversation", f"{student_key}:{index}")


def _message_id(
    course_id: UUID,
    student_key: str,
    conversation_index: int,
    message_index: int,
) -> UUID:
    if student_key == "student01" and conversation_index == 0 and message_index == 5:
        return _target_message_id(course_id)
    return _scoped_id(
        course_id,
        "message",
        f"{student_key}:{conversation_index}:{message_index}",
    )


def _event_id(course_id: UUID, student_key: str, index: int) -> UUID:
    return _scoped_id(course_id, "event", f"{student_key}:{index}")


def _state_id(course_id: UUID, student_key: str, point_key: str) -> UUID:
    return _scoped_id(course_id, "state", f"{student_key}:{point_key}")


def _snapshot_id(course_id: UUID, student_key: str, point_key: str, index: int) -> UUID:
    return _scoped_id(course_id, "snapshot", f"{student_key}:{point_key}:{index}")


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


async def _get_or_create_teacher(
    session: AsyncSession,
    course: Course,
    fallback_teacher: User,
) -> User:
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
    teacher = fallback_teacher
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


async def _clear_previous_seed(
    session: AsyncSession,
    course_id: UUID,
    student_ids: list[UUID],
) -> None:
    conversation_ids = [
        _conversation_id(course_id, student_key, index)
        for student_key in CONVERSATION_STUDENT_KEYS
        for index in range(len(CONVERSATION_TITLES))
    ]
    document_id = _document_id(course_id)
    await session.execute(
        delete(CourseMember).where(
            CourseMember.course_id == course_id,
            CourseMember.role == UserRole.STUDENT,
            CourseMember.user_id.not_in(student_ids),
        )
    )
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
    plan_ids = select(ExecutionPlan.id).where(ExecutionPlan.course_id == course_id)
    task_ids = select(PlanTask.id).where(PlanTask.plan_id.in_(plan_ids))
    strategy_ids = select(TeachingStrategy.id).where(
        TeachingStrategy.course_id == course_id
    )
    await session.execute(
        delete(plan_task_knowledge_points).where(
            plan_task_knowledge_points.c.task_id.in_(task_ids)
        )
    )
    await session.execute(
        delete(plan_task_target_students).where(
            plan_task_target_students.c.task_id.in_(task_ids)
        )
    )
    await session.execute(
        delete(plan_target_knowledge_points).where(
            plan_target_knowledge_points.c.plan_id.in_(plan_ids)
        )
    )
    await session.execute(
        delete(plan_target_students).where(
            plan_target_students.c.plan_id.in_(plan_ids)
        )
    )
    await session.execute(
        delete(strategy_target_knowledge_points).where(
            strategy_target_knowledge_points.c.strategy_id.in_(strategy_ids)
        )
    )
    await session.execute(
        delete(strategy_target_students).where(
            strategy_target_students.c.strategy_id.in_(strategy_ids)
        )
    )
    await session.execute(delete(PlanTask).where(PlanTask.plan_id.in_(plan_ids)))
    await session.execute(
        delete(ExecutionPlanWeek).where(ExecutionPlanWeek.plan_id.in_(plan_ids))
    )
    await session.execute(
        delete(ExecutionPlanGeneration).where(
            ExecutionPlanGeneration.plan_id.in_(plan_ids)
        )
    )
    await session.execute(delete(ExecutionPlan).where(ExecutionPlan.course_id == course_id))
    await session.execute(
        delete(TeachingStrategyVersion).where(
            TeachingStrategyVersion.strategy_id.in_(strategy_ids)
        )
    )
    await session.execute(
        delete(TeachingStrategy).where(TeachingStrategy.course_id == course_id)
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
    await session.execute(
        delete(Message).where(Message.conversation_id.in_(conversation_ids))
    )
    await session.execute(
        delete(Conversation).where(Conversation.id.in_(conversation_ids))
    )
    await session.execute(
        delete(KnowledgeChunk).where(KnowledgeChunk.document_id == document_id)
    )
    await session.execute(
        delete(DocumentPage).where(DocumentPage.document_id == document_id)
    )
    await session.execute(
        delete(KnowledgePoint).where(
            KnowledgePoint.chapter_id.in_(
                select(Chapter.id).where(Chapter.document_id == document_id)
            )
        )
    )
    await session.execute(delete(Chapter).where(Chapter.document_id == document_id))
    await session.execute(delete(Document).where(Document.id == document_id))
    await session.flush()


async def _create_students(
    session: AsyncSession,
    course: Course,
    now: datetime,
) -> list[User]:
    students: list[User] = []
    for index, profile in enumerate(STUDENT_PROFILES):
        user = await _get_or_create_user(
            session,
            email=f"demo.{profile.key}@example.com",
            display_name=profile.display_name,
            role=UserRole.STUDENT,
            seed_id=_student_user_id(profile.key),
        )
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
        id=_document_id(course.id),
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
            id=_scoped_id(course.id, "chunk", f"chunk-{index}"),
            course_id=course.id,
            document_id=document.id,
            chunk_index=index,
            page_start=index * 2 + 1,
            page_end=index * 2 + 2,
            content="\n".join(page_texts[index * 2 : index * 2 + 2]),
            char_count=sum(len(text) for text in page_texts[index * 2 : index * 2 + 2]),
            metadata_json={
                "source": "seed_document",
                "page_range": [index * 2 + 1, index * 2 + 2],
            },
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
    for chapter_index, (chapter_key, title, point_definitions) in enumerate(
        CHAPTER_DEFINITIONS
    ):
        chapter = Chapter(
            id=_scoped_id(course.id, "chapter", chapter_key),
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
                id=_scoped_id(course.id, "point", point_key),
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


async def _create_quick_check_items(
    session: AsyncSession,
    course: Course,
    teacher: User,
    points: list[KnowledgePoint],
) -> list[QuestionItem]:
    points_by_key = {point.name: point for point in points}
    key_to_name = {
        "black_box": "黑盒测试",
        "white_box": "白盒测试",
        "equivalence_partition": "等价类划分",
        "boundary_value": "边界值分析",
    }
    items: list[QuestionItem] = []
    for (
        point_key,
        title,
        prompt,
        options,
        correct_option_id,
        explanation,
        hints,
    ) in QUICK_CHECK_DEFINITIONS:
        point = points_by_key.get(key_to_name[point_key])
        if point is None:
            continue
        item_id = _scoped_id(course.id, "question", point_key)
        item = await session.scalar(
            select(QuestionItem)
            .options(selectinload(QuestionItem.knowledge_points))
            .where(QuestionItem.id == item_id)
        )
        metadata = {
            "options": options,
            "correct_option_id": correct_option_id,
            "hint_levels": hints,
            "max_attempts": 2,
            "generated": False,
            "knowledge_point_id": str(point.id),
        }
        if item is None:
            item = QuestionItem(
                id=item_id,
                course_id=course.id,
                type=QuestionType.SINGLE_CHOICE,
                difficulty=QuestionDifficulty.EASY,
                title=title,
                content=prompt,
                answer=correct_option_id,
                explanation=explanation,
                metadata_json=metadata,
                created_by=teacher.id,
            )
            session.add(item)
        else:
            item.title = title
            item.content = prompt
            item.answer = correct_option_id
            item.explanation = explanation
            item.metadata_json = metadata
            item.trashed_at = None
        item.knowledge_points = [point]
        items.append(item)
    await session.flush()
    return items


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
        student_index = next(
            index
            for index, profile in enumerate(STUDENT_PROFILES)
            if profile.key == student_key
        )
        student = students[student_index]
        for conversation_index, title in enumerate(CONVERSATION_TITLES):
            conversation = Conversation(
                id=_conversation_id(course.id, student_key, conversation_index),
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
                role = (
                    MessageRole.USER
                    if message_index % 2 == 0
                    else MessageRole.ASSISTANT
                )
                if role == MessageRole.USER:
                    content = (
                        f"请解释一下“{point.name}”，并说明在软件测试中的应用。"
                        if message_index == 0
                        else "这个解释我还是没解决，请换一种方式说明。"
                        if message_index == 8
                        else f"那么“{point.name}”在实际项目中应该怎么判断？"
                    )
                else:
                    content = (
                        f"“{point.name}”需要结合输入范围、预期行为和测试目标理解 [1]。"
                    )
                message = Message(
                    id=_message_id(
                        course.id,
                        student_key,
                        conversation_index,
                        message_index,
                    ),
                    conversation_id=conversation.id,
                    role=role,
                    content=content,
                    created_at=conversation.created_at
                    + timedelta(minutes=message_index * 3),
                )
                session.add(message)
                conversation_messages.append(message)
                message_knowledge_point_ids[str(message.id)] = [str(point.id)]
            await session.flush()
            messages.extend(conversation_messages)
            first_user_messages.setdefault(student_key, []).append(
                conversation_messages[0]
            )
            message_knowledge_point_ids[str(conversation_messages[0].id)] = [
                str(point.id)
            ]
            message_knowledge_point_ids[str(conversation_messages[1].id)] = [
                str(point.id)
            ]

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

    target_message = await session.get(Message, _target_message_id(course.id))
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
        if message.conversation_id == _conversation_id(course.id, "student01", 0)
    ]
    student09_messages = [
        message
        for message in messages
        if message.conversation_id == _conversation_id(course.id, "student09", 0)
    ]
    students_by_key = {
        profile.key: student
        for profile, student in zip(STUDENT_PROFILES, students, strict=True)
    }
    flags.extend(
        [
            AIReviewFlag(
                id=_scoped_id(course.id, "flag", "open"),
                course_id=course.id,
                conversation_id=target_message.conversation_id,
                message_id=target_message.id,
                student_id=students_by_key["student01"].id,
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
                id=_scoped_id(course.id, "flag", "confirmed"),
                course_id=course.id,
                conversation_id=student01_messages[1].conversation_id,
                message_id=student01_messages[1].id,
                student_id=students_by_key["student01"].id,
                reason=ReviewReason.MISSING_COURSE_BASIS,
                severity=ReviewSeverity.MEDIUM,
                status=ReviewStatus.CONFIRMED_CORRECT,
                details={"seed": True},
                reviewed_by=teacher.id,
                reviewed_at=now - timedelta(days=2),
            ),
            AIReviewFlag(
                id=_scoped_id(course.id, "flag", "incorrect"),
                course_id=course.id,
                conversation_id=student09_messages[1].conversation_id,
                message_id=student09_messages[1].id,
                student_id=students_by_key["student09"].id,
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
        for event_index, event_type in enumerate(
            _event_types_for_student(student_index)
        ):
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
                id=_event_id(course.id, profile.key, event_index),
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
                    id=_event_id(course.id, profile.key, extra_index),
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
                id=_state_id(course.id, profile.key, str(point_index)),
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
                    id=_snapshot_id(
                        course.id,
                        profile.key,
                        str(point_index),
                        snapshot_index,
                    ),
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


async def _create_demo_planning_data(
    session: AsyncSession,
    course: Course,
    teacher: User,
    students: list[User],
    points: list[KnowledgePoint],
    document: Document,
    states: list[StudentKnowledgeState],
    now: datetime,
) -> tuple[TeachingStrategy, ExecutionPlan, list[PlanTask]]:
    target_point = next(
        (point for point in points if point.name == "边界值分析"),
        points[-1],
    )
    target_students = students[:6]
    resource_ref = [
        {
            "id": str(document.id),
            "title": document.original_name,
            "resource_type": "textbook",
        }
    ]

    strategy = TeachingStrategy(
        id=_strategy_id(course.id),
        course_id=course.id,
        title="边界值分析强化教学策略",
        description="DEMO 演示数据：围绕边界值分析开展概念讲解、专项练习和 Quick Check，展示教师采纳策略并跟踪学习效果的完整闭环。",
        type=TeachingStrategyType.CONTENT_ADJUSTMENT,
        priority=TeachingStrategyPriority.HIGH,
        status=TeachingStrategyStatus.ACTIVE,
        source=TeachingStrategySource.AI_GENERATED,
        version=2,
        goals=["理解边界值与邻近值", "能独立设计边界测试用例", "减少边界判断重复错误"],
        teaching_methods=[
            {"name": "概念讲解", "weight": 0.35},
            {"name": "案例演示", "weight": 0.35},
            {"name": "专项练习", "weight": 0.3},
        ],
        teaching_flow=[
            {"order": 1, "title": "课前诊断", "description": "读取目标知识点的真实掌握证据。"},
            {"order": 2, "title": "课堂讲解", "description": "围绕边界值和邻近值进行对比讲解。"},
            {"order": 3, "title": "专项练习", "description": "安排有效、无效和边界输入练习。"},
            {"order": 4, "title": "快速验证", "description": "用 Quick Check 检查迁移能力。"},
            {"order": 5, "title": "效果复盘", "description": "根据学习事件评估是否需要二次干预。"},
        ],
        personalization_rules=["根据掌握度调整练习难度", "对重复错误学生提供额外讲解"],
        ai_rules=["涉及课程材料时展示来源", "无法确认时进入教师审核"],
        expected_effect={
            "summary": "DEMO 演示数据：预期提升边界条件识别与用例设计表现，不代表真实学生结果。",
            "impact": 0.12,
            "metrics": [{"metric": "quick_check_accuracy", "demo": True}],
        },
        generated_context={"demo": True, "source": "seeded_demo"},
        resources_json=resource_ref,
        created_by=teacher.id,
        updated_by=teacher.id,
        created_at=now - timedelta(days=14),
        updated_at=now - timedelta(days=2),
    )
    strategy.target_knowledge_points = [target_point]
    strategy.target_students = target_students
    session.add(strategy)
    await session.flush()
    session.add_all(
        [
            TeachingStrategyVersion(
                strategy_id=strategy.id,
                version=1,
                action=TeachingStrategyHistoryAction.GENERATED,
                snapshot_json={"demo": True, "status": "suggested", "version": 1},
                changed_by=teacher.id,
                created_at=now - timedelta(days=14),
            ),
            TeachingStrategyVersion(
                strategy_id=strategy.id,
                version=2,
                action=TeachingStrategyHistoryAction.ACTIVATE,
                snapshot_json={"demo": True, "status": "active", "version": 2},
                changed_by=teacher.id,
                created_at=now - timedelta(days=10),
            ),
        ]
    )

    plan = ExecutionPlan(
        id=_plan_id(course.id),
        course_id=course.id,
        strategy_id=strategy.id,
        title="边界值分析强化执行计划",
        description="DEMO 演示数据：把已采纳策略转化为课堂讲解、专项练习和 Quick Check。",
        status=ExecutionPlanStatus.ACTIVE,
        start_date=(now - timedelta(days=14)).date(),
        end_date=(now + timedelta(days=7)).date(),
        target_scope=PlanTargetScope.WHOLE_CLASS,
        actions=["classroom_lecture", "supplementary_practice", "quick_check"],
        plan_parameters={"demo": True, "weekly_sessions": 2, "difficulty": "medium"},
        evaluation_metrics=["quick_check_accuracy", "mastery_change"],
        resources_json=resource_ref,
        teacher_note="DEMO 演示数据，仅用于比赛演示与稳定复现。",
        created_by=teacher.id,
        updated_by=teacher.id,
        created_at=now - timedelta(days=14),
        updated_at=now - timedelta(days=2),
    )
    plan.target_students = target_students
    plan.knowledge_points = [target_point]
    session.add(plan)
    await session.flush()

    week_one = ExecutionPlanWeek(
        id=_week_id(course.id, 1),
        plan_id=plan.id,
        week_number=1,
        start_date=(now - timedelta(days=14)).date(),
        end_date=(now - timedelta(days=8)).date(),
        content="DEMO：完成边界值概念讲解，并组织第一轮专项练习。",
        knowledge_point_ids=[str(target_point.id)],
        resources_json=resource_ref,
    )
    week_two = ExecutionPlanWeek(
        id=_week_id(course.id, 2),
        plan_id=plan.id,
        week_number=2,
        start_date=(now - timedelta(days=7)).date(),
        end_date=(now + timedelta(days=7)).date(),
        content="DEMO：通过 Quick Check 和学习事件观察掌握变化。",
        knowledge_point_ids=[str(target_point.id)],
        resources_json=resource_ref,
    )
    session.add_all([week_one, week_two])
    await session.flush()

    completed_task = PlanTask(
        id=_task_id(course.id, "practice"),
        plan_id=plan.id,
        week_id=week_one.id,
        week_number=1,
        order_index=0,
        title="边界值专项练习",
        description="DEMO：完成边界值与邻近值专项练习。",
        type=PlanTaskType.SUPPLEMENTARY_PRACTICE,
        status=PlanTaskStatus.COMPLETED,
        due_at=now - timedelta(days=8),
        resources_json=resource_ref,
        created_by=teacher.id,
    )
    completed_task.knowledge_points = [target_point]
    completed_task.target_students = target_students
    active_task = PlanTask(
        id=_task_id(course.id, "quick-check"),
        plan_id=plan.id,
        week_id=week_two.id,
        week_number=2,
        order_index=0,
        title="边界条件 Quick Check",
        description="DEMO：用 Quick Check 观察目标知识点的迁移表现。",
        type=PlanTaskType.QUICK_CHECK,
        status=PlanTaskStatus.IN_PROGRESS,
        due_at=now + timedelta(days=2),
        resources_json=resource_ref,
        created_by=teacher.id,
    )
    active_task.knowledge_points = [target_point]
    active_task.target_students = target_students
    session.add_all([completed_task, active_task])
    await session.flush()

    state_by_student = {
        state.user_id: state
        for state in states
        if state.knowledge_point_id == target_point.id
    }
    for index, student in enumerate(target_students[:4]):
        is_correct = index != 1
        event_type = (
            LearningEventType.QUIZ_CORRECT
            if is_correct
            else LearningEventType.QUIZ_WRONG
        )
        created_at = now - timedelta(days=6 - index)
        event = LearningEvent(
            id=_scoped_id(course.id, "plan-event", student.email),
            course_id=course.id,
            user_id=student.id,
            knowledge_point_id=target_point.id,
            plan_id=plan.id,
            task_id=completed_task.id,
            week_number=1,
            event_type=event_type,
            weight=1.0,
            evidence="DEMO 演示数据：学生完成边界值 Quick Check。",
            metadata_json={"seed": True, "demo": True},
            created_at=created_at,
        )
        session.add(event)
        state = state_by_student.get(student.id)
        if state is not None:
            state.score = max(
                0.0,
                min(100.0, state.score + (6.0 if is_correct else -4.0)),
            )
            session.add(
                MasterySnapshot(
                    course_id=course.id,
                    user_id=student.id,
                    knowledge_point_id=target_point.id,
                    source_event_id=event.id,
                    score=state.score,
                    created_at=created_at + timedelta(hours=1),
                )
            )
    await session.flush()
    return strategy, plan, [completed_task, active_task]

async def seed_teacher_student_analytics(
    session: AsyncSession,
    requested_course_id: UUID | None,
) -> dict[str, object]:
    creator = await _get_or_create_user(
        session,
        email="demo.teacher@example.com",
        display_name="演示教师",
        role=UserRole.TEACHER,
        seed_id=DEMO_TEACHER_ID,
    )
    course = await _get_or_create_course(session, requested_course_id, creator.id)
    teacher = await _get_or_create_teacher(session, course, creator)
    students = await _create_students(session, course, datetime.now(UTC))
    await _clear_previous_seed(
        session,
        course.id,
        [student.id for student in students],
    )
    document, chunks = await _create_resource(session, course, teacher)
    chapters, points = await _create_structure(session, course, document)
    quick_check_items = await _create_quick_check_items(
        session,
        course,
        teacher,
        points,
    )
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
    strategy, plan, plan_tasks = await _create_demo_planning_data(
        session,
        course,
        teacher,
        students,
        points,
        document,
        states,
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
        "conversationIds": [
            str(conversation_id) for conversation_id in conversation_ids
        ],
        "messageIds": [str(message_id) for message_id in message_ids],
        "knowledgePointIds": [str(point_id) for point_id in knowledge_point_ids],
        "resourceIds": [str(resource_id) for resource_id in resource_ids],
        "chunkIds": [str(chunk_id) for chunk_id in chunk_ids],
        "quickCheckQuestionIds": [str(item.id) for item in quick_check_items],
        "targetMessageId": str(_target_message_id(course.id)),
        "strategyId": str(strategy.id),
        "planId": str(plan.id),
        "planTaskIds": [str(task.id) for task in plan_tasks],
        "students": [
            {
                "userId": str(student.id),
                "displayName": student.display_name,
                "band": profile.band,
                "joinedAt": (now - timedelta(days=70 - index * 3)).isoformat(),
                "activeLast7Days": str(student.id) in active_student_ids,
            }
            for index, (profile, student) in enumerate(
                zip(STUDENT_PROFILES, students, strict=True)
            )
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
    parser = argparse.ArgumentParser(
        description="Seed teacher student analytics demo data."
    )
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
        create_async_engine(args.database_url)
        if args.database_url is not None
        else default_engine
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
    args.output.write_text(
        json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
