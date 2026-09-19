from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import math
import re
import textwrap
import time
from collections import Counter
from collections.abc import Sequence
from dataclasses import asdict, dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any
from uuid import UUID, uuid5

from sqlalchemy import delete, event, func, insert, select
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from database.config import PROJECT_ROOT
from database.db.base import Base
from database.models.chat import (
    Conversation,
    Message,
    MessageCitation,
    MessageRole,
    MessageStatus,
    TeachingPolicy,
)
from database.models.course import Course, CourseMember, CourseStatus
from database.models.document import (
    Document,
    DocumentPage,
    DocumentStatus,
    ResourceType,
)
from database.models.knowledge import (
    Chapter,
    KnowledgeChunk,
    KnowledgePoint,
    KnowledgeRelation,
)
from database.models.learning import (
    LearningEvent,
    LearningEventType,
    MasterySnapshot,
    StudentKnowledgeState,
)
from database.models.planning import (
    ExecutionPlan,
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
from database.models.profile import StudentProfile, TeacherProfile
from database.models.resource import QuestionDifficulty, QuestionItem, QuestionType
from database.models.review import (
    AIReviewFlag,
    ReviewAnswerVersion,
    ReviewGenerationStatus,
    ReviewHistoryAction,
    ReviewHistoryEntry,
    ReviewReason,
    ReviewRegenerationRun,
    ReviewSeverity,
    ReviewStatus,
    ReviewVersionSource,
)
from database.models.user import User, UserRole, UserStatus

ACCEPTANCE_NAMESPACE = UUID("a7c521c5-19fa-4ce3-b4a0-7b8eaf1b3a91")
DEFAULT_DATASET_NAME = "teacher-acceptance-v1"
DEFAULT_COURSE_COUNT = 15
DEFAULT_STUDENT_COUNT = 300
DEFAULT_EVENT_COUNT = 24_000
DEFAULT_MESSAGE_COUNT = 6_000
DEFAULT_PDF_PAGE_COUNT = 140
DEFAULT_SNAPSHOT_POINTS = 12
DEFAULT_CONVERSATIONS_PER_COURSE = 50
DEFAULT_DATABASE_PATH = PROJECT_ROOT / "tmp" / "acceptance" / "teacher_acceptance.db"
DEFAULT_STORAGE_ROOT = PROJECT_ROOT / "tmp" / "acceptance" / "uploads"
DEFAULT_MANIFEST_PATH = PROJECT_ROOT / "tmp" / "acceptance" / "manifest.json"

BIG_DOCUMENT_COURSE_INDEX = 0
MESSAGE_ROLES = (
    MessageRole.USER,
    MessageRole.ASSISTANT,
    MessageRole.USER,
    MessageRole.ASSISTANT,
    MessageRole.USER,
    MessageRole.ASSISTANT,
    MessageRole.USER,
    MessageRole.ASSISTANT,
)
RESOLVED_MESSAGE_INDEXES = {7}
EVENT_TYPES = (
    LearningEventType.QUIZ_CORRECT,
    LearningEventType.QUIZ_WRONG,
    LearningEventType.REPEATED_ERROR,
    LearningEventType.QUIZ_CORRECT,
    LearningEventType.CONCEPT_CONFUSION,
    LearningEventType.HINT_REQUESTED,
    LearningEventType.RESOLVED,
    LearningEventType.REPEATED_ERROR,
    LearningEventType.QUIZ_CORRECT,
    LearningEventType.QUIZ_WRONG,
    LearningEventType.CONCEPT_CONFUSION,
    LearningEventType.TEACHER_ADJUSTMENT,
)
REVIEW_STATUSES = (
    ReviewStatus.OPEN,
    ReviewStatus.CONFIRMED_CORRECT,
    ReviewStatus.MARKED_INCORRECT,
    ReviewStatus.DISMISSED,
    ReviewStatus.PENDING_REREVIEW,
    ReviewStatus.GENERATING,
    ReviewStatus.REGENERATION_FAILED,
)
REVIEW_REASONS = (
    ReviewReason.MISSING_COURSE_BASIS,
    ReviewReason.OUTSIDE_MATERIAL_HEAVY,
    ReviewReason.REPEATED_FOLLOW_UP,
    ReviewReason.STUDENT_NOT_RESOLVED,
    ReviewReason.TEACHER_RULE_VIOLATION,
)
TOPIC_TEMPLATES = (
    "需求分析与测试目标",
    "黑盒测试方法",
    "白盒测试与路径覆盖",
    "等价类划分",
    "边界值分析",
    "测试用例设计",
    "缺陷生命周期",
    "回归测试",
    "性能与可靠性",
    "单元测试",
    "集成测试",
    "系统测试",
    "验收测试",
    "测试覆盖率",
    "风险驱动测试",
    "测试数据设计",
    "自动化测试",
    "代码审查",
    "质量度量",
    "测试报告",
)


@dataclass(frozen=True)
class AcceptanceSeedConfig:
    course_count: int = DEFAULT_COURSE_COUNT
    student_count: int = DEFAULT_STUDENT_COUNT
    target_event_count: int = DEFAULT_EVENT_COUNT
    target_message_count: int = DEFAULT_MESSAGE_COUNT
    pdf_page_count: int = DEFAULT_PDF_PAGE_COUNT
    snapshot_points: int = DEFAULT_SNAPSHOT_POINTS
    conversations_per_course: int = DEFAULT_CONVERSATIONS_PER_COURSE
    random_seed: int = 20260919

    def validate(self, *, strict: bool = True) -> None:
        if strict:
            if not 10 <= self.course_count <= 20:
                raise ValueError("course_count must be between 10 and 20")
            if not 200 <= self.student_count <= 500:
                raise ValueError("student_count must be between 200 and 500")
            if not 10_000 <= self.target_event_count <= 50_000:
                raise ValueError("target_event_count must be between 10000 and 50000")
            if self.target_message_count < 5_000:
                raise ValueError("target_message_count must be at least 5000")
        if not 1 <= self.course_count <= 20:
            raise ValueError("course_count must be between 1 and 20")
        if self.student_count < 1:
            raise ValueError("student_count must be positive")
        if self.target_event_count < self.course_count:
            raise ValueError("target_event_count must cover every course")
        if self.target_message_count < self.course_count * 8:
            raise ValueError(
                "target_message_count must leave one conversation per course"
            )
        if not 100 <= self.pdf_page_count <= 300 and strict:
            raise ValueError("pdf_page_count must be between 100 and 300")
        if not 8 <= self.snapshot_points <= 12 and strict:
            raise ValueError("snapshot_points must be between 8 and 12")
        if self.conversations_per_course < 1:
            raise ValueError("conversations_per_course must be positive")

    @property
    def messages_per_conversation(self) -> int:
        return 8

    @property
    def message_count(self) -> int:
        return (
            self.conversations_per_course
            * self.course_count
            * self.messages_per_conversation
        )

    @property
    def conversation_count(self) -> int:
        return self.conversations_per_course * self.course_count


@dataclass
class SeedResult:
    manifest: dict[str, Any]
    counts: dict[str, int]
    elapsed_seconds: float
    database_url: str
    storage_root: Path
    manifest_path: Path


def _seed_id(kind: str, *parts: object) -> UUID:
    key = ":".join(str(part) for part in parts)
    return uuid5(ACCEPTANCE_NAMESPACE, f"{kind}:{key}")


def _teacher_id() -> UUID:
    return _seed_id("user", "teacher")


def _student_id(index: int) -> UUID:
    return _seed_id("user", "student", f"{index:04d}")


def _course_id(index: int) -> UUID:
    return _seed_id("course", f"{index:03d}")


def _member_id(course_id: UUID, user_id: UUID) -> UUID:
    return _seed_id("member", course_id, user_id)


def _document_id(course_id: UUID) -> UUID:
    return _seed_id("document", course_id)


def _page_id(document_id: UUID, page_number: int) -> UUID:
    return _seed_id("page", document_id, page_number)


def _chunk_id(document_id: UUID, chunk_index: int) -> UUID:
    return _seed_id("chunk", document_id, chunk_index)


def _chapter_id(course_id: UUID, index: int) -> UUID:
    return _seed_id("chapter", course_id, index)


def _knowledge_point_id(course_id: UUID, index: int) -> UUID:
    return _seed_id("knowledge-point", course_id, index)


def _conversation_id(course_id: UUID, index: int) -> UUID:
    return _seed_id("conversation", course_id, index)


def _message_id(course_id: UUID, conversation_index: int, message_index: int) -> UUID:
    return _seed_id("message", course_id, conversation_index, message_index)


def _citation_id(message_id: UUID, citation_index: int) -> UUID:
    return _seed_id("citation", message_id, citation_index)


def _review_id(message_id: UUID, reason: ReviewReason) -> UUID:
    return _seed_id("review", message_id, reason.value)


def _event_id(course_id: UUID, index: int) -> UUID:
    return _seed_id("event", course_id, index)


def _state_id(course_id: UUID, user_id: UUID, point_id: UUID) -> UUID:
    return _seed_id("state", course_id, user_id, point_id)


def _snapshot_id(
    course_id: UUID,
    user_id: UUID,
    point_id: UUID,
    point_index: int,
) -> UUID:
    return _seed_id("snapshot", course_id, user_id, point_id, point_index)


def _strategy_id(course_id: UUID) -> UUID:
    return _seed_id("strategy", course_id)


def _plan_id(course_id: UUID) -> UUID:
    return _seed_id("plan", course_id)


def _week_id(course_id: UUID, week_number: int) -> UUID:
    return _seed_id("plan-week", course_id, week_number)


def _task_id(course_id: UUID, task_number: int) -> UUID:
    return _seed_id("plan-task", course_id, task_number)


def _question_id(course_id: UUID, index: int) -> UUID:
    return _seed_id("question", course_id, index)


def _now() -> datetime:
    return datetime.now(UTC)


def _chunk_text(text_value: str, size: int, overlap: int) -> list[str]:
    normalized = re.sub(r"\s+", " ", text_value).strip()
    if not normalized:
        return []
    chunks: list[str] = []
    start = 0
    while start < len(normalized):
        end = min(start + size, len(normalized))
        part = normalized[start:end].strip()
        if part:
            chunks.append(part)
        if end >= len(normalized):
            break
        start = end - overlap
    return chunks


def _local_embedding(text_value: str, dimension: int = 1024) -> list[float]:
    vector = [0.0] * dimension
    tokens = re.findall(r"[\w\u4e00-\u9fff]+", text_value.casefold())
    if not tokens:
        tokens = [text_value.casefold()]
    for token in tokens:
        digest = hashlib.blake2b(token.encode("utf-8"), digest_size=16).digest()
        index = int.from_bytes(digest[:8], "big") % dimension
        sign = 1.0 if digest[8] & 1 else -1.0
        vector[index] += sign
        secondary = int.from_bytes(digest[9:], "big") % dimension
        vector[secondary] += sign * 0.5
    norm = math.sqrt(sum(value * value for value in vector))
    if norm == 0:
        vector[0] = 1.0
        return vector
    return [round(value / norm, 8) for value in vector]


def _escape_pdf_text(value: str) -> str:
    return value.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def _make_pdf(page_lines: Sequence[Sequence[str]]) -> bytes:
    """Create a valid, text-extractable PDF without adding a PDF library dependency."""
    objects: list[bytes] = []
    page_object_numbers: list[int] = []
    next_object = 3
    for lines in page_lines:
        page_number = next_object
        content_number = next_object + 1
        next_object += 2
        page_object_numbers.append(page_number)
        content_parts = ["BT", "/F1 9 Tf", "13 TL", "50 750 Td"]
        for line in lines:
            content_parts.append(f"({_escape_pdf_text(line)}) Tj")
            content_parts.append("T*")
        content_parts.append("ET")
        content = "\n".join(content_parts).encode("latin-1", errors="replace")
        objects.append(
            (
                f"{page_number} 0 obj\n"
                "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
                "/Resources << /Font << /F1 << /Type /Font /Subtype /Type1 "
                "/BaseFont /Helvetica >> >> >> "
                f"/Contents {content_number} 0 R >>\nendobj\n"
            ).encode("ascii")
        )
        objects.append(
            (f"{content_number} 0 obj\n<< /Length {len(content)} >>\nstream\n").encode(
                "ascii"
            )
            + content
            + b"\nendstream\nendobj\n"
        )

    kids = " ".join(f"{number} 0 R" for number in page_object_numbers)
    catalog = b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"
    pages = (
        f"2 0 obj\n<< /Type /Pages /Kids [{kids}] /Count {len(page_lines)} >>\nendobj\n"
    ).encode("ascii")
    all_objects = [catalog, pages, *objects]

    output = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = [0]
    for object_bytes in all_objects:
        offsets.append(len(output))
        output.extend(object_bytes)
    xref_offset = len(output)
    output.extend(f"xref\n0 {len(all_objects) + 1}\n".encode("ascii"))
    output.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        output.extend(f"{offset:010d} 00000 n \n".encode("ascii"))
    output.extend(
        (
            f"trailer\n<< /Size {len(all_objects) + 1} /Root 1 0 R >>\n"
            f"startxref\n{xref_offset}\n%%EOF\n"
        ).encode("ascii")
    )
    return bytes(output)


def _page_text(
    course_name: str,
    course_number: int,
    page_number: int,
    topics: Sequence[str],
) -> str:
    topic = topics[(page_number - 1) % len(topics)]
    paragraphs = [
        f"ECHO Teacher Acceptance Material. Course {course_number}. Page {page_number}.",
        f"Topic: {topic}.",
        "This generated textbook page is intentionally stable for paging, indexing and citation tests.",
    ]
    for paragraph_number in range(1, 19):
        paragraphs.append(
            textwrap.fill(
                (
                    f"Paragraph {paragraph_number}: {topic} requires describing the goal, "
                    "inputs, expected result, boundary conditions, observed evidence and "
                    "teacher review action. Students should compare the definition with a "
                    "concrete course example before answering a quick check. "
                    f"Acceptance marker P{page_number:03d}-{paragraph_number:02d}."
                ),
                width=104,
            )
        )
    return "\n".join(paragraphs)


def _course_name(course_number: int) -> str:
    subject = TOPIC_TEMPLATES[(course_number - 1) % len(TOPIC_TEMPLATES)]
    return f"ECHO 验收课程 {course_number:02d} - {subject}"


def _course_status(index: int, course_count: int) -> CourseStatus:
    if index == course_count - 1:
        return CourseStatus.ARCHIVED
    if index % 4 == 3:
        return CourseStatus.DRAFT
    return CourseStatus.PUBLISHED


def _student_count_for_course(course_index: int, student_count: int) -> int:
    if student_count <= 1:
        return student_count
    upper = min(student_count, max(24, student_count // 3))
    lower = min(upper, 20)
    return lower + ((course_index * 17) % max(1, upper - lower + 1))


def _course_student_indexes(course_index: int, student_count: int) -> list[int]:
    selected_count = _student_count_for_course(course_index, student_count)
    start = (course_index * 29) % student_count
    stride = 7
    while math.gcd(stride, student_count) != 1 and stride < student_count:
        stride += 2
    return [
        (start + offset * stride) % student_count for offset in range(selected_count)
    ]


def _build_users_and_memberships(
    config: AcceptanceSeedConfig,
    now: datetime,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[list[UUID]]]:
    users: list[dict[str, Any]] = [
        {
            "id": _teacher_id(),
            "email": "acceptance.teacher@example.com",
            "username": "acceptance_teacher",
            "display_name": "大型验收教师",
            "role": UserRole.TEACHER,
            "status": UserStatus.ACTIVE,
            "last_login_at": now - timedelta(minutes=25),
            "created_at": now - timedelta(days=240),
            "updated_at": now,
        }
    ]
    student_ids: list[UUID] = []
    for index in range(config.student_count):
        user_id = _student_id(index)
        student_ids.append(user_id)
        users.append(
            {
                "id": user_id,
                "email": f"acceptance.student.{index + 1:04d}@example.com",
                "username": f"acceptance_student_{index + 1:04d}",
                "display_name": f"验收学生 {index + 1:03d}",
                "role": UserRole.STUDENT,
                "status": UserStatus.ACTIVE,
                "last_login_at": now - timedelta(hours=(index * 13) % (24 * 21)),
                "created_at": now - timedelta(days=210 - (index % 60)),
                "updated_at": now,
            }
        )

    memberships: list[dict[str, Any]] = []
    course_students: list[list[UUID]] = []
    teacher_id = _teacher_id()
    for course_index in range(config.course_count):
        course_id = _course_id(course_index)
        memberships.append(
            {
                "id": _member_id(course_id, teacher_id),
                "course_id": course_id,
                "user_id": teacher_id,
                "role": UserRole.TEACHER,
                "joined_at": now - timedelta(days=220 - course_index),
            }
        )
        selected_indexes = _course_student_indexes(course_index, config.student_count)
        course_students.append([student_ids[index] for index in selected_indexes])
        for sequence, student_index in enumerate(selected_indexes):
            memberships.append(
                {
                    "id": _member_id(course_id, student_ids[student_index]),
                    "course_id": course_id,
                    "user_id": student_ids[student_index],
                    "role": UserRole.STUDENT,
                    "joined_at": now
                    - timedelta(
                        days=180 - (course_index * 3) - (sequence % 45),
                        hours=(sequence * 7) % 24,
                    ),
                }
            )
    return users, memberships, course_students


async def _insert_many(
    session: AsyncSession,
    model: Any,
    rows: Sequence[dict[str, Any]],
    *,
    batch_size: int = 1000,
) -> None:
    for start in range(0, len(rows), batch_size):
        await session.execute(insert(model), list(rows[start : start + batch_size]))


async def _delete_acceptance_namespace(
    session: AsyncSession,
    config: AcceptanceSeedConfig,
) -> None:
    course_ids = [_course_id(index) for index in range(config.course_count)]
    user_ids = [
        _teacher_id(),
        *[_student_id(index) for index in range(config.student_count)],
    ]
    if not course_ids:
        return

    review_ids = select(AIReviewFlag.id).where(AIReviewFlag.course_id.in_(course_ids))
    conversation_ids = select(Conversation.id).where(
        Conversation.course_id.in_(course_ids)
    )
    message_ids = select(Message.id).where(
        Message.conversation_id.in_(conversation_ids)
    )
    document_ids = select(Document.id).where(Document.course_id.in_(course_ids))
    chapter_ids = select(Chapter.id).where(Chapter.course_id.in_(course_ids))
    strategy_ids = select(TeachingStrategy.id).where(
        TeachingStrategy.course_id.in_(course_ids)
    )
    plan_ids = select(ExecutionPlan.id).where(ExecutionPlan.course_id.in_(course_ids))
    task_ids = select(PlanTask.id).where(PlanTask.plan_id.in_(plan_ids))

    await session.execute(
        delete(ReviewHistoryEntry).where(
            ReviewHistoryEntry.review_flag_id.in_(review_ids)
        )
    )
    await session.execute(
        delete(ReviewAnswerVersion).where(
            ReviewAnswerVersion.review_flag_id.in_(review_ids)
        )
    )
    await session.execute(
        delete(ReviewRegenerationRun).where(
            ReviewRegenerationRun.review_flag_id.in_(review_ids)
        )
    )
    await session.execute(
        delete(AIReviewFlag).where(AIReviewFlag.course_id.in_(course_ids))
    )
    await session.execute(
        delete(MessageCitation).where(MessageCitation.message_id.in_(message_ids))
    )
    await session.execute(
        delete(Message).where(Message.conversation_id.in_(conversation_ids))
    )
    await session.execute(
        delete(Conversation).where(Conversation.course_id.in_(course_ids))
    )
    await session.execute(
        delete(MasterySnapshot).where(MasterySnapshot.course_id.in_(course_ids))
    )
    await session.execute(
        delete(StudentKnowledgeState).where(
            StudentKnowledgeState.course_id.in_(course_ids)
        )
    )
    await session.execute(
        delete(LearningEvent).where(LearningEvent.course_id.in_(course_ids))
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
        delete(plan_target_students).where(plan_target_students.c.plan_id.in_(plan_ids))
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
        delete(ExecutionPlan).where(ExecutionPlan.course_id.in_(course_ids))
    )
    await session.execute(
        delete(TeachingStrategyVersion).where(
            TeachingStrategyVersion.strategy_id.in_(strategy_ids)
        )
    )
    await session.execute(
        delete(TeachingStrategy).where(TeachingStrategy.course_id.in_(course_ids))
    )
    await session.execute(
        delete(TeachingPolicy).where(TeachingPolicy.course_id.in_(course_ids))
    )
    await session.execute(
        delete(KnowledgeRelation).where(KnowledgeRelation.course_id.in_(course_ids))
    )
    await session.execute(
        delete(KnowledgeChunk).where(KnowledgeChunk.course_id.in_(course_ids))
    )
    await session.execute(
        delete(DocumentPage).where(DocumentPage.document_id.in_(document_ids))
    )
    await session.execute(
        delete(KnowledgePoint).where(KnowledgePoint.chapter_id.in_(chapter_ids))
    )
    await session.execute(delete(Chapter).where(Chapter.course_id.in_(course_ids)))
    await session.execute(delete(Document).where(Document.course_id.in_(course_ids)))
    await session.execute(
        delete(QuestionItem).where(QuestionItem.course_id.in_(course_ids))
    )
    await session.execute(
        delete(CourseMember).where(CourseMember.course_id.in_(course_ids))
    )
    await session.execute(delete(Course).where(Course.id.in_(course_ids)))
    await session.execute(
        delete(TeacherProfile).where(TeacherProfile.user_id.in_(user_ids))
    )
    await session.execute(
        delete(StudentProfile).where(StudentProfile.user_id.in_(user_ids))
    )
    await session.execute(delete(User).where(User.id.in_(user_ids)))
    await session.flush()


def _build_courses(config: AcceptanceSeedConfig, now: datetime) -> list[dict[str, Any]]:
    courses: list[dict[str, Any]] = []
    for index in range(config.course_count):
        course_id = _course_id(index)
        status = _course_status(index, config.course_count)
        courses.append(
            {
                "id": course_id,
                "name": _course_name(index + 1),
                "description": (
                    "独立大型教师端验收数据集，包含课程状态、成员、知识结构、"
                    "学习事件、对话、引用、审核、教材和长期掌握趋势。"
                ),
                "term": f"2026-{(index % 3) + 1}",
                "course_type": ("本科专业课", "研究生专题课", "实训课程")[index % 3],
                "target_audience": ("软件工程本科生", "计算机类本科生", "工程实践学生")[
                    index % 3
                ],
                "expected_student_count": _student_count_for_course(
                    index, config.student_count
                ),
                "archived_at": now - timedelta(days=30)
                if status == CourseStatus.ARCHIVED
                else None,
                "status": status,
                "code": f"ACC{index + 1:03d}",
                "created_by": _teacher_id(),
                "created_at": now - timedelta(days=230 - index * 4),
                "updated_at": now - timedelta(days=index % 20),
            }
        )
    return courses


def _build_curriculum(
    config: AcceptanceSeedConfig,
    now: datetime,
) -> tuple[
    list[dict[str, Any]],
    list[dict[str, Any]],
    dict[UUID, list[UUID]],
    list[dict[str, Any]],
]:
    chapters: list[dict[str, Any]] = []
    points: list[dict[str, Any]] = []
    course_point_ids: dict[UUID, list[UUID]] = {}
    documents: list[dict[str, Any]] = []
    for course_index in range(config.course_count):
        course_id = _course_id(course_index)
        document_id = _document_id(course_id)
        page_count = (
            config.pdf_page_count if course_index == BIG_DOCUMENT_COURSE_INDEX else 2
        )
        documents.append(
            {
                "id": document_id,
                "course_id": course_id,
                "uploaded_by": _teacher_id(),
                "original_name": f"ECHO_验收教材_{course_index + 1:02d}_{page_count}页.pdf",
                "display_name": f"{_course_name(course_index + 1)}教材",
                "summary": "包含可提取文本、页级 Chunk、Embedding 和 Citation 的真实 PDF 文件。",
                "keywords": ["验收数据", "软件测试", f"课程{course_index + 1:02d}"],
                "author": "ECHO Acceptance Generator",
                "publisher": "Internal Demo",
                "copyright": "Demo only",
                "storage_key": (
                    f"acceptance/courses/{course_id}/documents/{document_id}.pdf"
                ),
                "content_type": "application/pdf",
                "size_bytes": 0,
                "status": DocumentStatus.READY,
                "page_count": page_count,
                "resource_type": ResourceType.TEXTBOOK,
                "trashed_at": None,
                "created_at": now - timedelta(days=190 - course_index * 3),
                "updated_at": now - timedelta(days=course_index % 15),
            }
        )
        current_point_ids: list[UUID] = []
        for chapter_index in range(5):
            chapter_id = _chapter_id(course_id, chapter_index)
            start = chapter_index * 4
            chapter_topic = TOPIC_TEMPLATES[
                (course_index + start) % len(TOPIC_TEMPLATES)
            ]
            chapters.append(
                {
                    "id": chapter_id,
                    "course_id": course_id,
                    "document_id": document_id,
                    "title": f"第{chapter_index + 1}章 {chapter_topic}",
                    "summary": f"{chapter_topic}的验收章节，覆盖定义、方法、案例和教师干预证据。",
                    "order_index": chapter_index,
                    "trashed_at": None,
                    "created_at": now - timedelta(days=185 - course_index),
                    "updated_at": now - timedelta(days=chapter_index),
                }
            )
            for point_index in range(4):
                global_index = chapter_index * 4 + point_index
                point_id = _knowledge_point_id(course_id, global_index)
                current_point_ids.append(point_id)
                topic = TOPIC_TEMPLATES[
                    (course_index + chapter_index * 4 + point_index)
                    % len(TOPIC_TEMPLATES)
                ]
                points.append(
                    {
                        "id": point_id,
                        "course_id": course_id,
                        "chapter_id": chapter_id,
                        "name": f"{chapter_index + 1}.{point_index + 1} {topic}",
                        "description": (
                            f"{topic}的核心概念、适用场景、常见错误、检查方法和"
                            "教师修正建议。"
                        ),
                        "order_index": point_index,
                        "trashed_at": None,
                        "created_at": now - timedelta(days=180 - course_index),
                        "updated_at": now - timedelta(days=point_index),
                    }
                )
        course_point_ids[course_id] = current_point_ids
    return chapters, points, course_point_ids, documents


def _write_pdf_documents(
    config: AcceptanceSeedConfig,
    storage_root: Path,
    documents: list[dict[str, Any]],
    points_by_course: dict[UUID, list[UUID]],
    now: datetime,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    pages: list[dict[str, Any]] = []
    chunks: list[dict[str, Any]] = []
    updated_documents: list[dict[str, Any]] = []
    for course_index, document in enumerate(documents):
        course_id = document["course_id"]
        page_count = int(document["page_count"])
        topics = [
            f"Acceptance Topic {index + 1:02d}"
            for index in range(len(points_by_course[course_id]))
        ]
        page_texts: list[str] = []
        for page_number in range(1, page_count + 1):
            page_text = _page_text(
                document["display_name"],
                course_index + 1,
                page_number,
                topics,
            )
            page_texts.append(page_text)
            page_id = _page_id(document["id"], page_number)
            pages.append(
                {
                    "id": page_id,
                    "document_id": document["id"],
                    "page_number": page_number,
                    "text": page_text,
                    "char_count": len(page_text),
                    "width": 612,
                    "height": 792,
                    "created_at": now - timedelta(days=180 - course_index),
                }
            )

        pdf_path = storage_root / str(document["storage_key"])
        pdf_path.parent.mkdir(parents=True, exist_ok=True)
        pdf_bytes = _make_pdf(
            [
                textwrap.wrap(page_text, width=118, replace_whitespace=False)
                for page_text in page_texts
            ]
        )
        pdf_path.write_bytes(pdf_bytes)
        document["size_bytes"] = len(pdf_bytes)
        updated_documents.append(document)

        chapter_ids = sorted(
            {_chapter_id(course_id, index) for index in range(5)},
            key=lambda value: str(value),
        )
        chunk_index = 0
        for page_number, page_text in enumerate(page_texts, start=1):
            for part in _chunk_text(page_text, size=400, overlap=40):
                chunk_id = _chunk_id(document["id"], chunk_index)
                chapter_id = chapter_ids[(page_number - 1) % len(chapter_ids)]
                chunks.append(
                    {
                        "id": chunk_id,
                        "course_id": course_id,
                        "document_id": document["id"],
                        "chapter_id": chapter_id,
                        "chunk_index": chunk_index,
                        "page_start": page_number,
                        "page_end": page_number,
                        "content": part,
                        "char_count": len(part),
                        "metadata_json": {
                            "acceptance_seed": DEFAULT_DATASET_NAME,
                            "page_number": page_number,
                            "embedding_source": "deterministic_local_v1",
                        },
                        "embedding": _local_embedding(part),
                        "created_at": now - timedelta(days=179 - course_index),
                    }
                )
                chunk_index += 1
    return updated_documents, pages, chunks


def _build_conversations_messages_citations(
    config: AcceptanceSeedConfig,
    course_students: list[list[UUID]],
    points_by_course: dict[UUID, list[UUID]],
    chunks_by_course: dict[UUID, list[dict[str, Any]]],
    now: datetime,
) -> tuple[
    list[dict[str, Any]],
    list[dict[str, Any]],
    list[dict[str, Any]],
    list[dict[str, Any]],
    list[dict[str, Any]],
]:
    conversations: list[dict[str, Any]] = []
    messages: list[dict[str, Any]] = []
    citations: list[dict[str, Any]] = []
    message_events: list[dict[str, Any]] = []
    flags: list[dict[str, Any]] = []
    message_counter = 0
    review_sequence = 0

    for course_index in range(config.course_count):
        course_id = _course_id(course_index)
        student_ids = course_students[course_index]
        point_ids = points_by_course[course_id]
        course_chunks = chunks_by_course[course_id]
        for conversation_index in range(config.conversations_per_course):
            if message_counter >= config.target_message_count:
                break
            student_id = student_ids[(conversation_index * 7) % len(student_ids)]
            created_at = now - timedelta(
                days=119 - (conversation_index % 120),
                minutes=(conversation_index * 17) % 180,
            )
            conversation_id = _conversation_id(course_id, conversation_index)
            point_id = point_ids[conversation_index % len(point_ids)]
            point_name = f"验收知识点 {point_ids.index(point_id) + 1:02d}"
            conversations.append(
                {
                    "id": conversation_id,
                    "course_id": course_id,
                    "user_id": student_id,
                    "title": f"{point_name}复习与追问",
                    "created_at": created_at,
                    "updated_at": created_at + timedelta(minutes=35),
                }
            )
            for message_index, role in enumerate(MESSAGE_ROLES):
                if message_counter >= config.target_message_count:
                    break
                message_id = _message_id(course_id, conversation_index, message_index)
                message_time = created_at + timedelta(minutes=message_index * 4)
                if role == MessageRole.USER:
                    content = (
                        f"请结合教材解释“{point_name}”，并给我一个可以验证的例子。"
                        if message_index == 0
                        else f"如果{point_name}在边界条件下失效，应该怎样排查？"
                    )
                elif message_index in RESOLVED_MESSAGE_INDEXES:
                    content = (
                        f"已解决：{point_name}需要结合定义、边界输入和实际观察证据判断，"
                        "我现在可以说明原因并完成练习。"
                    )
                else:
                    content = (
                        f"围绕“{point_name}”，先确认概念边界，再检查输入、预期结果和"
                        "证据是否一致。回答引用课程教材中的对应页 [1]。"
                    )
                messages.append(
                    {
                        "id": message_id,
                        "conversation_id": conversation_id,
                        "client_request_id": f"acceptance-{message_counter:08d}",
                        "role": role,
                        "status": MessageStatus.COMPLETE,
                        "content": content,
                        "blocks": [],
                        "created_at": message_time,
                    }
                )
                event_type = (
                    LearningEventType.QUESTION_ASKED
                    if role == MessageRole.USER
                    else (
                        LearningEventType.RESOLVED
                        if message_index in RESOLVED_MESSAGE_INDEXES
                        else LearningEventType.HINT_REQUESTED
                    )
                )
                message_events.append(
                    {
                        "id": _event_id(course_id, 100_000 + message_counter),
                        "course_id": course_id,
                        "user_id": student_id,
                        "knowledge_point_id": point_id,
                        "conversation_id": conversation_id,
                        "message_id": message_id,
                        "plan_id": _plan_id(course_id),
                        "task_id": _task_id(course_id, message_index % 4),
                        "week_number": (message_index % 4) + 1,
                        "event_type": event_type,
                        "weight": 1.0,
                        "evidence": f"验收对话消息证据：{point_name}",
                        "metadata_json": {
                            "acceptance_seed": DEFAULT_DATASET_NAME,
                            "source": "conversation",
                        },
                        "created_at": message_time,
                    }
                )
                if role == MessageRole.ASSISTANT:
                    chunk = course_chunks[
                        (conversation_index * 3 + message_index) % len(course_chunks)
                    ]
                    citation_index = 1
                    citations.append(
                        {
                            "id": _citation_id(message_id, citation_index),
                            "message_id": message_id,
                            "citation_index": citation_index,
                            "chunk_id": chunk["id"],
                            "document_id": chunk["document_id"],
                            "page_start": chunk["page_start"],
                            "page_end": chunk["page_end"],
                            "document_name": _document_display_name(course_index),
                            "chapter_title": _chapter_title(course_index, chunk),
                            "quote": chunk["content"][:240],
                            "created_at": message_time,
                        }
                    )
                    should_review = (
                        review_sequence < len(REVIEW_STATUSES)
                        or message_counter % 37 == 0
                    )
                    if should_review:
                        reason = REVIEW_REASONS[review_sequence % len(REVIEW_REASONS)]
                        status = REVIEW_STATUSES[review_sequence % len(REVIEW_STATUSES)]
                        review_sequence += 1
                        flag_id = _review_id(message_id, reason)
                        flags.append(
                            {
                                "id": flag_id,
                                "course_id": course_id,
                                "conversation_id": conversation_id,
                                "message_id": message_id,
                                "student_id": student_id,
                                "reason": reason,
                                "severity": (
                                    ReviewSeverity.HIGH
                                    if reason
                                    in {
                                        ReviewReason.MISSING_COURSE_BASIS,
                                        ReviewReason.OUTSIDE_MATERIAL_HEAVY,
                                    }
                                    else ReviewSeverity.MEDIUM
                                ),
                                "status": status,
                                "current_version": 2
                                if status
                                in {
                                    ReviewStatus.CONFIRMED_CORRECT,
                                    ReviewStatus.MARKED_INCORRECT,
                                    ReviewStatus.PENDING_REREVIEW,
                                }
                                else 1,
                                "generation_status": (
                                    ReviewGenerationStatus.GENERATING
                                    if status == ReviewStatus.GENERATING
                                    else ReviewGenerationStatus.FAILED
                                    if status == ReviewStatus.REGENERATION_FAILED
                                    else ReviewGenerationStatus.COMPLETED
                                    if status == ReviewStatus.PENDING_REREVIEW
                                    else ReviewGenerationStatus.IDLE
                                ),
                                "generation_progress": 45
                                if status == ReviewStatus.GENERATING
                                else 100
                                if status == ReviewStatus.PENDING_REREVIEW
                                else 0,
                                "generation_error": (
                                    "验收数据模拟失败，可再次重试。"
                                    if status == ReviewStatus.REGENERATION_FAILED
                                    else None
                                ),
                                "details": {
                                    "acceptance_seed": DEFAULT_DATASET_NAME,
                                    "knowledge_point_ids": [str(point_id)],
                                    "citation_ids": [str(_citation_id(message_id, 1))],
                                    "document_id": str(chunk["document_id"]),
                                    "chunk_id": str(chunk["id"]),
                                    "page_start": chunk["page_start"],
                                    "page_end": chunk["page_end"],
                                    "quote": chunk["content"][:240],
                                    "document_name": _document_display_name(course_index),
                                    "chapter_title": _chapter_title(course_index, chunk),
                                },
                                "teacher_note": (
                                    "验收教师备注：检查定义与边界条件是否讲清楚。"
                                    if status
                                    in {
                                        ReviewStatus.CONFIRMED_CORRECT,
                                        ReviewStatus.MARKED_INCORRECT,
                                    }
                                    else None
                                ),
                                "corrected_answer": (
                                    "验收标准回答：先说明定义，再引用课程页码并给出边界示例。"
                                    if status == ReviewStatus.MARKED_INCORRECT
                                    else None
                                ),
                                "reviewed_by": _teacher_id()
                                if status
                                in {
                                    ReviewStatus.CONFIRMED_CORRECT,
                                    ReviewStatus.MARKED_INCORRECT,
                                    ReviewStatus.DISMISSED,
                                }
                                else None,
                                "reviewed_at": now
                                - timedelta(hours=message_counter % 72)
                                if status
                                in {
                                    ReviewStatus.CONFIRMED_CORRECT,
                                    ReviewStatus.MARKED_INCORRECT,
                                    ReviewStatus.DISMISSED,
                                }
                                else None,
                                "created_at": message_time + timedelta(minutes=1),
                                "updated_at": now
                                - timedelta(hours=message_counter % 48),
                            }
                        )
                message_counter += 1
    return conversations, messages, citations, message_events, flags


def _document_display_name(course_index: int) -> str:
    return f"ECHO 验收教材 {course_index + 1:02d}"


def _chapter_title(course_index: int, chunk: dict[str, Any]) -> str:
    chapter_index = int(chunk["chunk_index"]) % 5
    return f"第{chapter_index + 1}章 验收内容"


def _build_review_details(
    flags: list[dict[str, Any]],
    messages_by_id: dict[UUID, dict[str, Any]],
    now: datetime,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    versions: list[dict[str, Any]] = []
    history: list[dict[str, Any]] = []
    for index, flag in enumerate(flags):
        message = messages_by_id[flag["message_id"]]
        versions.append(
            {
                "id": _seed_id("review-version", flag["id"], 1),
                "review_flag_id": flag["id"],
                "version": 1,
                "answer": message["content"],
                "knowledge_point_ids": flag["details"]["knowledge_point_ids"],
                "citations": [
                    {
                        "citation_index": 1,
                        "document_id": flag["details"]["document_id"],
                        "chunk_id": flag["details"]["chunk_id"],
                        "page_start": flag["details"]["page_start"],
                        "page_end": flag["details"]["page_end"],
                        "quote": flag["details"]["quote"],
                        "document_name": flag["details"]["document_name"],
                        "chapter_title": flag["details"]["chapter_title"],
                    }
                ],
                "source": ReviewVersionSource.ORIGINAL,
                "instruction": None,
                "created_by": None,
                "created_at": flag["created_at"],
            }
        )
        if flag["current_version"] > 1:
            source = (
                ReviewVersionSource.TEACHER
                if flag["status"] == ReviewStatus.MARKED_INCORRECT
                else ReviewVersionSource.REGENERATED
            )
            versions.append(
                {
                    "id": _seed_id("review-version", flag["id"], 2),
                    "review_flag_id": flag["id"],
                    "version": 2,
                    "answer": flag["corrected_answer"]
                    or f"{message['content']} 已根据教师意见重新生成。",
                    "knowledge_point_ids": flag["details"]["knowledge_point_ids"],
                    "citations": [
                        {
                            "citation_index": 1,
                            "document_id": flag["details"]["document_id"],
                            "chunk_id": flag["details"]["chunk_id"],
                            "page_start": flag["details"]["page_start"],
                            "page_end": flag["details"]["page_end"],
                            "quote": flag["details"]["quote"],
                            "document_name": flag["details"]["document_name"],
                            "chapter_title": flag["details"]["chapter_title"],
                        }
                    ],
                    "source": source,
                    "instruction": "补充课程引用并强化边界条件说明。",
                    "created_by": _teacher_id(),
                    "created_at": flag["created_at"] + timedelta(hours=2),
                }
            )
        action = (
            ReviewHistoryAction.CONFIRM_CORRECT
            if flag["status"] == ReviewStatus.CONFIRMED_CORRECT
            else ReviewHistoryAction.MARK_INCORRECT
            if flag["status"] == ReviewStatus.MARKED_INCORRECT
            else ReviewHistoryAction.DISMISS
            if flag["status"] == ReviewStatus.DISMISSED
            else ReviewHistoryAction.REGENERATE
        )
        from_status = (
            ReviewStatus.OPEN
            if flag["status"]
            in {
                ReviewStatus.CONFIRMED_CORRECT,
                ReviewStatus.MARKED_INCORRECT,
                ReviewStatus.DISMISSED,
            }
            else ReviewStatus.GENERATING
        )
        history.append(
            {
                "id": _seed_id("review-history", flag["id"], 1),
                "review_flag_id": flag["id"],
                "sequence": 1,
                "version": flag["current_version"],
                "action": action,
                "from_status": from_status,
                "to_status": flag["status"],
                "teacher_id": _teacher_id(),
                "note": flag["teacher_note"],
                "answer_snapshot": message["content"],
                "corrected_answer_snapshot": flag["corrected_answer"],
                "created_at": now - timedelta(hours=index % 96),
            }
        )
    return versions, history


def _build_events(
    config: AcceptanceSeedConfig,
    course_students: list[list[UUID]],
    points_by_course: dict[UUID, list[UUID]],
    message_events: list[dict[str, Any]],
    now: datetime,
) -> list[dict[str, Any]]:
    if len(message_events) > config.target_event_count:
        raise ValueError("target_event_count must be at least the message event count")
    events = list(message_events)
    event_index = 0
    while len(events) < config.target_event_count:
        course_index = event_index % config.course_count
        course_id = _course_id(course_index)
        student_ids = course_students[course_index]
        point_ids = points_by_course[course_id]
        student_id = student_ids[(event_index * 11) % len(student_ids)]
        point_id = point_ids[(event_index * 5) % len(point_ids)]
        event_type = EVENT_TYPES[
            (event_index // config.course_count + course_index) % len(EVENT_TYPES)
        ]
        occurred_at = now - timedelta(
            days=(event_index * 37) % 180,
            hours=(event_index * 13) % 24,
            minutes=event_index % 60,
        )
        events.append(
            {
                "id": _event_id(course_id, event_index),
                "course_id": course_id,
                "user_id": student_id,
                "knowledge_point_id": point_id,
                "conversation_id": None,
                "message_id": None,
                "plan_id": _plan_id(course_id),
                "task_id": _task_id(course_id, event_index % 4),
                "week_number": (event_index % 4) + 1,
                "event_type": event_type,
                "weight": round(0.6 + (event_index % 5) * 0.1, 2),
                "evidence": (
                    f"验收证据 {event_index + 1:05d}：{event_type.value}，"
                    "用于教师 Dashboard、趋势和聚类验证。"
                ),
                "metadata_json": {
                    "acceptance_seed": DEFAULT_DATASET_NAME,
                    "result": (
                        "correct"
                        if event_type == LearningEventType.QUIZ_CORRECT
                        else "wrong"
                        if event_type == LearningEventType.QUIZ_WRONG
                        else "unresolved"
                        if event_type
                        in {
                            LearningEventType.CONCEPT_CONFUSION,
                            LearningEventType.HINT_REQUESTED,
                        }
                        else "completed"
                    ),
                },
                "created_at": occurred_at,
            }
        )
        event_index += 1
    return events


def _build_mastery(
    config: AcceptanceSeedConfig,
    course_students: list[list[UUID]],
    points_by_course: dict[UUID, list[UUID]],
    now: datetime,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    states: list[dict[str, Any]] = []
    snapshots: list[dict[str, Any]] = []
    for course_index in range(config.course_count):
        course_id = _course_id(course_index)
        course_points = points_by_course[course_id][:6]
        for student_index, student_id in enumerate(course_students[course_index]):
            for point_index, point_id in enumerate(course_points):
                base = 42 + ((student_index * 11 + point_index * 7 + course_index) % 50)
                state_id = _state_id(course_id, student_id, point_id)
                states.append(
                    {
                        "id": state_id,
                        "course_id": course_id,
                        "user_id": student_id,
                        "knowledge_point_id": point_id,
                        "score": float(base),
                        "created_at": now - timedelta(days=150),
                        "updated_at": now - timedelta(days=course_index % 10),
                    }
                )
                for snapshot_index in range(config.snapshot_points):
                    progress = snapshot_index / max(1, config.snapshot_points - 1)
                    wave = (
                        math.sin((student_index + point_index + course_index) / 5.0) * 6
                    )
                    score = max(
                        0.0,
                        min(100.0, base - 14 + progress * 28 + wave),
                    )
                    snapshots.append(
                        {
                            "id": _snapshot_id(
                                course_id,
                                student_id,
                                point_id,
                                snapshot_index,
                            ),
                            "course_id": course_id,
                            "user_id": student_id,
                            "knowledge_point_id": point_id,
                            "source_event_id": None,
                            "score": round(score, 2),
                            "created_at": now
                            - timedelta(
                                days=(config.snapshot_points - 1 - snapshot_index) * 12
                            ),
                        }
                    )
    return states, snapshots


def _build_planning(
    config: AcceptanceSeedConfig,
    course_students: list[list[UUID]],
    points_by_course: dict[UUID, list[UUID]],
    now: datetime,
) -> tuple[
    list[dict[str, Any]],
    list[dict[str, Any]],
    list[dict[str, Any]],
    list[dict[str, Any]],
    list[dict[str, Any]],
    list[dict[str, Any]],
    list[dict[str, Any]],
    list[dict[str, Any]],
    list[dict[str, Any]],
]:
    strategies: list[dict[str, Any]] = []
    strategy_versions: list[dict[str, Any]] = []
    plans: list[dict[str, Any]] = []
    weeks: list[dict[str, Any]] = []
    tasks: list[dict[str, Any]] = []
    strategy_points: list[dict[str, Any]] = []
    strategy_students: list[dict[str, Any]] = []
    plan_points: list[dict[str, Any]] = []
    plan_students: list[dict[str, Any]] = []
    task_points: list[dict[str, Any]] = []
    task_students: list[dict[str, Any]] = []
    for course_index in range(config.course_count):
        course_id = _course_id(course_index)
        point_ids = points_by_course[course_id]
        students = course_students[course_index]
        target_points = point_ids[:4]
        target_students = students[: min(30, len(students))]
        strategy_id = _strategy_id(course_id)
        strategies.append(
            {
                "id": strategy_id,
                "course_id": course_id,
                "title": f"课程{course_index + 1:02d}薄弱概念强化策略",
                "description": "验收数据策略：针对重复错误和低掌握知识点安排讲解、练习与复核。",
                "type": TeachingStrategyType.CONTENT_ADJUSTMENT,
                "priority": TeachingStrategyPriority.HIGH,
                "status": (
                    TeachingStrategyStatus.ACTIVE
                    if _course_status(course_index, config.course_count)
                    == CourseStatus.PUBLISHED
                    else TeachingStrategyStatus.SUGGESTED
                ),
                "source": TeachingStrategySource.AI_GENERATED,
                "version": 2,
                "goals": ["降低重复错误", "提升边界条件识别", "补充教材来源引用"],
                "teaching_methods": [
                    {"name": "概念对比", "weight": 0.3},
                    {"name": "案例练习", "weight": 0.4},
                    {"name": "快速检测", "weight": 0.3},
                ],
                "teaching_flow": [
                    {"order": 1, "title": "诊断"},
                    {"order": 2, "title": "讲解"},
                    {"order": 3, "title": "练习"},
                    {"order": 4, "title": "复核"},
                ],
                "personalization_rules": ["按掌握度调整难度"],
                "ai_rules": ["回答引用教材来源"],
                "expected_effect": {"summary": "预计减少重复错误", "impact": 0.1},
                "generated_context": {"acceptance_seed": DEFAULT_DATASET_NAME},
                "resources_json": [
                    {"id": str(_document_id(course_id)), "title": "验收教材", "resource_type": "textbook"}
                ],
                "created_by": _teacher_id(),
                "updated_by": _teacher_id(),
                "created_at": now - timedelta(days=60 - course_index),
                "updated_at": now - timedelta(days=course_index % 12),
            }
        )
        for version, action in (
            (1, TeachingStrategyHistoryAction.GENERATED),
            (2, TeachingStrategyHistoryAction.ACTIVATE),
        ):
            strategy_versions.append(
                {
                    "id": _seed_id("strategy-version", strategy_id, version),
                    "strategy_id": strategy_id,
                    "version": version,
                    "action": action,
                    "snapshot_json": {
                        "acceptance_seed": DEFAULT_DATASET_NAME,
                        "version": version,
                    },
                    "changed_by": _teacher_id(),
                    "created_at": now - timedelta(days=60 - version * 8),
                }
            )
        plan_id = _plan_id(course_id)
        plans.append(
            {
                "id": plan_id,
                "course_id": course_id,
                "strategy_id": strategy_id,
                "title": f"课程{course_index + 1:02d}四周强化计划",
                "description": "验收计划：四周讲解、练习、Quick Check 和教师复核。",
                "status": (
                    ExecutionPlanStatus.ACTIVE
                    if _course_status(course_index, config.course_count)
                    == CourseStatus.PUBLISHED
                    else ExecutionPlanStatus.DRAFT
                ),
                "start_date": (now - timedelta(days=42)).date(),
                "end_date": (now + timedelta(days=14)).date(),
                "target_scope": PlanTargetScope.STUDENT_GROUP,
                "actions": [
                    "classroom_lecture",
                    "supplementary_practice",
                    "quick_check",
                    "individual_tutoring",
                ],
                "plan_parameters": {
                    "acceptance_seed": DEFAULT_DATASET_NAME,
                    "weeks": 4,
                },
                "evaluation_metrics": ["mastery_change", "repeated_error_rate"],
                "resources_json": [
                    {"id": str(_document_id(course_id)), "title": "验收教材", "resource_type": "textbook"}
                ],
                "teacher_note": "仅用于验收、分页、检索和教师工作流压力测试。",
                "created_by": _teacher_id(),
                "updated_by": _teacher_id(),
                "created_at": now - timedelta(days=50 - course_index),
                "updated_at": now - timedelta(days=course_index % 8),
            }
        )
        for week_number in range(1, 5):
            week_id = _week_id(course_id, week_number)
            weeks.append(
                {
                    "id": week_id,
                    "plan_id": plan_id,
                    "week_number": week_number,
                    "start_date": (now - timedelta(days=49 - week_number * 7)).date(),
                    "end_date": (now - timedelta(days=43 - week_number * 7)).date(),
                    "content": f"第{week_number}周：完成目标知识点讲解、练习和证据复核。",
                    "knowledge_point_ids": [str(point) for point in target_points],
                    "resources_json": [
                        {"id": str(_document_id(course_id)), "title": "验收教材", "resource_type": "textbook"}
                    ],
                    "created_at": now - timedelta(days=50 - week_number),
                }
            )
            task_id = _task_id(course_id, week_number - 1)
            tasks.append(
                {
                    "id": task_id,
                    "plan_id": plan_id,
                    "week_id": week_id,
                    "week_number": week_number,
                    "order_index": 0,
                    "title": f"第{week_number}周强化任务",
                    "description": "完成讲解、练习、Quick Check 和错误复盘。",
                    "type": (
                        PlanTaskType.CLASSROOM_LECTURE,
                        PlanTaskType.SUPPLEMENTARY_PRACTICE,
                        PlanTaskType.QUICK_CHECK,
                        PlanTaskType.INDIVIDUAL_TUTORING,
                    )[week_number - 1],
                    "status": (
                        PlanTaskStatus.COMPLETED
                        if week_number <= 2
                        else PlanTaskStatus.IN_PROGRESS
                        if week_number == 3
                        else PlanTaskStatus.NOT_STARTED
                    ),
                    "due_at": now - timedelta(days=49 - week_number * 7),
                    "resources_json": [
                        {"id": str(_document_id(course_id)), "title": "验收教材", "resource_type": "textbook"}
                    ],
                    "created_by": _teacher_id(),
                    "created_at": now - timedelta(days=50 - week_number),
                    "updated_at": now - timedelta(days=course_index % 6),
                }
            )
            for point_id in target_points:
                task_points.append({"task_id": task_id, "knowledge_point_id": point_id})
            for student_id in target_students:
                task_students.append({"task_id": task_id, "user_id": student_id})
        for point_id in target_points:
            strategy_points.append(
                {"strategy_id": strategy_id, "knowledge_point_id": point_id}
            )
            plan_points.append({"plan_id": plan_id, "knowledge_point_id": point_id})
        for student_id in target_students:
            strategy_students.append(
                {"strategy_id": strategy_id, "user_id": student_id}
            )
            plan_students.append({"plan_id": plan_id, "user_id": student_id})
    return (
        strategies,
        strategy_versions,
        plans,
        weeks,
        tasks,
        strategy_points,
        strategy_students,
        plan_points,
        plan_students,
    )


def _build_questions(
    config: AcceptanceSeedConfig,
    points_by_course: dict[UUID, list[UUID]],
    documents_by_course: dict[UUID, UUID],
    now: datetime,
) -> list[dict[str, Any]]:
    questions: list[dict[str, Any]] = []
    for course_index in range(config.course_count):
        course_id = _course_id(course_index)
        for index in range(2):
            questions.append(
                {
                    "id": _question_id(course_id, index),
                    "course_id": course_id,
                    "type": QuestionType.SINGLE_CHOICE,
                    "difficulty": (
                        QuestionDifficulty.EASY
                        if index == 0
                        else QuestionDifficulty.MEDIUM
                    ),
                    "title": f"验收题 {course_index + 1:02d}-{index + 1}",
                    "content": "以下哪项最能体现该知识点的验证依据？",
                    "answer": "A",
                    "explanation": "应结合实际输入、预期结果和课程证据进行判断。",
                    "source_document_id": documents_by_course[course_id],
                    "source_page": index + 1,
                    "metadata_json": {"acceptance_seed": DEFAULT_DATASET_NAME},
                    "created_by": _teacher_id(),
                    "trashed_at": None,
                    "created_at": now - timedelta(days=20 - course_index),
                    "updated_at": now - timedelta(days=course_index % 5),
                }
            )
    return questions


async def _create_relations(
    session: AsyncSession,
    config: AcceptanceSeedConfig,
    points_by_course: dict[UUID, list[UUID]],
    now: datetime,
) -> None:
    rows: list[dict[str, Any]] = []
    for course_index in range(config.course_count):
        course_id = _course_id(course_index)
        points = points_by_course[course_id]
        for index in range(len(points) - 1):
            rows.append(
                {
                    "id": _seed_id("relation", course_id, index),
                    "course_id": course_id,
                    "source_knowledge_point_id": points[index],
                    "target_knowledge_point_id": points[index + 1],
                    "relation_type": "prerequisite",
                    "created_at": now - timedelta(days=120 - course_index),
                }
            )
    await _insert_many(session, KnowledgeRelation, rows)


async def _create_question_links(
    session: AsyncSession,
    config: AcceptanceSeedConfig,
    points_by_course: dict[UUID, list[UUID]],
) -> None:
    from database.models.resource import question_item_knowledge_points

    rows: list[dict[str, Any]] = []
    for course_index in range(config.course_count):
        course_id = _course_id(course_index)
        points = points_by_course[course_id]
        rows.append(
            {
                "question_item_id": _question_id(course_id, 0),
                "knowledge_point_id": points[0],
            }
        )
        rows.append(
            {
                "question_item_id": _question_id(course_id, 1),
                "knowledge_point_id": points[1],
            }
        )
    await session.execute(insert(question_item_knowledge_points), rows)


async def _create_plan_task_links(
    session: AsyncSession,
    config: AcceptanceSeedConfig,
    course_students: list[list[UUID]],
    points_by_course: dict[UUID, list[UUID]],
) -> None:
    task_points: list[dict[str, Any]] = []
    task_students: list[dict[str, Any]] = []
    for course_index in range(config.course_count):
        course_id = _course_id(course_index)
        target_students = course_students[course_index][:30]
        for task_index in range(4):
            task_id = _task_id(course_id, task_index)
            for point_id in points_by_course[course_id][:4]:
                task_points.append({"task_id": task_id, "knowledge_point_id": point_id})
            for student_id in target_students:
                task_students.append({"task_id": task_id, "user_id": student_id})
    await session.execute(insert(plan_task_knowledge_points), task_points)
    await session.execute(insert(plan_task_target_students), task_students)


def _count_rows(
    session_counts: Counter[str],
    name: str,
    value: int | None,
) -> None:
    session_counts[name] = int(value or 0)


async def _collect_counts(
    session: AsyncSession,
    config: AcceptanceSeedConfig,
) -> dict[str, int]:
    course_ids = [_course_id(index) for index in range(config.course_count)]
    user_ids = [
        _teacher_id(),
        *[_student_id(index) for index in range(config.student_count)],
    ]
    checks: tuple[tuple[str, Any, Any], ...] = (
        ("courses", Course, Course.id.in_(course_ids)),
        ("students", User, User.id.in_(user_ids) & (User.role == UserRole.STUDENT)),
        (
            "memberships",
            CourseMember,
            CourseMember.course_id.in_(course_ids),
        ),
        ("documents", Document, Document.course_id.in_(course_ids)),
        (
            "pages",
            DocumentPage,
            DocumentPage.document_id.in_(
                select(Document.id).where(Document.course_id.in_(course_ids))
            ),
        ),
        ("chunks", KnowledgeChunk, KnowledgeChunk.course_id.in_(course_ids)),
        ("knowledgePoints", KnowledgePoint, KnowledgePoint.course_id.in_(course_ids)),
        ("events", LearningEvent, LearningEvent.course_id.in_(course_ids)),
        (
            "states",
            StudentKnowledgeState,
            StudentKnowledgeState.course_id.in_(course_ids),
        ),
        ("snapshots", MasterySnapshot, MasterySnapshot.course_id.in_(course_ids)),
        ("conversations", Conversation, Conversation.course_id.in_(course_ids)),
        (
            "messages",
            Message,
            Message.conversation_id.in_(
                select(Conversation.id).where(Conversation.course_id.in_(course_ids))
            ),
        ),
        (
            "citations",
            MessageCitation,
            MessageCitation.message_id.in_(
                select(Message.id).where(
                    Message.conversation_id.in_(
                        select(Conversation.id).where(
                            Conversation.course_id.in_(course_ids)
                        )
                    )
                )
            ),
        ),
        ("reviews", AIReviewFlag, AIReviewFlag.course_id.in_(course_ids)),
        ("strategies", TeachingStrategy, TeachingStrategy.course_id.in_(course_ids)),
        ("plans", ExecutionPlan, ExecutionPlan.course_id.in_(course_ids)),
    )
    counts: dict[str, int] = {}
    for name, model, condition in checks:
        value = await session.scalar(
            select(func.count()).select_from(model).where(condition)
        )
        _count_rows(counts, name, value)
    counts["courseStatusesPublished"] = int(
        await session.scalar(
            select(func.count())
            .select_from(Course)
            .where(Course.id.in_(course_ids), Course.status == CourseStatus.PUBLISHED)
        )
        or 0
    )
    counts["courseStatusesDraft"] = int(
        await session.scalar(
            select(func.count())
            .select_from(Course)
            .where(Course.id.in_(course_ids), Course.status == CourseStatus.DRAFT)
        )
        or 0
    )
    counts["courseStatusesArchived"] = int(
        await session.scalar(
            select(func.count())
            .select_from(Course)
            .where(Course.id.in_(course_ids), Course.status == CourseStatus.ARCHIVED)
        )
        or 0
    )
    counts["embeddedChunks"] = int(
        await session.scalar(
            select(func.count())
            .select_from(KnowledgeChunk)
            .where(
                KnowledgeChunk.course_id.in_(course_ids),
                KnowledgeChunk.embedding.is_not(None),
            )
        )
        or 0
    )
    event_type_counts = (
        await session.execute(
            select(LearningEvent.event_type, func.count())
            .where(LearningEvent.course_id.in_(course_ids))
            .group_by(LearningEvent.event_type)
        )
    ).all()
    counts["eventTypes"] = len(event_type_counts)
    return counts


def _manifest_base(
    config: AcceptanceSeedConfig, counts: dict[str, int]
) -> dict[str, Any]:
    course_entries = []
    for index in range(config.course_count):
        course_id = _course_id(index)
        status = _course_status(index, config.course_count)
        course_entries.append(
            {
                "courseId": str(course_id),
                "courseCode": f"ACC{index + 1:03d}",
                "courseName": _course_name(index + 1),
                "status": status.value,
                "studentCount": _student_count_for_course(index, config.student_count),
                "documentId": str(_document_id(course_id)),
                "strategyId": str(_strategy_id(course_id)),
                "planId": str(_plan_id(course_id)),
                "knowledgePointIds": [
                    str(_knowledge_point_id(course_id, point_index))
                    for point_index in range(20)
                ],
            }
        )
    return {
        "manifestVersion": 1,
        "datasetName": DEFAULT_DATASET_NAME,
        "namespace": str(ACCEPTANCE_NAMESPACE),
        "generatedAt": None,
        "config": asdict(config),
        "accounts": {
            "teacher": {
                "userId": str(_teacher_id()),
                "email": "acceptance.teacher@example.com",
                "displayName": "大型验收教师",
                "authMethod": "development X-User-Id",
            },
            "studentExample": {
                "userId": str(_student_id(0)),
                "email": "acceptance.student.0001@example.com",
                "displayName": "验收学生 001",
            },
        },
        "courses": course_entries,
        "studentIds": [
            str(_student_id(index)) for index in range(config.student_count)
        ],
        "fixedIds": {
            "bigDocumentCourseId": str(_course_id(BIG_DOCUMENT_COURSE_INDEX)),
            "bigDocumentId": str(_document_id(_course_id(BIG_DOCUMENT_COURSE_INDEX))),
            "bigDocumentPageIdRange": {
                "first": str(
                    _page_id(_document_id(_course_id(BIG_DOCUMENT_COURSE_INDEX)), 1)
                ),
                "last": str(
                    _page_id(
                        _document_id(_course_id(BIG_DOCUMENT_COURSE_INDEX)),
                        config.pdf_page_count,
                    )
                ),
            },
            "firstConversationId": str(_conversation_id(_course_id(0), 0)),
            "firstUserMessageId": str(_message_id(_course_id(0), 0, 0)),
            "firstAssistantMessageId": str(_message_id(_course_id(0), 0, 1)),
            "firstCitationId": str(_citation_id(_message_id(_course_id(0), 0, 1), 1)),
            "firstKnowledgePointId": str(_knowledge_point_id(_course_id(0), 0)),
            "firstChunkId": str(_chunk_id(_document_id(_course_id(0)), 0)),
        },
        "idStrategy": {
            "algorithm": "UUIDv5",
            "namespace": str(ACCEPTANCE_NAMESPACE),
            "note": "IDs are stable across every seed and reset run.",
        },
        "counts": counts,
        "isolation": {
            "databasePolicy": "dedicated test/demo database only",
            "defaultDatabasePath": "tmp/acceptance/teacher_acceptance.db",
            "defaultStorageRoot": "tmp/acceptance/uploads",
            "resetCommand": "python -m database.seeds.seed_teacher_acceptance --reset-only",
        },
        "secretsIncluded": False,
    }


def _write_manifest(manifest: dict[str, Any], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def _project_relative_path(path: Path) -> str:
    try:
        return path.resolve().relative_to(PROJECT_ROOT.resolve()).as_posix()
    except ValueError:
        return str(path)


async def reset_teacher_acceptance(
    session: AsyncSession,
    config: AcceptanceSeedConfig,
    *,
    strict_validation: bool = True,
) -> None:
    config.validate(strict=strict_validation)
    await _delete_acceptance_namespace(session, config)
    await session.commit()


async def seed_teacher_acceptance(
    session: AsyncSession,
    *,
    storage_root: Path,
    config: AcceptanceSeedConfig,
    strict_validation: bool = True,
) -> SeedResult:
    started = time.perf_counter()
    config.validate(strict=strict_validation)
    now = _now()
    await _delete_acceptance_namespace(session, config)

    users, memberships, course_students = _build_users_and_memberships(config, now)
    courses = _build_courses(config, now)
    chapters, points, points_by_course, documents = _build_curriculum(config, now)
    documents, pages, chunks = _write_pdf_documents(
        config,
        storage_root,
        documents,
        points_by_course,
        now,
    )
    documents_by_course = {
        document["course_id"]: document["id"] for document in documents
    }
    chunks_by_course: dict[UUID, list[dict[str, Any]]] = {}
    for chunk in chunks:
        chunks_by_course.setdefault(chunk["course_id"], []).append(chunk)
    (
        conversations,
        messages,
        citations,
        message_events,
        flags,
    ) = _build_conversations_messages_citations(
        config,
        course_students,
        points_by_course,
        chunks_by_course,
        now,
    )
    messages_by_id = {message["id"]: message for message in messages}
    review_versions, review_history = _build_review_details(flags, messages_by_id, now)
    events = _build_events(
        config, course_students, points_by_course, message_events, now
    )
    states, snapshots = _build_mastery(
        config,
        course_students,
        points_by_course,
        now,
    )
    (
        strategies,
        strategy_versions,
        plans,
        weeks,
        tasks,
        strategy_points,
        strategy_students,
        plan_points,
        plan_students,
    ) = _build_planning(config, course_students, points_by_course, now)
    questions = _build_questions(config, points_by_course, documents_by_course, now)

    await _insert_many(session, User, users)
    await _insert_many(
        session,
        TeacherProfile,
        [
            {
                "user_id": _teacher_id(),
                "school_name": "ECHO 验收大学",
                "department": "软件工程系",
                "employee_no": "ACC-T-0001",
                "title": "副教授",
                "teaching_fields": ["软件测试", "软件工程"],
                "created_at": now - timedelta(days=240),
                "updated_at": now,
            }
        ],
    )
    await _insert_many(
        session,
        StudentProfile,
        [
            {
                "user_id": _student_id(index),
                "school_name": "ECHO 验收大学",
                "student_no": f"ACC-S-{index + 1:04d}",
                "major": "软件工程",
                "grade": "2026",
                "class_name": f"验收班{index % 8 + 1:02d}",
                "created_at": now - timedelta(days=200 - index % 50),
                "updated_at": now,
            }
            for index in range(config.student_count)
        ],
    )
    await _insert_many(session, Course, courses)
    await _insert_many(session, CourseMember, memberships)
    await _insert_many(session, Document, documents)
    await _insert_many(session, DocumentPage, pages)
    await _insert_many(session, Chapter, chapters)
    await _insert_many(session, KnowledgePoint, points)
    await _insert_many(session, KnowledgeChunk, chunks, batch_size=250)
    await _create_relations(session, config, points_by_course, now)
    await _insert_many(session, Conversation, conversations)
    await _insert_many(session, Message, messages)
    await _insert_many(session, MessageCitation, citations)
    await _insert_many(session, TeachingStrategy, strategies)
    await _insert_many(session, TeachingStrategyVersion, strategy_versions)
    await _insert_many(session, ExecutionPlan, plans)
    await _insert_many(session, ExecutionPlanWeek, weeks)
    await _insert_many(session, PlanTask, tasks)
    await session.execute(insert(strategy_target_knowledge_points), strategy_points)
    await session.execute(insert(strategy_target_students), strategy_students)
    await session.execute(insert(plan_target_knowledge_points), plan_points)
    await session.execute(insert(plan_target_students), plan_students)
    await _create_plan_task_links(
        session,
        config,
        course_students,
        points_by_course,
    )
    await _insert_many(session, QuestionItem, questions)
    await _create_question_links(session, config, points_by_course)
    await _insert_many(session, LearningEvent, events, batch_size=1000)
    await _insert_many(session, StudentKnowledgeState, states, batch_size=1000)
    await _insert_many(session, MasterySnapshot, snapshots, batch_size=1000)
    await _insert_many(session, AIReviewFlag, flags)
    await _insert_many(session, ReviewAnswerVersion, review_versions)
    await _insert_many(session, ReviewHistoryEntry, review_history)
    await session.commit()

    counts = await _collect_counts(session, config)
    counts["users"] = config.student_count + 1
    counts["messages"] = len(messages)
    counts["events"] = len(events)
    counts["chunks"] = len(chunks)
    counts["pages"] = len(pages)
    counts["snapshots"] = len(snapshots)
    counts["citations"] = len(citations)
    manifest = _manifest_base(config, counts)
    elapsed = time.perf_counter() - started
    manifest["generatedAt"] = now.isoformat()
    manifest["execution"] = {
        "elapsedSeconds": round(elapsed, 3),
        "database": "dedicated acceptance database",
        "storageRoot": str(storage_root),
        "pdfMode": "real text-extractable PDF",
        "embeddingMode": "deterministic_local_v1",
    }
    manifest["counts"] = counts
    return SeedResult(
        manifest=manifest,
        counts=counts,
        elapsed_seconds=elapsed,
        database_url="",
        storage_root=storage_root,
        manifest_path=DEFAULT_MANIFEST_PATH,
    )


def _parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build an isolated, large teacher-acceptance dataset."
    )
    parser.add_argument(
        "--database-url",
        default=None,
        help="Dedicated SQLite/PostgreSQL URL. Defaults to tmp/acceptance.",
    )
    parser.add_argument(
        "--storage-root",
        type=Path,
        default=DEFAULT_STORAGE_ROOT,
        help="Dedicated PDF storage root.",
    )
    parser.add_argument(
        "--manifest",
        type=Path,
        default=DEFAULT_MANIFEST_PATH,
        help="Runtime manifest output path.",
    )
    parser.add_argument("--course-count", type=int, default=DEFAULT_COURSE_COUNT)
    parser.add_argument("--student-count", type=int, default=DEFAULT_STUDENT_COUNT)
    parser.add_argument("--event-count", type=int, default=DEFAULT_EVENT_COUNT)
    parser.add_argument("--message-count", type=int, default=DEFAULT_MESSAGE_COUNT)
    parser.add_argument("--pdf-page-count", type=int, default=DEFAULT_PDF_PAGE_COUNT)
    parser.add_argument("--snapshot-points", type=int, default=DEFAULT_SNAPSHOT_POINTS)
    parser.add_argument(
        "--conversations-per-course",
        type=int,
        default=DEFAULT_CONVERSATIONS_PER_COURSE,
    )
    parser.add_argument("--reset-only", action="store_true")
    parser.add_argument("--skip-ddl", action="store_true")
    return parser.parse_args(argv)


def _default_database_url() -> str:
    path = DEFAULT_DATABASE_PATH.resolve().as_posix()
    return f"sqlite+aiosqlite:///{path}"


def _validate_isolated_database(url: str) -> None:
    parsed = make_url(url)
    if parsed.get_backend_name() == "sqlite":
        database = (parsed.database or "").lower()
        if not any(marker in database for marker in ("acceptance", "test", "demo")):
            raise ValueError(
                "Refusing to seed a SQLite database whose filename is not "
                "acceptance/test/demo scoped"
            )
        return
    database = (parsed.database or "").lower()
    if not any(marker in database for marker in ("acceptance", "test", "demo")):
        raise ValueError(
            "Refusing to seed a shared PostgreSQL database. Use a dedicated "
            "acceptance/test/demo database name."
        )


async def _run(args: argparse.Namespace) -> SeedResult | dict[str, int]:
    database_url = args.database_url or _default_database_url()
    _validate_isolated_database(database_url)
    config = AcceptanceSeedConfig(
        course_count=args.course_count,
        student_count=args.student_count,
        target_event_count=args.event_count,
        target_message_count=args.message_count,
        pdf_page_count=args.pdf_page_count,
        snapshot_points=args.snapshot_points,
        conversations_per_course=args.conversations_per_course,
    )
    config.validate()
    parsed_url = make_url(database_url)
    if parsed_url.get_backend_name() == "sqlite" and parsed_url.database not in {
        None,
        "",
        ":memory:",
    }:
        Path(parsed_url.database).expanduser().resolve().parent.mkdir(
            parents=True,
            exist_ok=True,
        )
    engine = create_async_engine(database_url, pool_pre_ping=True)
    if database_url.startswith("sqlite"):

        @event.listens_for(engine.sync_engine, "connect")
        def _enable_foreign_keys(dbapi_connection: Any, _: Any) -> None:
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

    factory = async_sessionmaker(engine, expire_on_commit=False)
    try:
        if not args.skip_ddl and database_url.startswith("sqlite"):
            async with engine.begin() as connection:
                await connection.run_sync(Base.metadata.create_all)
        async with factory() as session:
            if args.reset_only:
                await reset_teacher_acceptance(
                    session,
                    config,
                    strict_validation=True,
                )
                return {"reset": 1}
            result = await seed_teacher_acceptance(
                session,
                storage_root=args.storage_root.resolve(),
                config=config,
            )
            result.database_url = database_url
            result.manifest_path = args.manifest.resolve()
            result.manifest["execution"]["storageRoot"] = _project_relative_path(
                args.storage_root.resolve()
            )
            result.manifest["execution"]["databaseUrlKind"] = make_url(
                database_url
            ).get_backend_name()
            parsed_database = make_url(database_url).database or ""
            result.manifest["execution"]["databaseName"] = (
                Path(parsed_database).name
                if make_url(database_url).get_backend_name() == "sqlite"
                else parsed_database
            )
            _write_manifest(result.manifest, result.manifest_path)
            return result
    finally:
        await engine.dispose()


def main(argv: Sequence[str] | None = None) -> int:
    args = _parse_args(argv)
    result = asyncio.run(_run(args))
    if isinstance(result, dict):
        print(json.dumps(result, ensure_ascii=False, sort_keys=True))
        return 0
    print(
        json.dumps(
            {
                "dataset": result.manifest["datasetName"],
                "counts": result.counts,
                "elapsedSeconds": round(result.elapsed_seconds, 3),
                "manifest": str(result.manifest_path),
                "teacherEmail": result.manifest["accounts"]["teacher"]["email"],
            },
            ensure_ascii=False,
            sort_keys=True,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
