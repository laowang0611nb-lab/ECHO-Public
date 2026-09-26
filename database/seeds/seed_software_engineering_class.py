from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import math
import re
import shutil
from collections import defaultdict
from collections.abc import Sequence
from datetime import UTC, datetime, timedelta
from functools import lru_cache
from pathlib import Path
from typing import Any
from uuid import UUID, uuid5

from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.cidfonts import UnicodeCIDFont
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen.canvas import Canvas
from sqlalchemy import delete, event, func, insert, or_, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from database.config import PROJECT_ROOT
from database.db.base import Base
from database.models.analysis import (
    AIAnalysis,
    AIAnalysisEvidence,
    AIAnalysisEvidenceSource,
    AIAnalysisResult,
    AIAnalysisScope,
    AIAnalysisStage,
    AIAnalysisStageEvent,
    AIAnalysisStatus,
    AIAnalysisType,
)
from database.models.announcement import CourseAnnouncement, CourseAnnouncementRead
from database.models.chat import (
    ChatAttachment,
    Conversation,
    Message,
    MessageCitation,
    MessageRole,
    MessageStatus,
    TeachingPolicy,
)
from database.models.course import Course, CourseInvite, CourseMember, CourseStatus
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
    QuickCheckAttempt,
    StudentKnowledgeState,
)
from database.models.notification import (
    Notification,
    NotificationSeverity,
    NotificationType,
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
from database.models.profile import StudentProfile, TeacherProfile
from database.models.resource import (
    ExternalResource,
    QuestionDifficulty,
    QuestionItem,
    QuestionType,
    question_item_knowledge_points,
)
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
from database.seeds.software_engineering_causal_data import (
    upgrade_causal_evidence,
)
from database.seeds.software_engineering_class_data import (
    CHAPTER_DEFINITIONS,
    RESOURCE_DEFINITIONS,
    SCORE_BANDS,
    STUDENT_NAMES,
)

SEED_NAMESPACE = UUID("3f3d75b7-3d4b-4b57-9e2c-2d9c6a8d0f41")
DATASET_NAME = "software-engineering-class-v1"
COURSE_CODE = "SE101"
COURSE_NAME = "软件工程"
COURSE_TERM = "2026 秋季学期"
STUDENT_COUNT = len(STUDENT_NAMES)
CHAPTER_COUNT = len(CHAPTER_DEFINITIONS)
POINTS_PER_CHAPTER = 7
KNOWLEDGE_POINT_COUNT = CHAPTER_COUNT * POINTS_PER_CHAPTER
SNAPSHOT_POINTS = 7
DEFAULT_STORAGE_ROOT = PROJECT_ROOT / "tmp" / "uploads"
DEFAULT_MANIFEST_PATH = PROJECT_ROOT / "tmp" / "software-engineering-class-manifest.json"
DEFAULT_TEACHER_EMAIL = "demo.software.teacher@example.com"
INACTIVE_STUDENT_INDEXES = {43, 44, 45, 46, 47}

EVENT_TYPES = (
    LearningEventType.QUESTION_ASKED,
    LearningEventType.HINT_REQUESTED,
    LearningEventType.QUIZ_CORRECT,
    LearningEventType.QUIZ_WRONG,
    LearningEventType.CONCEPT_CONFUSION,
    LearningEventType.REPEATED_ERROR,
    LearningEventType.RESOLVED,
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
REVIEW_REASON_LABELS = {
    ReviewReason.MISSING_COURSE_BASIS: "回答缺少课程材料依据",
    ReviewReason.OUTSIDE_MATERIAL_HEAVY: "回答引用了过多课程外内容",
    ReviewReason.REPEATED_FOLLOW_UP: "同一问题重复追问但回答没有推进",
    ReviewReason.STUDENT_NOT_RESOLVED: "学生仍未解决概念混淆",
    ReviewReason.TEACHER_RULE_VIOLATION: "回答未遵守教师教学规则",
}
STAGE_DEFINITIONS = (
    (AIAnalysisStage.COLLECTING_PREVIOUS_ANALYSIS, 10, "收集已有分析结果"),
    (AIAnalysisStage.QUERYING_EVIDENCE, 30, "查询关联学习证据"),
    (AIAnalysisStage.EXPANDING_KNOWLEDGE_GRAPH, 50, "扩展知识关系"),
    (AIAnalysisStage.ANALYZING_STUDENT_IMPACT, 70, "分析影响学生"),
    (AIAnalysisStage.GENERATING_RECOMMENDATION, 90, "生成教学建议"),
)


def _seed_id(kind: str, *parts: object) -> UUID:
    key = ":".join(str(part) for part in parts)
    return uuid5(SEED_NAMESPACE, f"{kind}:{key}")


def _course_id() -> UUID:
    return _seed_id("course", COURSE_CODE)


def _teacher_id() -> UUID:
    return _seed_id("user", "teacher")


def _student_id(index: int) -> UUID:
    return _seed_id("user", "student", f"{index + 1:03d}")


def _member_id(course_id: UUID, user_id: UUID) -> UUID:
    return _seed_id("member", course_id, user_id)


def _resource_id(resource_key: str) -> UUID:
    return _seed_id("resource", resource_key)


def _chapter_id(chapter_index: int) -> UUID:
    return _seed_id("chapter", chapter_index)


def _knowledge_point_id(chapter_index: int, point_index: int) -> UUID:
    return _seed_id("knowledge-point", chapter_index, point_index)


def _conversation_id(student_index: int, conversation_index: int) -> UUID:
    return _seed_id("conversation", student_index, conversation_index)


def _message_id(
    student_index: int,
    conversation_index: int,
    message_index: int,
) -> UUID:
    return _seed_id("message", student_index, conversation_index, message_index)


def _citation_id(message_id: UUID, citation_index: int) -> UUID:
    return _seed_id("citation", message_id, citation_index)


def _question_id(question_index: int) -> UUID:
    return _seed_id("question", question_index)


def _attempt_id(student_index: int, attempt_index: int) -> UUID:
    return _seed_id("quick-check-attempt", student_index, attempt_index)


def _event_id(student_index: int, event_index: int) -> UUID:
    return _seed_id("learning-event", student_index, event_index)


def _state_id(student_index: int, point_id: UUID) -> UUID:
    return _seed_id("student-state", student_index, point_id)


def _snapshot_id(student_index: int, point_id: UUID, snapshot_index: int) -> UUID:
    return _seed_id("mastery-snapshot", student_index, point_id, snapshot_index)


def _strategy_id(key: str) -> UUID:
    return _seed_id("strategy", key)


def _strategy_version_id(key: str, version: int) -> UUID:
    return _seed_id("strategy-version", key, version)


def _plan_id(key: str) -> UUID:
    return _seed_id("plan", key)


def _plan_week_id(plan_key: str, week_number: int) -> UUID:
    return _seed_id("plan-week", plan_key, week_number)


def _task_id(plan_key: str, task_index: int) -> UUID:
    return _seed_id("plan-task", plan_key, task_index)


def _review_id(student_index: int, review_index: int) -> UUID:
    return _seed_id("review", student_index, review_index)


def _analysis_id(key: str) -> UUID:
    return _seed_id("analysis", key)


def _announcement_id(index: int) -> UUID:
    return _seed_id("announcement", index)


def _notification_id(key: str) -> UUID:
    return _seed_id("notification", key)


def _clamp(value: float, minimum: float = 0.0, maximum: float = 100.0) -> float:
    return max(minimum, min(maximum, value))


def _stable_fraction(key: str) -> float:
    digest = hashlib.blake2b(key.encode("utf-8"), digest_size=8).digest()
    return int.from_bytes(digest, "big") / (2**64 - 1)


def _local_embedding(text_value: str, dimension: int = 1024) -> list[float]:
    vector = [0.0] * dimension
    tokens = re.findall(r"[\w\u4e00-\u9fff]+", text_value.casefold())
    if not tokens:
        tokens = [text_value.casefold()]
    for token in tokens:
        digest = hashlib.blake2b(token.encode("utf-8"), digest_size=16).digest()
        primary = int.from_bytes(digest[:8], "big") % dimension
        secondary = int.from_bytes(digest[8:], "big") % dimension
        sign = 1.0 if digest[0] & 1 else -1.0
        vector[primary] += sign
        vector[secondary] += sign * 0.5
    norm = math.sqrt(sum(value * value for value in vector))
    if norm == 0:
        vector[0] = 1.0
        return vector
    return [round(value / norm, 8) for value in vector]


def _chunk_text(text_value: str, *, size: int = 760, overlap: int = 90) -> list[str]:
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


def _band_for_index(index: int) -> tuple[str, float]:
    offset = 0
    for band, count, minimum, maximum in SCORE_BANDS:
        if index < offset + count:
            position = index - offset
            fraction = position / max(count - 1, 1)
            jitter = (_stable_fraction(f"{band}:{position}") - 0.5) * 2.0
            return band, round(minimum + (maximum - minimum) * fraction + jitter, 2)
        offset += count
    raise ValueError(f"student index out of range: {index}")


def _point_difficulty(chapter_index: int, point_index: int) -> float:
    point_name = CHAPTER_DEFINITIONS[chapter_index].points[point_index].name
    critical_points = {
        "边界值分析",
        "路径覆盖",
        "条件覆盖",
        "技术债务",
        "变更影响分析",
    }
    hard_points = {
        "需求验证",
        "信息隐藏",
        "设计模式",
        "UML 类图",
        "边界值分析",
        "路径覆盖",
        "条件覆盖",
        "成本估算",
        "风险管理",
        "可用性",
        "质量门禁",
        "持续交付",
        "技术债务",
        "变更影响分析",
        "架构评审",
        "代码审查",
        "测试验收",
    }
    easy_points = {
        "软件生命周期",
        "瀑布模型",
        "黑盒测试",
        "白盒测试",
        "测试用例",
        "版本控制",
        "维护类型",
        "项目立项",
    }
    if point_name in critical_points:
        return -17.0
    if point_name in hard_points:
        return -6.0
    if point_name in easy_points:
        return 4.0
    return ((chapter_index * 3 + point_index) % 5 - 2) * 2.0


def _student_band(index: int) -> str:
    return _band_for_index(index)[0]


def _student_base_score(index: int) -> float:
    return _band_for_index(index)[1]


def _build_course(teacher_id: UUID, now: datetime) -> dict[str, Any]:
    return {
        "id": _course_id(),
        "name": COURSE_NAME,
        "description": (
            "面向软件工程专业本科二年级的完整演示课程，覆盖需求、设计、测试、"
            "项目管理、质量度量、DevOps、维护演化与综合项目实践。"
        ),
        "term": COURSE_TERM,
        "course_type": "专业必修课",
        "target_audience": "软件工程专业本科二年级",
        "expected_student_count": STUDENT_COUNT,
        "archived_at": None,
        "status": CourseStatus.PUBLISHED,
        "code": COURSE_CODE,
        "created_by": teacher_id,
        "created_at": now - timedelta(days=96),
        "updated_at": now - timedelta(days=1),
    }


def _build_students(
    course_id: UUID,
    now: datetime,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    users: list[dict[str, Any]] = []
    profiles: list[dict[str, Any]] = []
    memberships: list[dict[str, Any]] = []
    for index, display_name in enumerate(STUDENT_NAMES):
        user_id = _student_id(index)
        users.append(
            {
                "id": user_id,
                "email": f"se101.student.{index + 1:03d}@example.com",
                "phone": None,
                "username": f"se101_student_{index + 1:03d}",
                "display_name": display_name,
                "avatar_url": None,
                "avatar_storage_key": None,
                "role": UserRole.STUDENT,
                "status": UserStatus.ACTIVE,
                "last_login_at": now - timedelta(hours=(index * 11) % (24 * 9)),
                "created_at": now - timedelta(days=92 - index % 30),
                "updated_at": now - timedelta(minutes=index),
            }
        )
        profiles.append(
            {
                "user_id": user_id,
                "school_name": "ECHO 软件工程大学",
                "student_no": f"SE2026{index + 1:03d}",
                "major": "软件工程",
                "grade": "2026级",
                "class_name": "软件工程1班",
                "created_at": now - timedelta(days=92 - index % 30),
                "updated_at": now - timedelta(days=1),
            }
        )
        memberships.append(
            {
                "id": _member_id(course_id, user_id),
                "course_id": course_id,
                "user_id": user_id,
                "role": UserRole.STUDENT,
                "joined_at": now - timedelta(days=88 - index // 4),
            }
        )
    return users, profiles, memberships


def _build_teacher_membership(course_id: UUID, teacher_id: UUID, now: datetime) -> dict[str, Any]:
    return {
        "id": _member_id(course_id, teacher_id),
        "course_id": course_id,
        "user_id": teacher_id,
        "role": UserRole.TEACHER,
        "joined_at": now - timedelta(days=100),
    }


def _build_policy(course_id: UUID, teacher_id: UUID, now: datetime) -> dict[str, Any]:
    return {
        "id": _seed_id("teaching-policy", course_id),
        "course_id": course_id,
        "content": (
            "回答必须优先引用课程资料，先解释概念再用案例验证；涉及测试代码时必须说明"
            "输入、预期结果和边界条件；不能直接代做完整项目；证据不足时明确说明并建议"
            "教师复核。"
        ),
        "updated_by": teacher_id,
        "created_at": now - timedelta(days=94),
        "updated_at": now - timedelta(days=8),
    }


def _build_curriculum(
    course_id: UUID,
    textbook_id: UUID,
    now: datetime,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    chapters: list[dict[str, Any]] = []
    points: list[dict[str, Any]] = []
    for chapter_index, chapter_definition in enumerate(CHAPTER_DEFINITIONS):
        chapter_id = _chapter_id(chapter_index)
        chapters.append(
            {
                "id": chapter_id,
                "course_id": course_id,
                "document_id": textbook_id,
                "title": f"第{chapter_index + 1}章 {chapter_definition.title}",
                "summary": chapter_definition.summary,
                "order_index": chapter_index,
                "trashed_at": None,
                "created_at": now - timedelta(days=90 - chapter_index),
                "updated_at": now - timedelta(days=30 - chapter_index),
            }
        )
        for point_index, point_definition in enumerate(chapter_definition.points):
            points.append(
                {
                    "id": _knowledge_point_id(chapter_index, point_index),
                    "course_id": course_id,
                    "chapter_id": chapter_id,
                    "name": point_definition.name,
                    "description": point_definition.description,
                    "order_index": point_index,
                    "trashed_at": None,
                    "created_at": now - timedelta(days=89 - chapter_index),
                    "updated_at": now - timedelta(days=20 - point_index),
                }
            )
    return chapters, points


def _resource_type(value: str) -> ResourceType:
    return ResourceType(value)


def _resource_page_text(
    resource_key: str,
    section_title: str,
    page_number: int,
    section_page_number: int,
    section_page_count: int,
) -> str:
    focus = {
        "textbook": "概念定义、设计依据、工程实践和检查问题",
        "lab": "实验目标、前置条件、操作步骤、观察记录和提交要求",
        "exercises": "题目、分析提示、参考答案要点和评分标准",
        "srs-template": "模板说明、填写规则、示例和评审检查项",
    }[resource_key]
    return "\n".join(
        (
            f"{section_title}",
            f"第 {page_number} 页，本节第 {section_page_number} / {section_page_count} 页。",
            (
                "本页用于软件工程课程的真实 PDF 解析、页码定位、关键词检索和引用验证。"
                f"内容围绕{focus}展开，所有文字均为原始演示材料。"
            ),
            (
                f"学习主题：{section_title}。学生需要说明该主题解决的问题、关键输入、"
                "主要活动、可验证输出，以及可能影响质量或进度的风险。"
            ),
            (
                "工程方法：先建立上下文和约束，再识别利益相关者及其目标；随后用需求、"
                "设计模型或测试用例表达方案，并保留决策依据和追踪关系。"
            ),
            (
                "案例检查：假设一个课程项目需要在两周内交付增量。请比较当前方案与"
                "替代方案的成本、风险和可维护性，并写出可以验证结论的证据。"
            ),
            (
                "课堂任务：与同组同学交换方案，检查术语是否一致、边界是否清楚、"
                "验收标准是否可测量，并把发现的问题记录到项目复盘清单。"
            ),
            (
                f"页码标识：{resource_key.upper()}-{page_number:03d}。"
                "教师可以使用该标识验证 PDF 来源定位和引用跳转是否准确。"
            ),
        )
    )


@lru_cache(maxsize=1)
def _register_pdf_font() -> str:
    candidates = (
        Path("C:/Windows/Fonts/simhei.ttf"),
        Path("C:/Windows/Fonts/msyh.ttc"),
    )
    for candidate in candidates:
        if not candidate.is_file():
            continue
        try:
            if candidate.suffix.lower() == ".ttc":
                pdfmetrics.registerFont(
                    TTFont("ECHOCJK", str(candidate), subfontIndex=0)
                )
            else:
                pdfmetrics.registerFont(TTFont("ECHOCJK", str(candidate)))
            return "ECHOCJK"
        except (OSError, ValueError, RuntimeError):
            continue
    pdfmetrics.registerFont(UnicodeCIDFont("STSong-Light"))
    return "STSong-Light"


def _wrap_text(text_value: str, font_name: str, font_size: float, width: float) -> list[str]:
    lines: list[str] = []
    current = ""
    for character in text_value:
        candidate = current + character
        if current and pdfmetrics.stringWidth(candidate, font_name, font_size) > width:
            lines.append(current)
            current = character
        else:
            current = candidate
    if current:
        lines.append(current)
    return lines


def _write_pdf(
    path: Path,
    *,
    title: str,
    author: str,
    page_texts: Sequence[str],
) -> None:
    font_name = _register_pdf_font()
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.part")
    canvas = Canvas(
        str(temporary),
        pagesize=A4,
        pageCompression=1,
        invariant=1,
    )
    canvas.setTitle(title)
    canvas.setAuthor(author)
    canvas.setSubject("ECHO 软件工程课程演示资源")
    width, height = A4
    for page_number, page_text in enumerate(page_texts, start=1):
        canvas.setFillColorRGB(0.10, 0.30, 0.62)
        canvas.rect(0, height - 52, width, 52, stroke=0, fill=1)
        canvas.setFillColorRGB(1, 1, 1)
        canvas.setFont(font_name, 13)
        canvas.drawString(44, height - 33, f"ECHO · {COURSE_NAME} · {COURSE_TERM}")
        canvas.setFillColorRGB(0.16, 0.19, 0.24)
        y = height - 82
        for source_line in page_text.splitlines():
            wrapped = _wrap_text(source_line, font_name, 11, width - 88)
            for line in wrapped:
                if y < 54:
                    break
                canvas.setFont(font_name, 11)
                canvas.drawString(44, y, line)
                y -= 17
            y -= 5
            if y < 54:
                break
        canvas.setStrokeColorRGB(0.82, 0.86, 0.92)
        canvas.line(44, 42, width - 44, 42)
        canvas.setFillColorRGB(0.40, 0.44, 0.50)
        canvas.setFont(font_name, 9)
        canvas.drawString(44, 27, f"软件工程课程资料 · 第 {page_number} 页")
        canvas.drawRightString(width - 44, 27, f"共 {len(page_texts)} 页")
        canvas.showPage()
    canvas.save()
    temporary.replace(path)


def _resource_chapter_index(resource_key: str, page_number: int) -> int:
    if resource_key == "textbook":
        return min((page_number - 1) // 5, CHAPTER_COUNT - 1)
    if resource_key == "lab":
        chapter_indexes = (2, 2, 3, 6, 9, 11)
        return chapter_indexes[min((page_number - 1) // 6, len(chapter_indexes) - 1)]
    if resource_key == "exercises":
        return min((page_number - 1) // 4, CHAPTER_COUNT - 1)
    return min(page_number - 1, CHAPTER_COUNT - 1)


def _build_resources(
    course_id: UUID,
    teacher_id: UUID,
    storage_root: Path,
    now: datetime,
) -> tuple[
    list[dict[str, Any]],
    list[dict[str, Any]],
    list[dict[str, Any]],
    list[dict[str, Any]],
]:
    documents: list[dict[str, Any]] = []
    pages: list[dict[str, Any]] = []
    chunks: list[dict[str, Any]] = []
    manifest_resources: list[dict[str, Any]] = []
    for resource_definition in RESOURCE_DEFINITIONS:
        document_id = _resource_id(resource_definition.key)
        storage_key = f"courses/{course_id}/documents/{document_id}.pdf"
        page_texts: list[str] = []
        section_count = len(resource_definition.section_titles)
        for page_number in range(1, resource_definition.page_count + 1):
            section_index = min(
                int((page_number - 1) * section_count / resource_definition.page_count),
                section_count - 1,
            )
            section_page_count = math.ceil(
                resource_definition.page_count / max(section_count, 1)
            )
            section_page_number = (
                (page_number - 1)
                % max(section_page_count, 1)
            ) + 1
            page_texts.append(
                _resource_page_text(
                    resource_definition.key,
                    resource_definition.section_titles[section_index],
                    page_number,
                    section_page_number,
                    section_page_count,
                )
            )
        pdf_path = storage_root / storage_key
        _write_pdf(
            pdf_path,
            title=resource_definition.display_name,
            author=resource_definition.author,
            page_texts=page_texts,
        )
        status = (
            DocumentStatus.PARSING
            if resource_definition.parsing
            else DocumentStatus.READY
        )
        documents.append(
            {
                "id": document_id,
                "course_id": course_id,
                "uploaded_by": teacher_id,
                "original_name": resource_definition.file_name,
                "storage_key": storage_key,
                "content_type": "application/pdf",
                "size_bytes": pdf_path.stat().st_size,
                "status": status,
                "page_count": None if resource_definition.parsing else resource_definition.page_count,
                "resource_type": _resource_type(resource_definition.resource_type),
                "display_name": resource_definition.display_name,
                "summary": resource_definition.summary,
                "keywords": list(resource_definition.keywords),
                "author": resource_definition.author,
                "publisher": "ECHO 课程资源中心",
                "copyright": "原创演示材料",
                "trashed_at": None,
                "created_at": now
                - timedelta(days=84 - len(manifest_resources) * 11),
                "updated_at": now - timedelta(days=len(manifest_resources) * 3),
            }
        )
        if resource_definition.parsing:
            manifest_resources.append(
                {
                    "resourceId": str(document_id),
                    "resourceKey": resource_definition.key,
                    "title": resource_definition.display_name,
                    "fileName": resource_definition.file_name,
                    "pageCount": resource_definition.page_count,
                    "status": status.value,
                    "storageKey": storage_key,
                    "sha256": hashlib.sha256(pdf_path.read_bytes()).hexdigest(),
                }
            )
            continue

        for page_number, page_text in enumerate(page_texts, start=1):
            pages.append(
                {
                    "id": _seed_id("resource-page", document_id, page_number),
                    "document_id": document_id,
                    "page_number": page_number,
                    "text": page_text,
                    "char_count": len(page_text),
                    "width": 595,
                    "height": 842,
                    "created_at": now - timedelta(days=82),
                }
            )
        chunk_index = 0
        for page_number, page_text in enumerate(page_texts, start=1):
            chapter_index = _resource_chapter_index(
                resource_definition.key,
                page_number,
            )
            for part in _chunk_text(page_text):
                chunks.append(
                    {
                        "id": _seed_id("chunk", document_id, chunk_index),
                        "course_id": course_id,
                        "document_id": document_id,
                        "chapter_id": _chapter_id(chapter_index),
                        "chunk_index": chunk_index,
                        "page_start": page_number,
                        "page_end": page_number,
                        "content": part,
                        "char_count": len(part),
                        "metadata_json": {
                            "seed": DATASET_NAME,
                            "page_number": page_number,
                            "bbox": [44.0, 64.0, 545.0, 770.0],
                            "embedding_source": "deterministic_local_v1",
                        },
                        "embedding": _local_embedding(part),
                        "created_at": now - timedelta(days=80),
                    }
                )
                chunk_index += 1
        manifest_resources.append(
            {
                "resourceId": str(document_id),
                "resourceKey": resource_definition.key,
                "title": resource_definition.display_name,
                "fileName": resource_definition.file_name,
                "pageCount": resource_definition.page_count,
                "status": status.value,
                "storageKey": storage_key,
                "sha256": hashlib.sha256(pdf_path.read_bytes()).hexdigest(),
            }
        )
    return documents, pages, chunks, manifest_resources


def _build_knowledge_relations(
    points: Sequence[dict[str, Any]],
    now: datetime,
) -> list[dict[str, Any]]:
    relations: list[dict[str, Any]] = []
    relation_index = 0
    for point_index, point in enumerate(points):
        target = points[(point_index + 1) % len(points)]
        relation_index += 1
        relations.append(
            {
                "id": _seed_id("relation", relation_index),
                "course_id": point["course_id"],
                "source_knowledge_point_id": point["id"],
                "target_knowledge_point_id": target["id"],
                "relation_type": "related_to" if point_index % 3 else "prerequisite_of",
                "created_at": now - timedelta(days=70 - point_index // 10),
            }
        )
        if point_index % 7 == 0:
            target = points[(point_index + 8) % len(points)]
            relation_index += 1
            relations.append(
                {
                    "id": _seed_id("relation", relation_index),
                    "course_id": point["course_id"],
                    "source_knowledge_point_id": point["id"],
                    "target_knowledge_point_id": target["id"],
                    "relation_type": "applied_in",
                    "created_at": now - timedelta(days=65 - point_index // 12),
                }
            )
    return relations


def _build_questions(
    course_id: UUID,
    teacher_id: UUID,
    points: Sequence[dict[str, Any]],
    documents: Sequence[dict[str, Any]],
    now: datetime,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    questions: list[dict[str, Any]] = []
    links: list[dict[str, Any]] = []
    textbook_id = next(
        document["id"] for document in documents if document["original_name"].startswith("软件工程核心")
    )
    question_types = (
        QuestionType.SINGLE_CHOICE,
        QuestionType.TRUE_FALSE,
        QuestionType.MULTIPLE_CHOICE,
        QuestionType.SHORT_ANSWER,
    )
    for question_index in range(24):
        point = points[(question_index * 4 + question_index // 6) % len(points)]
        question_type = question_types[question_index % len(question_types)]
        options = [
            {"id": "a", "label": f"{point['name']}强调可验证的证据和明确边界"},
            {"id": "b", "label": "只要代码可以运行就不需要继续检查"},
            {"id": "c", "label": "所有项目都必须使用同一种生命周期模型"},
            {"id": "d", "label": "质量问题只能在开发结束后统一处理"},
        ]
        metadata_json = {
            "seed": DATASET_NAME,
            "options": options,
            "chapterIndex": question_index // 2,
        }
        questions.append(
            {
                "id": _question_id(question_index),
                "course_id": course_id,
                "type": question_type,
                "difficulty": QuestionDifficulty(
                    ("easy", "medium", "hard")[question_index % 3]
                ),
                "title": f"软件工程快速验证 {question_index + 1:02d}",
                "content": f"关于“{point['name']}”，下列哪项最符合课程要求？",
                "answer": "a" if question_type != QuestionType.MULTIPLE_CHOICE else "a,c",
                "explanation": (
                    f"{point['description']} 应以可验证证据、边界条件和质量目标为中心，"
                    "不能把运行成功等同于工程完成。"
                ),
                "source_document_id": textbook_id,
                "source_page": (question_index // 2) * 5 + 1,
                "metadata_json": metadata_json,
                "created_by": teacher_id,
                "trashed_at": None,
                "created_at": now - timedelta(days=45 - question_index % 20),
                "updated_at": now - timedelta(days=question_index % 10),
            }
        )
        links.append(
            {
                "question_item_id": questions[-1]["id"],
                "knowledge_point_id": point["id"],
            }
        )
    return questions, links


def _build_conversations(
    course_id: UUID,
    points: Sequence[dict[str, Any]],
    chunks: Sequence[dict[str, Any]],
    questions: Sequence[dict[str, Any]],
    now: datetime,
) -> tuple[
    list[dict[str, Any]],
    list[dict[str, Any]],
    list[dict[str, Any]],
]:
    conversations: list[dict[str, Any]] = []
    messages: list[dict[str, Any]] = []
    citations: list[dict[str, Any]] = []
    for student_index in range(STUDENT_COUNT):
        base_score = _student_base_score(student_index)
        for conversation_index in range(2):
            point_index = (
                student_index * 3 + conversation_index * 17
            ) % len(points)
            point = points[point_index]
            created_at = now - timedelta(
                days=20 - conversation_index * 8 - student_index % 7,
                hours=(student_index * 5 + conversation_index * 3) % 20,
            )
            conversation_id = _conversation_id(student_index, conversation_index)
            conversations.append(
                {
                    "id": conversation_id,
                    "course_id": course_id,
                    "user_id": _student_id(student_index),
                    "title": f"{point['name']}学习与追问",
                    "created_at": created_at,
                    "updated_at": created_at + timedelta(minutes=42),
                }
            )
            question = questions[
                (student_index + conversation_index * 7) % len(questions)
            ]
            chunk = chunks[(point_index * 3 + conversation_index) % len(chunks)]
            for message_index, role in enumerate(
                (
                    MessageRole.USER,
                    MessageRole.ASSISTANT,
                    MessageRole.USER,
                    MessageRole.ASSISTANT,
                    MessageRole.USER,
                    MessageRole.ASSISTANT,
                )
            ):
                message_id = _message_id(
                    student_index,
                    conversation_index,
                    message_index,
                )
                if role == MessageRole.USER:
                    content = (
                        f"请结合课程解释“{point['name']}”，并给我一个判断是否理解的例子。"
                        if message_index == 0
                        else f"如果我在“{point['name']}”的边界条件下判断错误，应该怎么检查？"
                    )
                    blocks: list[dict[str, Any]] = [
                        {"type": "text", "text": content}
                    ]
                else:
                    content = (
                        f"“{point['name']}”需要同时说明定义、输入条件、预期结果和证据。"
                        "课程材料强调先建立可验证的判断标准，再讨论实现细节 [1]。"
                    )
                    blocks = [{"type": "markdown", "markdown": content}]
                    if message_index == 5:
                        blocks.extend(
                            [
                                {
                                    "type": "hint",
                                    "level": 1,
                                    "title": "提示",
                                    "content": "先区分事实、假设和可验证结果，再判断答案是否成立。",
                                    "can_request_more": True,
                                },
                                {
                                    "type": "quick_check",
                                    "question_id": str(question["id"]),
                                    "title": "快速验证",
                                    "prompt": question["content"],
                                    "options": question["metadata_json"]["options"],
                                    "status": (
                                        "correct"
                                        if base_score >= 70 and student_index % 3 == 0
                                        else "unanswered"
                                    ),
                                    "selected_option_id": (
                                        "a"
                                        if base_score >= 70 and student_index % 3 == 0
                                        else None
                                    ),
                                    "attempts_remaining": 2,
                                    "correct": (
                                        True
                                        if base_score >= 70 and student_index % 3 == 0
                                        else None
                                    ),
                                    "explanation": question["explanation"],
                                    "hint": "回到课程材料中的定义和边界条件。",
                                },
                            ]
                        )
                messages.append(
                    {
                        "id": message_id,
                        "conversation_id": conversation_id,
                        "client_request_id": (
                            f"se101-{student_index + 1:03d}-"
                            f"{conversation_index + 1}-{message_index + 1}"
                        ),
                        "role": role,
                        "status": MessageStatus.COMPLETE,
                        "content": content,
                        "blocks": blocks,
                        "created_at": created_at + timedelta(minutes=message_index * 7),
                    }
                )
                if role == MessageRole.ASSISTANT:
                    citations.append(
                        {
                            "id": _citation_id(message_id, 1),
                            "message_id": message_id,
                            "citation_index": 1,
                            "chunk_id": chunk["id"],
                            "document_id": chunk["document_id"],
                            "page_start": chunk["page_start"],
                            "page_end": chunk["page_end"],
                            "document_name": "软件工程核心讲义.pdf",
                            "chapter_title": CHAPTER_DEFINITIONS[
                                point_index // POINTS_PER_CHAPTER
                            ].title,
                            "quote": chunk["content"][:500],
                            "created_at": created_at
                            + timedelta(minutes=message_index * 7),
                        }
                    )
    return conversations, messages, citations


def _build_mastery(
    course_id: UUID,
    points: Sequence[dict[str, Any]],
    now: datetime,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    states: list[dict[str, Any]] = []
    snapshots: list[dict[str, Any]] = []
    for student_index in range(STUDENT_COUNT):
        band = _student_band(student_index)
        base_score = _student_base_score(student_index)
        for point_index, point in enumerate(points):
            chapter_index = point_index // POINTS_PER_CHAPTER
            point_index_in_chapter = point_index % POINTS_PER_CHAPTER
            personal_noise = (
                _stable_fraction(f"mastery:{student_index}:{point_index}") - 0.5
            ) * 5.0
            final_score = round(
                _clamp(
                    base_score
                    + _point_difficulty(chapter_index, point_index_in_chapter)
                    + personal_noise
                ),
                2,
            )
            state_id = _state_id(student_index, point["id"])
            states.append(
                {
                    "id": state_id,
                    "course_id": course_id,
                    "user_id": _student_id(student_index),
                    "knowledge_point_id": point["id"],
                    "score": final_score,
                    "created_at": now - timedelta(days=84 - student_index % 20),
                    "updated_at": now - timedelta(hours=student_index % 12),
                }
            )
            direction = 1
            if band in {"medium", "attention", "risk"}:
                direction = 0 if band == "medium" else -1
            for snapshot_index in range(SNAPSHOT_POINTS):
                progress = snapshot_index / (SNAPSHOT_POINTS - 1)
                if direction >= 0:
                    score = final_score - (1.0 - progress) * (7.0 + point_index % 4)
                else:
                    score = final_score + (1.0 - progress) * (5.0 + point_index % 3)
                score += (
                    _stable_fraction(
                        f"snapshot:{student_index}:{point_index}:{snapshot_index}"
                    )
                    - 0.5
                ) * 2.0
                snapshots.append(
                    {
                        "id": _snapshot_id(
                            student_index,
                            point["id"],
                            snapshot_index,
                        ),
                        "course_id": course_id,
                        "user_id": _student_id(student_index),
                        "knowledge_point_id": point["id"],
                        "source_event_id": None,
                        "score": round(_clamp(score), 2),
                        "created_at": now
                        - timedelta(
                            days=(SNAPSHOT_POINTS - 1 - snapshot_index) * 7
                        ),
                    }
                )
    return states, snapshots


def _trajectory_event_type(
    student_index: int,
    event_index: int,
    band: str,
) -> LearningEventType:
    if event_index < 7:
        return (
            LearningEventType.QUESTION_ASKED,
            LearningEventType.HINT_REQUESTED,
            LearningEventType.QUIZ_WRONG,
            LearningEventType.CONCEPT_CONFUSION,
            LearningEventType.HINT_REQUESTED,
        )[event_index % 5]
    if event_index < 17:
        return (
            LearningEventType.CONCEPT_CONFUSION,
            LearningEventType.REPEATED_ERROR,
            LearningEventType.QUIZ_WRONG,
            LearningEventType.HINT_REQUESTED,
            LearningEventType.QUESTION_ASKED,
        )[(event_index + student_index) % 5]
    if event_index < 31:
        if band in {"attention", "risk"} and event_index % 4 == 0:
            return LearningEventType.REPEATED_ERROR
        return (
            LearningEventType.QUIZ_CORRECT,
            LearningEventType.RESOLVED,
            LearningEventType.HINT_REQUESTED,
            LearningEventType.QUESTION_ASKED,
        )[(event_index + student_index) % 4]
    if band in {"excellent", "good"}:
        return (
            LearningEventType.QUIZ_CORRECT,
            LearningEventType.RESOLVED,
        )[event_index % 2]
    if band == "medium":
        return (
            LearningEventType.RESOLVED,
            LearningEventType.QUIZ_WRONG,
            LearningEventType.QUESTION_ASKED,
        )[event_index % 3]
    return (
        LearningEventType.REPEATED_ERROR,
        LearningEventType.CONCEPT_CONFUSION,
        LearningEventType.QUIZ_WRONG,
        LearningEventType.HINT_REQUESTED,
    )[event_index % 4]


def _build_events(
    course_id: UUID,
    points: Sequence[dict[str, Any]],
    messages: Sequence[dict[str, Any]],
    conversations: Sequence[dict[str, Any]],
    now: datetime,
) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    messages_by_student: dict[UUID, list[dict[str, Any]]] = defaultdict(list)
    for message in messages:
        conversation = next(
            conversation
            for conversation in conversations
            if conversation["id"] == message["conversation_id"]
        )
        messages_by_student[conversation["user_id"]].append(message)
    for student_index in range(STUDENT_COUNT):
        student_id = _student_id(student_index)
        is_inactive = student_index in INACTIVE_STUDENT_INDEXES
        student_messages = messages_by_student[student_id]
        for event_index in range(42):
            if is_inactive:
                days_ago = 8 + (event_index * 3) % 20
            else:
                days_ago = event_index % 14
            point_index = (
                student_index * 5 + event_index * 7
            ) % len(points)
            if _student_band(student_index) in {"attention", "risk"}:
                point_index = (point_index + event_index % 11 * 5) % len(points)
            point = points[point_index]
            band = _student_band(student_index)
            event_type = _trajectory_event_type(student_index, event_index, band)
            message: dict[str, Any] | None = None
            conversation_id: UUID | None = None
            if student_messages and event_index % 7 == 0:
                message = student_messages[event_index % len(student_messages)]
                conversation_id = message["conversation_id"]
            event_id = _event_id(student_index, event_index)
            events.append(
                {
                    "id": event_id,
                    "course_id": course_id,
                    "user_id": student_id,
                    "knowledge_point_id": point["id"],
                    "conversation_id": conversation_id,
                    "message_id": message["id"] if message else None,
                    "plan_id": None,
                    "task_id": None,
                    "week_number": None,
                    "event_type": event_type,
                    "weight": 1.0,
                    "evidence": (
                        f"{STUDENT_NAMES[student_index]}在“{point['name']}”上的学习证据："
                        f"完成{event_type.value}活动，并记录当前判断与结果。"
                    ),
                    "metadata_json": {
                        "phase": (
                            "diagnosis"
                            if event_index < 17
                            else "practice"
                            if event_index < 31
                            else "consolidation"
                        ),
                        "source": "conversation" if message else "learning_activity",
                        "sequence": event_index,
                    },
                    "created_at": now
                    - timedelta(
                        days=days_ago,
                        hours=(event_index * 3) % 18,
                        minutes=(student_index * 7 + event_index) % 60,
                    ),
                }
            )
    return events


def _build_quick_check_attempts(
    course_id: UUID,
    questions: Sequence[dict[str, Any]],
    messages: Sequence[dict[str, Any]],
    now: datetime,
) -> list[dict[str, Any]]:
    attempts: list[dict[str, Any]] = []
    assistant_messages = [
        message for message in messages if message["role"] == MessageRole.ASSISTANT
    ]
    for student_index in range(STUDENT_COUNT):
        base_score = _student_base_score(student_index)
        for attempt_index in range(8):
            question = questions[(student_index + attempt_index * 3) % len(questions)]
            message = assistant_messages[
                (student_index * 2 + attempt_index) % len(assistant_messages)
            ]
            knowledge_point_id = next(
                link["knowledge_point_id"]
                for link in _question_links(
                    question["id"],
                    question,
                    questions,
                )
            )
            correct = (
                _stable_fraction(f"attempt:{student_index}:{attempt_index}")
                < _clamp(base_score + 8, 20, 94)
                / 100.0
            )
            attempts.append(
                {
                    "id": _attempt_id(student_index, attempt_index),
                    "course_id": course_id,
                    "user_id": _student_id(student_index),
                    "knowledge_point_id": knowledge_point_id,
                    "question_item_id": question["id"],
                    "conversation_id": message["conversation_id"],
                    "message_id": message["id"],
                    "attempt_id": f"se101-qc-{student_index + 1:03d}-{attempt_index + 1}",
                    "selected_option_id": "a" if correct else "b",
                    "correct": correct,
                    "response_json": {
                        "question": question["content"],
                        "selected": "a" if correct else "b",
                        "correctAnswer": question["answer"],
                    },
                    "created_at": now
                    - timedelta(
                        days=18 - attempt_index * 2 - student_index % 4,
                        hours=(student_index + attempt_index) % 12,
                    ),
                }
            )
    return attempts


def _question_links(
    question_id: UUID,
    question: dict[str, Any],
    questions: Sequence[dict[str, Any]],
) -> list[dict[str, Any]]:
    question_index = next(
        index for index, item in enumerate(questions) if item["id"] == question_id
    )
    point_index = (question_index * 4 + question_index // 6) % KNOWLEDGE_POINT_COUNT
    chapter_index = point_index // POINTS_PER_CHAPTER
    point_index_in_chapter = point_index % POINTS_PER_CHAPTER
    return [
        {
            "knowledge_point_id": _knowledge_point_id(
                chapter_index,
                point_index_in_chapter,
            )
        }
    ]


def _build_planning(
    course_id: UUID,
    teacher_id: UUID,
    students: Sequence[dict[str, Any]],
    points: Sequence[dict[str, Any]],
    documents: Sequence[dict[str, Any]],
    now: datetime,
) -> dict[str, list[dict[str, Any]]]:
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

    resource_refs = [
        {
            "id": str(document["id"]),
            "title": document["display_name"],
            "resourceType": document["resource_type"].value,
        }
        for document in documents
    ]
    strategy_specs = (
        (
            "testing-focus",
            "测试用例设计分层强化",
            TeachingStrategyType.CONTENT_ADJUSTMENT,
            TeachingStrategyPriority.HIGH,
            TeachingStrategyStatus.ACTIVE,
            TeachingStrategySource.AI_GENERATED,
            ("边界值分析", "变更影响分析", "质量门禁"),
        ),
        (
            "requirements-trace",
            "需求追踪矩阵补齐",
            TeachingStrategyType.DIFFERENTIATED_INSTRUCTION,
            TeachingStrategyPriority.MEDIUM,
            TeachingStrategyStatus.SUGGESTED,
            TeachingStrategySource.AI_GENERATED,
            ("需求规格说明", "需求验证", "需求变更管理"),
        ),
        (
            "design-review",
            "软件设计原则回顾",
            TeachingStrategyType.CLASSROOM_INTERACTION,
            TeachingStrategyPriority.MEDIUM,
            TeachingStrategyStatus.COMPLETED,
            TeachingStrategySource.TEACHER_CREATED,
            ("设计原则", "耦合", "内聚"),
        ),
    )
    point_by_name = {point["name"]: point for point in points}
    for strategy_index, (
        key,
        title,
        strategy_type,
        priority,
        status,
        source,
        target_names,
    ) in enumerate(strategy_specs):
        strategy_id = _strategy_id(key)
        target_points = [point_by_name[name] for name in target_names]
        target_students = list(students[8 + strategy_index * 4 : 16 + strategy_index * 4])
        strategies.append(
            {
                "id": strategy_id,
                "course_id": course_id,
                "title": title,
                "description": f"围绕{title}组织诊断、讲解、练习和效果复盘。",
                "type": strategy_type,
                "priority": priority,
                "status": status,
                "source": source,
                "version": 2 if strategy_index == 2 else 1,
                "goals": [f"提升{point['name']}的应用能力" for point in target_points],
                "teaching_methods": [
                    {"name": "证据诊断", "weight": 0.3},
                    {"name": "案例讲解", "weight": 0.35},
                    {"name": "专项练习", "weight": 0.35},
                ],
                "teaching_flow": [
                    {"order": 1, "title": "诊断", "description": "读取相关学习证据。"},
                    {"order": 2, "title": "讲解", "description": "对照课程资料讲清关键概念。"},
                    {"order": 3, "title": "练习", "description": "完成分层任务并即时反馈。"},
                    {"order": 4, "title": "复盘", "description": "比较前后掌握变化并调整策略。"},
                ],
                "personalization_rules": ["按掌握度调整任务难度", "为连续错误学生安排个别辅导"],
                "ai_rules": ["引用课程资料时必须展示来源", "证据不足时进入教师复核"],
                "expected_effect": {
                    "summary": f"预期提升{title}相关知识点平均掌握度。",
                    "targetImprovement": 8,
                },
                "generated_context": {"seed": DATASET_NAME},
                "resources_json": resource_refs,
                "created_by": teacher_id,
                "updated_by": teacher_id,
                "created_at": now - timedelta(days=26 - strategy_index * 7),
                "updated_at": now - timedelta(days=8 - strategy_index),
            }
        )
        version_count = 2 if strategy_index == 2 else 1
        for version in range(1, version_count + 1):
            strategy_versions.append(
                {
                    "id": _strategy_version_id(key, version),
                    "strategy_id": strategy_id,
                    "version": version,
                    "action": (
                        TeachingStrategyHistoryAction.GENERATED
                        if version == 1
                        else TeachingStrategyHistoryAction.COMPLETE
                    ),
                    "snapshot_json": {
                        "seed": DATASET_NAME,
                        "version": version,
                        "status": status.value,
                    },
                    "changed_by": teacher_id,
                    "created_at": now - timedelta(days=20 - version),
                }
            )
        strategy_points.extend(
            {
                "strategy_id": strategy_id,
                "knowledge_point_id": point["id"],
            }
            for point in target_points
        )
        strategy_students.extend(
            {"strategy_id": strategy_id, "user_id": student["id"]}
            for student in target_students
        )

    plan_specs = (
        (
            "testing-plan",
            "testing-focus",
            "测试用例设计四周强化计划",
            ExecutionPlanStatus.ACTIVE,
            1,
            ("边界值分析", "变更影响分析", "质量门禁"),
            10,
        ),
        (
            "design-plan",
            "design-review",
            "软件设计原则结课复盘计划",
            ExecutionPlanStatus.COMPLETED,
            2,
            ("设计原则", "耦合", "内聚"),
            8,
        ),
    )
    for plan_index, (
        plan_key,
        strategy_key,
        title,
        status,
        strategy_index,
        point_names,
        student_count,
    ) in enumerate(plan_specs):
        plan_id = _plan_id(plan_key)
        target_points = [point_by_name[name] for name in point_names]
        target_students = students[
            4 + plan_index * 6 : 4 + plan_index * 6 + student_count
        ]
        plans.append(
            {
                "id": plan_id,
                "course_id": course_id,
                "strategy_id": _strategy_id(strategy_key),
                "title": title,
                "description": f"将“{title}”拆解为四周任务，持续采集学习事件和掌握变化。",
                "status": status,
                "start_date": (now - timedelta(days=28 - plan_index * 10)).date(),
                "end_date": (now + timedelta(days=7 - plan_index * 14)).date(),
                "target_scope": PlanTargetScope.STUDENT_GROUP,
                "actions": ["课堂讲解", "专项练习", "快速验证", "个别辅导"],
                "plan_parameters": {
                    "seed": DATASET_NAME,
                    "weeklySessions": 2,
                    "difficulty": "adaptive",
                },
                "evaluation_metrics": ["掌握度变化", "Quick Check 正确率", "学习事件完成率"],
                "resources_json": resource_refs,
                "teacher_note": "用于教师端执行计划、任务和效果评估验收。",
                "created_by": teacher_id,
                "updated_by": teacher_id,
                "created_at": now - timedelta(days=30 - plan_index * 8),
                "updated_at": now - timedelta(days=2 + plan_index),
            }
        )
        plan_points.extend(
            {"plan_id": plan_id, "knowledge_point_id": point["id"]}
            for point in target_points
        )
        plan_students.extend(
            {"plan_id": plan_id, "user_id": student["id"]}
            for student in target_students
        )
        for week_number in range(1, 5):
            week_id = _plan_week_id(plan_key, week_number)
            weeks.append(
                {
                    "id": week_id,
                    "plan_id": plan_id,
                    "week_number": week_number,
                    "start_date": (
                        now - timedelta(days=28 - plan_index * 10 + (week_number - 1) * 7)
                    ).date(),
                    "end_date": (
                        now - timedelta(days=22 - plan_index * 10 + (week_number - 1) * 7)
                    ).date(),
                    "content": (
                        f"第{week_number}周：围绕{target_points[week_number % len(target_points)]['name']}"
                        "完成诊断、讲解、练习和复盘。"
                    ),
                    "knowledge_point_ids": [
                        str(point["id"]) for point in target_points
                    ],
                    "resources_json": resource_refs,
                }
            )
            for task_index in range(3):
                global_task_index = week_number * 3 + task_index
                task_id = _task_id(plan_key, global_task_index)
                task_type = (
                    PlanTaskType.CLASSROOM_LECTURE,
                    PlanTaskType.SUPPLEMENTARY_PRACTICE,
                    PlanTaskType.QUICK_CHECK,
                )[task_index]
                task_status = (
                    PlanTaskStatus.COMPLETED
                    if status == ExecutionPlanStatus.COMPLETED
                    or week_number <= 2
                    else (
                        PlanTaskStatus.IN_PROGRESS
                        if week_number == 3
                        else PlanTaskStatus.NOT_STARTED
                    )
                )
                point = target_points[global_task_index % len(target_points)]
                tasks.append(
                    {
                        "id": task_id,
                        "plan_id": plan_id,
                        "week_id": week_id,
                        "week_number": week_number,
                        "order_index": task_index,
                        "title": f"第{week_number}周 {task_type.value} · {point['name']}",
                        "description": f"围绕{point['name']}完成{task_type.value}任务。",
                        "type": task_type,
                        "status": task_status,
                        "due_at": now
                        + timedelta(
                            days=(week_number - 3) * 7 - task_index,
                            hours=18,
                        ),
                        "resources_json": resource_refs,
                        "created_by": teacher_id,
                        "created_at": now - timedelta(days=28 - plan_index * 10),
                        "updated_at": now - timedelta(days=task_index),
                    }
                )
                task_points.append(
                    {"task_id": task_id, "knowledge_point_id": point["id"]}
                )
                task_students.extend(
                    {"task_id": task_id, "user_id": student["id"]}
                    for student in target_students
                )
    return {
        "strategies": strategies,
        "strategy_versions": strategy_versions,
        "plans": plans,
        "weeks": weeks,
        "tasks": tasks,
        "strategy_points": strategy_points,
        "strategy_students": strategy_students,
        "plan_points": plan_points,
        "plan_students": plan_students,
        "task_points": task_points,
        "task_students": task_students,
    }


def _build_reviews(
    course_id: UUID,
    teacher_id: UUID,
    points: Sequence[dict[str, Any]],
    messages: Sequence[dict[str, Any]],
    citations: Sequence[dict[str, Any]],
    now: datetime,
) -> dict[str, list[dict[str, Any]]]:
    flags: list[dict[str, Any]] = []
    versions: list[dict[str, Any]] = []
    runs: list[dict[str, Any]] = []
    history: list[dict[str, Any]] = []
    assistant_messages = [
        (index, message)
        for index, message in enumerate(messages)
        if message["role"] == MessageRole.ASSISTANT
    ]
    citation_by_message = {citation["message_id"]: citation for citation in citations}
    for student_index in range(STUDENT_COUNT):
        student_messages = [
            (message_index, message)
            for message_index, message in assistant_messages
            if any(
                conversation["id"] == message["conversation_id"]
                and conversation["user_id"] == _student_id(student_index)
                for conversation in _conversation_index_by_student(student_index)
            )
        ]
        selected_messages = (
            student_messages[:2]
            if len(student_messages) >= 2
            else student_messages
        )
        for review_index, (message_index, message) in enumerate(selected_messages):
            status = REVIEW_STATUSES[
                (student_index * 2 + review_index) % len(REVIEW_STATUSES)
            ]
            reason = tuple(ReviewReason)[
                (student_index + review_index) % len(ReviewReason)
            ]
            severity = (
                ReviewSeverity.HIGH
                if _student_base_score(student_index) < 56
                else ReviewSeverity.MEDIUM
                if _student_base_score(student_index) < 72
                else ReviewSeverity.LOW
            )
            flag_id = _review_id(student_index, review_index)
            citation = citation_by_message[message["id"]]
            corrected_answer = (
                f"修订后的回答：先明确“{points[student_index % len(points)]['name']}”"
                "的定义和边界，再引用课程材料并给出可验证例子。"
            )
            reviewed = status not in {
                ReviewStatus.OPEN,
                ReviewStatus.GENERATING,
                ReviewStatus.REGENERATION_FAILED,
            }
            generation_status = {
                ReviewStatus.GENERATING: ReviewGenerationStatus.GENERATING,
                ReviewStatus.PENDING_REREVIEW: ReviewGenerationStatus.COMPLETED,
                ReviewStatus.REGENERATION_FAILED: ReviewGenerationStatus.FAILED,
            }.get(status, ReviewGenerationStatus.IDLE)
            current_version = 2 if status in {
                ReviewStatus.PENDING_REREVIEW,
                ReviewStatus.MARKED_INCORRECT,
                ReviewStatus.CONFIRMED_CORRECT,
            } else 1
            flags.append(
                {
                    "id": flag_id,
                    "course_id": course_id,
                    "conversation_id": message["conversation_id"],
                    "message_id": message["id"],
                    "student_id": _student_id(student_index),
                    "reason": reason,
                    "severity": severity,
                    "status": status,
                    "current_version": current_version,
                    "generation_status": generation_status,
                    "generation_progress": {
                        ReviewGenerationStatus.GENERATING: 65,
                        ReviewGenerationStatus.COMPLETED: 100,
                        ReviewGenerationStatus.FAILED: 42,
                    }.get(generation_status, 0),
                    "generation_error": (
                        "模型响应超时，可重新生成。"
                        if generation_status == ReviewGenerationStatus.FAILED
                        else None
                    ),
                    "details": {
                        "causeStatus": "confirmed",
                        "reasonLabel": REVIEW_REASON_LABELS[reason],
                        "citation": {
                            "documentName": citation["document_name"],
                            "pageStart": citation["page_start"],
                            "pageEnd": citation["page_end"],
                        },
                    },
                    "teacher_note": (
                        f"建议补充“{points[(student_index + review_index) % len(points)]['name']}”"
                        "的课程材料依据和边界条件。"
                        if reviewed
                        else None
                    ),
                    "corrected_answer": corrected_answer if reviewed else None,
                    "reviewed_by": teacher_id if reviewed else None,
                    "reviewed_at": now - timedelta(days=3 + review_index)
                    if reviewed
                    else None,
                    "created_at": now
                    - timedelta(
                        days=12 - review_index * 3,
                        hours=student_index % 12,
                    ),
                    "updated_at": now - timedelta(days=review_index),
                }
            )
            versions.append(
                {
                    "id": _seed_id("review-version", flag_id, 1),
                    "review_flag_id": flag_id,
                    "version": 1,
                    "answer": message["content"],
                    "knowledge_point_ids": [
                        str(points[(student_index + review_index) % len(points)]["id"])
                    ],
                    "citations": [
                        {
                            "chunk_id": str(citation["chunk_id"]),
                            "document_id": str(citation["document_id"]),
                            "page_start": citation["page_start"],
                            "page_end": citation["page_end"],
                            "quote": citation["quote"],
                        }
                    ],
                    "source": ReviewVersionSource.ORIGINAL,
                    "instruction": None,
                    "created_by": None,
                    "created_at": now - timedelta(days=12 - review_index * 3),
                }
            )
            if current_version == 2:
                versions.append(
                    {
                        "id": _seed_id("review-version", flag_id, 2),
                        "review_flag_id": flag_id,
                        "version": 2,
                        "answer": corrected_answer,
                        "knowledge_point_ids": [
                            str(
                                points[
                                    (student_index + review_index) % len(points)
                                ]["id"]
                            )
                        ],
                        "citations": [
                            {
                                "chunk_id": str(citation["chunk_id"]),
                                "document_id": str(citation["document_id"]),
                                "page_start": citation["page_start"],
                                "page_end": citation["page_end"],
                                "quote": citation["quote"],
                            }
                        ],
                        "source": ReviewVersionSource.REGENERATED,
                        "instruction": "补充课程依据并降低外部内容比例。",
                        "created_by": teacher_id,
                        "created_at": now - timedelta(days=2),
                    }
                )
            if generation_status != ReviewGenerationStatus.IDLE:
                runs.append(
                    {
                        "id": _seed_id("review-run", flag_id),
                        "review_flag_id": flag_id,
                        "status": generation_status,
                        "progress": {
                            ReviewGenerationStatus.GENERATING: 65,
                            ReviewGenerationStatus.COMPLETED: 100,
                            ReviewGenerationStatus.FAILED: 42,
                        }[generation_status],
                        "version": 2,
                        "base_version": 1,
                        "instruction": "补充课程依据并降低外部内容比例。",
                        "answer": corrected_answer
                        if generation_status == ReviewGenerationStatus.COMPLETED
                        else None,
                        "error": (
                            "模型响应超时，可重新生成。"
                            if generation_status == ReviewGenerationStatus.FAILED
                            else None
                        ),
                        "created_by": teacher_id,
                        "created_at": now - timedelta(days=4),
                        "updated_at": now - timedelta(days=1),
                    }
                )
            if reviewed:
                history.append(
                    {
                        "id": _seed_id("review-history", flag_id, 1),
                        "review_flag_id": flag_id,
                        "sequence": 1,
                        "version": 1,
                        "action": {
                            ReviewStatus.CONFIRMED_CORRECT: ReviewHistoryAction.CONFIRM_CORRECT,
                            ReviewStatus.MARKED_INCORRECT: ReviewHistoryAction.MARK_INCORRECT,
                            ReviewStatus.DISMISSED: ReviewHistoryAction.DISMISS,
                            ReviewStatus.PENDING_REREVIEW: ReviewHistoryAction.REGENERATE,
                        }.get(status, ReviewHistoryAction.CONFIRM_CORRECT),
                        "from_status": ReviewStatus.OPEN,
                        "to_status": status,
                        "teacher_id": teacher_id,
                        "note": "教师已核查课程引用和回答边界。",
                        "answer_snapshot": message["content"],
                        "corrected_answer_snapshot": (
                            corrected_answer if current_version == 2 else None
                        ),
                        "created_at": now - timedelta(days=2),
                    }
                )
    return {
        "flags": flags,
        "versions": versions,
        "runs": runs,
        "history": history,
    }


def _conversation_index_by_student(student_index: int) -> list[dict[str, Any]]:
    return [
        {
            "id": _conversation_id(student_index, conversation_index),
            "user_id": _student_id(student_index),
        }
        for conversation_index in range(2)
    ]


def _build_announcements_and_notifications(
    course_id: UUID,
    teacher_id: UUID,
    now: datetime,
) -> tuple[
    list[dict[str, Any]],
    list[dict[str, Any]],
    list[dict[str, Any]],
]:
    announcements: list[dict[str, Any]] = []
    announcement_reads: list[dict[str, Any]] = []
    notifications: list[dict[str, Any]] = []
    announcement_specs = (
        ("第 4 周学习安排", "完成需求规格说明和测试用例初稿。"),
        ("测试设计专题课", "本周重点讲解等价类划分、边界值和判定表。"),
        ("项目迭代评审", "各小组提交需求追踪矩阵和架构评审记录。"),
        ("质量门禁说明", "提交前必须通过单元测试、静态检查和文档检查。"),
        ("课程资料更新", "新增实验指导书和案例习题集，请及时阅读。"),
    )
    for index, (title, content) in enumerate(announcement_specs):
        announcement_id = _announcement_id(index)
        announcements.append(
            {
                "id": announcement_id,
                "course_id": course_id,
                "title": title,
                "content": content,
                "published_at": now - timedelta(days=24 - index * 4),
                "created_by": teacher_id,
                "created_at": now - timedelta(days=24 - index * 4),
                "updated_at": now - timedelta(days=24 - index * 4),
            }
        )
        for student_index in range(0, STUDENT_COUNT, 3 + index):
            announcement_reads.append(
                {
                    "announcement_id": announcement_id,
                    "user_id": _student_id(student_index),
                    "read_at": now - timedelta(days=20 - index * 3),
                }
            )
    notification_specs = (
        (
            "review-queue",
            NotificationType.AI_HIGH_RISK,
            NotificationSeverity.WARNING,
            "AI 回答待复核",
            "当前有 42 条回答标记需要教师复核。",
            "/ai-review",
        ),
        (
            "risk-point",
            NotificationType.STUDENT_ABNORMAL,
            NotificationSeverity.CRITICAL,
            "知识点风险预警",
            "边界值分析等 5 个知识点的课堂平均掌握度低于 60%。",
            "/ai-insights",
        ),
        (
            "inactive",
            NotificationType.STUDENT_ABNORMAL,
            NotificationSeverity.WARNING,
            "连续未学习学生",
            "有 5 名学生近 7 天没有新的学习事件。",
            "/students",
        ),
    )
    for index, (
        key,
        notification_type,
        severity,
        title,
        body,
        action_url,
    ) in enumerate(notification_specs):
        notifications.append(
            {
                "id": _notification_id(key),
                "user_id": teacher_id,
                "actor_id": None,
                "course_id": course_id,
                "type": notification_type,
                "severity": severity,
                "title": title,
                "body": body,
                "action_url": action_url,
                "payload_json": {"seed": DATASET_NAME},
                "dedupe_key": f"{DATASET_NAME}:{key}",
                "read_at": now - timedelta(days=index) if index == 2 else None,
                "created_at": now - timedelta(hours=index * 5 + 1),
            }
        )
    return announcements, announcement_reads, notifications


def _build_analyses(
    course_id: UUID,
    teacher_id: UUID,
    points: Sequence[dict[str, Any]],
    students: Sequence[dict[str, Any]],
    events: Sequence[dict[str, Any]],
    snapshots: Sequence[dict[str, Any]],
    attempts: Sequence[dict[str, Any]],
    flags: Sequence[dict[str, Any]],
    conversations: Sequence[dict[str, Any]],
    messages: Sequence[dict[str, Any]],
    citations: Sequence[dict[str, Any]],
    chunks: Sequence[dict[str, Any]],
    now: datetime,
) -> dict[str, list[dict[str, Any]]]:
    analyses: list[dict[str, Any]] = []
    evidence_rows: list[dict[str, Any]] = []
    result_rows: list[dict[str, Any]] = []
    stage_rows: list[dict[str, Any]] = []
    analysis_specs = (
        (
            "class-overview",
            AIAnalysisType.INITIAL,
            AIAnalysisScope.WHOLE_CLASS,
            None,
            AIAnalysisStatus.COMPLETED,
            100,
            "分析全班测试设计能力与课程推进风险。",
        ),
        (
            "testing-secondary",
            AIAnalysisType.SECONDARY,
            AIAnalysisScope.STUDENT_GROUP,
            "boundary-value",
            AIAnalysisStatus.COMPLETED,
            100,
            "二次分析边界值与等价类迁移表现。",
        ),
        (
            "project-progress",
            AIAnalysisType.INITIAL,
            AIAnalysisScope.WHOLE_CLASS,
            None,
            AIAnalysisStatus.ANALYZING,
            70,
            "分析综合项目实践阶段的过程质量。",
        ),
        (
            "failed-analysis",
            AIAnalysisType.INITIAL,
            AIAnalysisScope.WHOLE_CLASS,
            None,
            AIAnalysisStatus.FAILED,
            30,
            "验证分析失败状态与错误处理。",
        ),
    )
    attention_students = students[30:40]
    boundary_point = next(point for point in points if point["name"] == "边界值分析")
    conversation_student = {
        conversation["id"]: conversation["user_id"]
        for conversation in conversations
    }
    message_conversation = {
        message["id"]: message["conversation_id"] for message in messages
    }
    message_point = {
        event["message_id"]: event["knowledge_point_id"]
        for event in events
        if event.get("message_id") and event.get("knowledge_point_id")
    }
    chapter_point = {
        point["chapter_id"]: point["id"]
        for point in points
    }

    def sample_rows(
        rows: Sequence[dict[str, Any]],
        count: int,
        offset: int,
    ) -> list[dict[str, Any]]:
        if not rows or count <= 0:
            return []
        if len(rows) <= count:
            return list(rows)
        step = len(rows) / count
        indexes = [
            int((index + 0.5) * step + offset * 7) % len(rows)
            for index in range(count)
        ]
        return [rows[index] for index in dict.fromkeys(indexes)]
    for analysis_index, (
        key,
        analysis_type,
        scope,
        point_key,
        status,
        percent,
        focus,
    ) in enumerate(analysis_specs):
        analysis_id = _analysis_id(key)
        stage = (
            AIAnalysisStage.GENERATING_RECOMMENDATION
            if status == AIAnalysisStatus.COMPLETED
            else AIAnalysisStage.ANALYZING_STUDENT_IMPACT
            if status == AIAnalysisStatus.ANALYZING
            else AIAnalysisStage.QUERYING_EVIDENCE
        )
        student_ids = (
            [student["id"] for student in attention_students]
            if scope != AIAnalysisScope.WHOLE_CLASS
            else []
        )
        knowledge_point_id = (
            boundary_point["id"] if point_key == "boundary-value" else None
        )
        analyses.append(
            {
                "id": analysis_id,
                "course_id": course_id,
                "knowledge_point_id": knowledge_point_id,
                "previous_analysis_id": (
                    _analysis_id("class-overview")
                    if analysis_type == AIAnalysisType.SECONDARY
                    else None
                ),
                "analysis_type": analysis_type,
                "scope": scope,
                "student_ids": [str(student_id) for student_id in student_ids],
                "time_range_days": 28,
                "focus": focus,
                "client_request_id": f"{DATASET_NAME}:{key}",
                "status": status,
                "stage": stage,
                "progress_percent": percent,
                "progress_message": {
                    AIAnalysisStatus.COMPLETED: "分析完成，已生成教学建议。",
                    AIAnalysisStatus.ANALYZING: "正在分析学生影响范围。",
                    AIAnalysisStatus.FAILED: "模型服务超时，保留最后阶段证据。",
                }[status],
                "heartbeat_at": now - timedelta(minutes=analysis_index * 3),
                "error_message": (
                    "模型服务超时，可重新分析。"
                    if status == AIAnalysisStatus.FAILED
                    else None
                ),
                "created_by": teacher_id,
                "created_at": now - timedelta(days=10 - analysis_index),
                "started_at": now - timedelta(days=10 - analysis_index),
                "completed_at": (
                    now - timedelta(days=9 - analysis_index)
                    if status == AIAnalysisStatus.COMPLETED
                    else None
                ),
                "updated_at": now - timedelta(minutes=analysis_index * 3),
            }
        )
        for sequence, (stage_definition, stage_percent, message) in enumerate(
            STAGE_DEFINITIONS,
            start=1,
        ):
            if stage_percent > percent:
                break
            stage_rows.append(
                {
                    "id": _seed_id("analysis-stage", analysis_id, sequence),
                    "analysis_id": analysis_id,
                    "sequence": sequence,
                    "stage": stage_definition,
                    "percent": stage_percent,
                    "message": message,
                    "created_at": now
                    - timedelta(
                        days=max(10 - analysis_index, 0),
                        minutes=50 - sequence * 8,
                    ),
                }
            )
        course_conversations = [
            conversation
            for conversation in conversations
            if conversation["course_id"] == course_id
        ]
        course_conversation_ids = {
            conversation["id"] for conversation in course_conversations
        }
        course_messages = [
            message
            for message in messages
            if message["conversation_id"] in course_conversation_ids
        ]
        course_message_ids = {message["id"] for message in course_messages}
        course_citations = [
            citation
            for citation in citations
            if citation["message_id"] in course_message_ids
        ]
        course_chunks = [
            chunk for chunk in chunks if chunk["course_id"] == course_id
        ]
        course_events = [
            event for event in events if event["course_id"] == course_id
        ]
        course_snapshots = [
            snapshot for snapshot in snapshots if snapshot["course_id"] == course_id
        ]
        course_attempts = [
            attempt for attempt in attempts if attempt["course_id"] == course_id
        ]
        causal_message_ids = {
            message["id"]
            for message in course_messages
            if str(message.get("client_request_id") or "").startswith("causal-")
        }
        causal_event_ids = {
            event["id"]
            for event in course_events
            if event["metadata_json"].get("causal_chain_id")
        }
        causal_snapshot_ids = {
            snapshot["id"]
            for snapshot in course_snapshots
            if snapshot.get("source_event_id") in causal_event_ids
        }
        causal_attempt_ids = {
            attempt["id"]
            for attempt in course_attempts
            if attempt["response_json"].get("causal_chain_id")
        }
        causal_citation_ids = {
            citation["id"]
            for citation in course_citations
            if citation["message_id"] in causal_message_ids
        }
        causal_chunk_ids = {
            citation["chunk_id"]
            for citation in course_citations
            if citation["id"] in causal_citation_ids
        }
        causal_review_ids = {
            flag["id"]
            for flag in flags
            if flag["details"].get("causal_chain_id")
        }
        causal_id_sets = {
            AIAnalysisEvidenceSource.CONVERSATION_MESSAGE: causal_message_ids,
            AIAnalysisEvidenceSource.QUICK_CHECK_ATTEMPT: causal_attempt_ids,
            AIAnalysisEvidenceSource.LEARNING_EVENT: causal_event_ids,
            AIAnalysisEvidenceSource.REVIEW_FLAG: causal_review_ids,
            AIAnalysisEvidenceSource.MESSAGE_CITATION: causal_citation_ids,
            AIAnalysisEvidenceSource.KNOWLEDGE_CHUNK: causal_chunk_ids,
            AIAnalysisEvidenceSource.MASTERY_SNAPSHOT: causal_snapshot_ids,
        }
        evidence_source_specs = (
            (
                AIAnalysisEvidenceSource.CONVERSATION_MESSAGE,
                course_messages,
                18,
                "学生对话",
            ),
            (
                AIAnalysisEvidenceSource.QUICK_CHECK_ATTEMPT,
                course_attempts,
                18,
                "测验结果",
            ),
            (
                AIAnalysisEvidenceSource.LEARNING_EVENT,
                course_events,
                30,
                "LearningEvent",
            ),
            (
                AIAnalysisEvidenceSource.REVIEW_FLAG,
                flags,
                10,
                "AI 回答审核标记",
            ),
            (
                AIAnalysisEvidenceSource.MESSAGE_CITATION,
                course_citations,
                12,
                "回答引用来源",
            ),
            (
                AIAnalysisEvidenceSource.KNOWLEDGE_CHUNK,
                course_chunks,
                12,
                "课程资料片段",
            ),
            (
                AIAnalysisEvidenceSource.MASTERY_SNAPSHOT,
                course_snapshots,
                20,
                "掌握度快照",
            ),
        )
        evidence_ids_by_type: dict[AIAnalysisEvidenceSource, list[UUID]] = {}
        for source_index, (
            source_type,
            rows,
            count,
            label,
        ) in enumerate(evidence_source_specs):
            causal_ids = causal_id_sets.get(source_type, set())
            prioritized_rows = sorted(
                rows,
                key=lambda row: 0 if row["id"] in causal_ids else 1,
            )
            selected_rows = sample_rows(
                prioritized_rows,
                count,
                analysis_index + source_index,
            )
            evidence_ids_by_type[source_type] = []
            for row_index, row in enumerate(selected_rows):
                evidence_id = _seed_id(
                    "analysis-evidence",
                    analysis_id,
                    source_type.value,
                    row_index,
                )
                evidence_ids_by_type[source_type].append(evidence_id)
                source_id = row["id"]
                student_id = row.get("user_id")
                point_id = row.get("knowledge_point_id") or knowledge_point_id
                description = f"用于支持“{focus}”的分析证据。"
                snapshot_json: dict[str, object] = {
                    "sourceType": source_type.value,
                    "sourceId": str(source_id),
                }
                if source_type == AIAnalysisEvidenceSource.CONVERSATION_MESSAGE:
                    student_id = conversation_student.get(row["conversation_id"])
                    point_id = message_point.get(row["id"]) or knowledge_point_id
                    description = str(row["content"])[:500]
                    label_text = f"学生对话：{row['role'].value}"
                    snapshot_json.update(
                        {
                            "conversation_id": str(row["conversation_id"]),
                            "role": row["role"].value,
                            "content": str(row["content"])[:500],
                        }
                    )
                elif source_type == AIAnalysisEvidenceSource.QUICK_CHECK_ATTEMPT:
                    description = "Quick Check 答对" if row["correct"] else "Quick Check 答错"
                    label_text = "测验结果：答对" if row["correct"] else "测验结果：答错"
                    snapshot_json.update(
                        {
                            "question_item_id": str(row["question_item_id"]),
                            "selected_option_id": row["selected_option_id"],
                            "correct": row["correct"],
                        }
                    )
                elif source_type == AIAnalysisEvidenceSource.LEARNING_EVENT:
                    description = row["evidence"]
                    label_text = f"LearningEvent：{row['event_type'].value}"
                    snapshot_json.update(
                        {
                            "event_type": row["event_type"].value,
                            "weight": row["weight"],
                            "metadata": row["metadata_json"],
                        }
                    )
                elif source_type == AIAnalysisEvidenceSource.REVIEW_FLAG:
                    student_id = row["student_id"]
                    point_id = message_point.get(row["message_id"]) or knowledge_point_id
                    description = row.get("teacher_note") or row["reason"].value
                    label_text = f"AI审核：{row['reason'].value}"
                    snapshot_json.update(
                        {
                            "status": row["status"].value,
                            "severity": row["severity"].value,
                            "message_id": str(row["message_id"]),
                        }
                    )
                elif source_type == AIAnalysisEvidenceSource.MESSAGE_CITATION:
                    message_id = row["message_id"]
                    conversation_id = message_conversation.get(message_id)
                    student_id = conversation_student.get(conversation_id)
                    point_id = message_point.get(message_id) or knowledge_point_id
                    description = str(row["quote"])[:500]
                    label_text = f"引用来源：第 {row['page_start']}-{row['page_end']} 页"
                    snapshot_json.update(
                        {
                            "message_id": str(message_id),
                            "chunk_id": str(row["chunk_id"]),
                            "document_id": str(row["document_id"]),
                            "page_start": row["page_start"],
                            "page_end": row["page_end"],
                        }
                    )
                elif source_type == AIAnalysisEvidenceSource.KNOWLEDGE_CHUNK:
                    student_id = None
                    point_id = chapter_point.get(row["chapter_id"]) or knowledge_point_id
                    description = str(row["content"])[:500]
                    label_text = f"课程资料：第 {row['page_start']} 页"
                    snapshot_json.update(
                        {
                            "document_id": str(row["document_id"]),
                            "chapter_id": str(row["chapter_id"]),
                            "page_start": row["page_start"],
                            "page_end": row["page_end"],
                        }
                    )
                else:
                    description = f"掌握度 {row['score']:.2f}"
                    label_text = "掌握度快照"
                    snapshot_json.update(
                        {
                            "score": row["score"],
                            "source_event_id": (
                                str(row["source_event_id"])
                                if row.get("source_event_id")
                                else None
                            ),
                        }
                    )
                evidence_rows.append(
                    {
                        "id": evidence_id,
                        "analysis_id": analysis_id,
                        "source_type": source_type,
                        "source_id": source_id,
                        "student_id": student_id,
                        "knowledge_point_id": point_id,
                        "label": label_text,
                        "description": description,
                        "snapshot_json": snapshot_json,
                        "created_at": now - timedelta(days=8 - analysis_index),
                    }
                )
        if analysis_type == AIAnalysisType.SECONDARY:
            previous_analysis_id = _analysis_id("class-overview")
            previous_evidence_id = _seed_id(
                "analysis-evidence",
                analysis_id,
                AIAnalysisEvidenceSource.INITIAL_ANALYSIS.value,
                0,
            )
            evidence_ids_by_type[
                AIAnalysisEvidenceSource.INITIAL_ANALYSIS
            ] = [previous_evidence_id]
            evidence_rows.append(
                {
                    "id": previous_evidence_id,
                    "analysis_id": analysis_id,
                    "source_type": AIAnalysisEvidenceSource.INITIAL_ANALYSIS,
                    "source_id": previous_analysis_id,
                    "student_id": None,
                    "knowledge_point_id": knowledge_point_id,
                    "label": "前序分析结果",
                    "description": "引用首次分析结论继续二次分析。",
                    "snapshot_json": {
                        "sourceType": AIAnalysisEvidenceSource.INITIAL_ANALYSIS.value,
                        "sourceId": str(previous_analysis_id),
                    },
                    "created_at": now - timedelta(days=8 - analysis_index),
                }
            )
        if status == AIAnalysisStatus.COMPLETED:
            result_rows.append(
                {
                    "analysis_id": analysis_id,
                    "conclusion": (
                        "班级在软件工程基础概念上表现稳定，但测试用例设计、变更影响分析"
                        "和项目质量门禁仍是主要薄弱环节。"
                    ),
                    "root_cause": (
                        "学生能够复述定义，但把定义迁移到边界输入、异常流程和可验证交付时"
                        "缺少稳定检查步骤。"
                    ),
                    "recommendation": (
                        "采用“定义对照、边界检查、证据复述、快速验证”四步教学流程，"
                        "并对连续错误学生安排个别辅导。"
                    ),
                    "affected_student_ids": [
                        str(student["id"]) for student in attention_students
                    ],
                    "facts": [
                        {
                            "fact": "边界值分析平均掌握度低于课程整体平均。",
                            "evidence_ids": [
                                str(value)
                                for value in evidence_ids_by_type.get(
                                    AIAnalysisEvidenceSource.MASTERY_SNAPSHOT,
                                    [],
                                )[:2]
                            ],
                        },
                        {
                            "fact": "连续错误学生集中在测试设计与变更影响分析。",
                            "evidence_ids": [
                                *[
                                    str(value)
                                    for value in evidence_ids_by_type.get(
                                        AIAnalysisEvidenceSource.QUICK_CHECK_ATTEMPT,
                                        [],
                                    )[:1]
                                ],
                                *[
                                    str(value)
                                    for value in evidence_ids_by_type.get(
                                        AIAnalysisEvidenceSource.LEARNING_EVENT,
                                        [],
                                    )[:1]
                                ],
                            ],
                        },
                        {
                            "fact": "学生对话和引用来源共同解释了追问与材料依据。",
                            "evidence_ids": [
                                *[
                                    str(value)
                                    for value in evidence_ids_by_type.get(
                                        AIAnalysisEvidenceSource.CONVERSATION_MESSAGE,
                                        [],
                                    )[:1]
                                ],
                                *[
                                    str(value)
                                    for value in evidence_ids_by_type.get(
                                        AIAnalysisEvidenceSource.MESSAGE_CITATION,
                                        [],
                                    )[:1]
                                ],
                            ],
                        },
                    ],
                    "evidence_summary": [
                        {
                            "sourceType": source_type.value,
                            "count": len(
                                evidence_ids_by_type.get(source_type, [])
                            ),
                        }
                        for source_type in evidence_ids_by_type
                    ],
                    "recommendation_payload": {
                        "strategyKey": "testing-focus",
                        "durationWeeks": 4,
                        "targetKnowledgePoints": ["边界值分析", "变更影响分析", "质量门禁"],
                    },
                    "insufficient_evidence": False,
                    "model_name": "causal-evidence-fixture-v1",
                    "strategy_id": _strategy_id("testing-focus"),
                    "generated_at": now - timedelta(days=8 - analysis_index),
                    "updated_at": now - timedelta(days=8 - analysis_index),
                }
            )
    return {
        "analyses": analyses,
        "evidence": evidence_rows,
        "results": result_rows,
        "stages": stage_rows,
    }


async def _insert_many(
    session: AsyncSession,
    model: Any,
    rows: Sequence[dict[str, Any]],
    *,
    batch_size: int = 1000,
) -> None:
    for start in range(0, len(rows), batch_size):
        await session.execute(insert(model), list(rows[start : start + batch_size]))


async def _resolve_teacher(
    session: AsyncSession,
    requested_email: str | None,
) -> User:
    if requested_email:
        teacher = await session.scalar(
            select(User).where(
                func.lower(User.email) == requested_email.casefold(),
                User.role == UserRole.TEACHER,
            )
        )
        if teacher is None:
            raise ValueError(f"Teacher account not found: {requested_email}")
    else:
        teacher = await session.scalar(
            select(User)
            .where(
                User.role == UserRole.TEACHER,
                User.status == UserStatus.ACTIVE,
            )
            .order_by(User.created_at, User.id)
            .limit(1)
        )
    if teacher is None:
        teacher = User(
            id=_teacher_id(),
            email=DEFAULT_TEACHER_EMAIL,
            username="software_engineering_demo_teacher",
            display_name="软件工程演示教师",
            role=UserRole.TEACHER,
            status=UserStatus.ACTIVE,
        )
        session.add(teacher)
        await session.flush()
    profile = await session.get(TeacherProfile, teacher.id)
    if profile is None:
        session.add(
            TeacherProfile(
                user_id=teacher.id,
                school_name="ECHO 软件工程大学",
                department="软件工程系",
                employee_no="SE-T-0001",
                title="副教授",
                teaching_fields=["软件工程", "软件测试", "项目管理"],
            )
        )
    return teacher


async def _remove_course_storage(storage_root: Path, course_id: UUID) -> None:
    root = storage_root.resolve()
    target = (root / "courses" / str(course_id)).resolve()
    if not target.is_relative_to(root):
        raise ValueError("course storage path escapes configured root")
    if target.exists():
        shutil.rmtree(target)


async def _delete_previous_seed(
    session: AsyncSession,
    storage_root: Path,
) -> None:
    course_id = _course_id()
    student_ids = [_student_id(index) for index in range(STUDENT_COUNT)]
    analysis_ids = select(AIAnalysis.id).where(AIAnalysis.course_id == course_id)
    review_ids = select(AIReviewFlag.id).where(AIReviewFlag.course_id == course_id)
    conversation_ids = select(Conversation.id).where(
        Conversation.course_id == course_id
    )
    message_ids = select(Message.id).where(
        Message.conversation_id.in_(conversation_ids)
    )
    document_ids = select(Document.id).where(Document.course_id == course_id)
    strategy_ids = select(TeachingStrategy.id).where(
        TeachingStrategy.course_id == course_id
    )
    plan_ids = select(ExecutionPlan.id).where(ExecutionPlan.course_id == course_id)
    task_ids = select(PlanTask.id).where(PlanTask.plan_id.in_(plan_ids))
    question_ids = select(QuestionItem.id).where(
        QuestionItem.course_id == course_id
    )
    announcement_ids = select(CourseAnnouncement.id).where(
        CourseAnnouncement.course_id == course_id
    )

    await session.execute(delete(Notification).where(Notification.course_id == course_id))
    await session.execute(
        delete(Notification).where(Notification.user_id.in_(student_ids))
    )
    await session.execute(
        delete(AIAnalysisResult).where(
            AIAnalysisResult.analysis_id.in_(analysis_ids)
        )
    )
    await session.execute(
        delete(AIAnalysisEvidence).where(
            AIAnalysisEvidence.analysis_id.in_(analysis_ids)
        )
    )
    await session.execute(
        delete(AIAnalysisStageEvent).where(
            AIAnalysisStageEvent.analysis_id.in_(analysis_ids)
        )
    )
    await session.execute(delete(AIAnalysis).where(AIAnalysis.course_id == course_id))
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
    await session.execute(delete(AIReviewFlag).where(AIReviewFlag.course_id == course_id))
    await session.execute(
        delete(QuickCheckAttempt).where(QuickCheckAttempt.course_id == course_id)
    )
    await session.execute(
        delete(LearningEvent).where(LearningEvent.course_id == course_id)
    )
    await session.execute(
        delete(StudentKnowledgeState).where(
            StudentKnowledgeState.course_id == course_id
        )
    )
    await session.execute(
        delete(MasterySnapshot).where(MasterySnapshot.course_id == course_id)
    )
    await session.execute(
        delete(ChatAttachment).where(
            or_(
                ChatAttachment.conversation_id.in_(conversation_ids),
                ChatAttachment.message_id.in_(message_ids),
            )
        )
    )
    await session.execute(
        delete(MessageCitation).where(MessageCitation.message_id.in_(message_ids))
    )
    await session.execute(delete(Message).where(Message.conversation_id.in_(conversation_ids)))
    await session.execute(delete(Conversation).where(Conversation.course_id == course_id))
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
    await session.execute(
        delete(ExecutionPlanGeneration).where(
            ExecutionPlanGeneration.plan_id.in_(plan_ids)
        )
    )
    await session.execute(delete(PlanTask).where(PlanTask.plan_id.in_(plan_ids)))
    await session.execute(
        delete(ExecutionPlanWeek).where(ExecutionPlanWeek.plan_id.in_(plan_ids))
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
    await session.execute(delete(TeachingPolicy).where(TeachingPolicy.course_id == course_id))
    await session.execute(
        delete(question_item_knowledge_points).where(
            question_item_knowledge_points.c.question_item_id.in_(question_ids)
        )
    )
    await session.execute(delete(QuestionItem).where(QuestionItem.course_id == course_id))
    await session.execute(
        delete(ExternalResource).where(ExternalResource.course_id == course_id)
    )
    await session.execute(
        delete(KnowledgeRelation).where(KnowledgeRelation.course_id == course_id)
    )
    await session.execute(delete(KnowledgeChunk).where(KnowledgeChunk.course_id == course_id))
    await session.execute(delete(KnowledgePoint).where(KnowledgePoint.course_id == course_id))
    await session.execute(delete(Chapter).where(Chapter.course_id == course_id))
    await session.execute(
        delete(DocumentPage).where(DocumentPage.document_id.in_(document_ids))
    )
    await session.execute(delete(Document).where(Document.course_id == course_id))
    await session.execute(
        delete(CourseAnnouncementRead).where(
            CourseAnnouncementRead.announcement_id.in_(announcement_ids)
        )
    )
    await session.execute(
        delete(CourseAnnouncement).where(CourseAnnouncement.course_id == course_id)
    )
    await session.execute(delete(CourseInvite).where(CourseInvite.course_id == course_id))
    await session.execute(delete(CourseMember).where(CourseMember.course_id == course_id))
    await session.execute(delete(Course).where(Course.id == course_id))
    await session.execute(delete(User).where(User.id.in_(student_ids)))
    await session.flush()
    await _remove_course_storage(storage_root, course_id)


async def reset_software_engineering_class(
    session: AsyncSession,
    storage_root: Path,
) -> None:
    await _delete_previous_seed(session, storage_root)
    await session.commit()


async def _validate_identity_conflicts(
    session: AsyncSession,
    teacher: User,
) -> None:
    student_ids = [_student_id(index) for index in range(STUDENT_COUNT)]
    student_emails = [
        f"se101.student.{index + 1:03d}@example.com"
        for index in range(STUDENT_COUNT)
    ]
    conflict = await session.scalar(
        select(User.id).where(
            User.id.not_in(student_ids),
            or_(
                User.email.in_(student_emails),
                User.username.in_(
                    [
                        f"se101_student_{index + 1:03d}"
                        for index in range(STUDENT_COUNT)
                    ]
                ),
            ),
        )
    )
    if conflict is not None:
        raise ValueError("A non-seed user already uses a SE101 demo email or username")
    existing_code = await session.scalar(
        select(Course.id).where(
            Course.code == COURSE_CODE,
            Course.id != _course_id(),
        )
    )
    if existing_code is not None:
        raise ValueError(f"Course code {COURSE_CODE} is already used by another course")
    if teacher.role != UserRole.TEACHER:
        raise ValueError("Resolved account is not a teacher")


async def _collect_counts(
    session: AsyncSession,
    teacher_id: UUID,
) -> dict[str, int]:
    course_id = _course_id()
    documents = select(Document.id).where(Document.course_id == course_id)
    conversations = select(Conversation.id).where(Conversation.course_id == course_id)
    messages = select(Message.id).where(Message.conversation_id.in_(conversations))
    checks: tuple[tuple[str, Any, Any], ...] = (
        ("courses", Course, Course.id == course_id),
        (
            "students",
            User,
            User.id.in_([_student_id(index) for index in range(STUDENT_COUNT)]),
        ),
        ("members", CourseMember, CourseMember.course_id == course_id),
        ("resources", Document, Document.course_id == course_id),
        (
            "pages",
            DocumentPage,
            DocumentPage.document_id.in_(documents),
        ),
        ("chapters", Chapter, Chapter.course_id == course_id),
        ("knowledgePoints", KnowledgePoint, KnowledgePoint.course_id == course_id),
        ("chunks", KnowledgeChunk, KnowledgeChunk.course_id == course_id),
        ("learningEvents", LearningEvent, LearningEvent.course_id == course_id),
        (
            "knowledgeStates",
            StudentKnowledgeState,
            StudentKnowledgeState.course_id == course_id,
        ),
        ("masterySnapshots", MasterySnapshot, MasterySnapshot.course_id == course_id),
        ("conversations", Conversation, Conversation.course_id == course_id),
        ("messages", Message, Message.conversation_id.in_(conversations)),
        (
            "citations",
            MessageCitation,
            MessageCitation.message_id.in_(messages),
        ),
        ("reviews", AIReviewFlag, AIReviewFlag.course_id == course_id),
        (
            "reviewVersions",
            ReviewAnswerVersion,
            ReviewAnswerVersion.review_flag_id.in_(
                select(AIReviewFlag.id).where(AIReviewFlag.course_id == course_id)
            ),
        ),
        (
            "reviewRuns",
            ReviewRegenerationRun,
            ReviewRegenerationRun.review_flag_id.in_(
                select(AIReviewFlag.id).where(AIReviewFlag.course_id == course_id)
            ),
        ),
        ("strategies", TeachingStrategy, TeachingStrategy.course_id == course_id),
        ("plans", ExecutionPlan, ExecutionPlan.course_id == course_id),
        ("analyses", AIAnalysis, AIAnalysis.course_id == course_id),
        (
            "analysisEvidence",
            AIAnalysisEvidence,
            AIAnalysisEvidence.analysis_id.in_(
                select(AIAnalysis.id).where(AIAnalysis.course_id == course_id)
            ),
        ),
        (
            "analysisResults",
            AIAnalysisResult,
            AIAnalysisResult.analysis_id.in_(
                select(AIAnalysis.id).where(AIAnalysis.course_id == course_id)
            ),
        ),
        ("questions", QuestionItem, QuestionItem.course_id == course_id),
        (
            "announcements",
            CourseAnnouncement,
            CourseAnnouncement.course_id == course_id,
        ),
        (
            "notifications",
            Notification,
            Notification.course_id == course_id,
        ),
    )
    counts: dict[str, int] = {}
    for name, model, condition in checks:
        counts[name] = int(
            await session.scalar(select(func.count()).select_from(model).where(condition))
            or 0
        )
    counts["embeddedChunks"] = int(
        await session.scalar(
            select(func.count())
            .select_from(KnowledgeChunk)
            .where(
                KnowledgeChunk.course_id == course_id,
                KnowledgeChunk.embedding.is_not(None),
            )
        )
        or 0
    )
    counts["quickCheckAttempts"] = int(
        await session.scalar(
            select(func.count())
            .select_from(QuickCheckAttempt)
            .where(QuickCheckAttempt.course_id == course_id)
        )
        or 0
    )
    counts["teachers"] = int(
        await session.scalar(select(func.count()).select_from(User).where(User.id == teacher_id))
        or 0
    )
    return counts


async def seed_software_engineering_class(
    session: AsyncSession,
    *,
    storage_root: Path,
    teacher_email: str | None = None,
) -> dict[str, Any]:
    now = datetime.now(UTC)
    teacher = await _resolve_teacher(session, teacher_email)
    await _validate_identity_conflicts(session, teacher)
    await _delete_previous_seed(session, storage_root)

    course_id = _course_id()
    course = _build_course(teacher.id, now)
    students, student_profiles, memberships = _build_students(course_id, now)
    teacher_membership = _build_teacher_membership(course_id, teacher.id, now)
    policy = _build_policy(course_id, teacher.id, now)
    textbook_id = _resource_id("textbook")
    chapters, points = _build_curriculum(course_id, textbook_id, now)
    documents, pages, chunks, resource_manifest = _build_resources(
        course_id,
        teacher.id,
        storage_root,
        now,
    )
    relations = _build_knowledge_relations(points, now)
    questions, question_links = _build_questions(
        course_id,
        teacher.id,
        points,
        documents,
        now,
    )
    conversations, messages, citations = _build_conversations(
        course_id,
        points,
        chunks,
        questions,
        now,
    )
    states, snapshots = _build_mastery(course_id, points, now)
    events = _build_events(course_id, points, messages, conversations, now)
    attempts = _build_quick_check_attempts(
        course_id,
        questions,
        messages,
        now,
    )
    planning = _build_planning(
        course_id,
        teacher.id,
        students,
        points,
        documents,
        now,
    )
    reviews = _build_reviews(
        course_id,
        teacher.id,
        points,
        messages,
        citations,
        now,
    )
    causal_design = upgrade_causal_evidence(
        course_id=course_id,
        teacher_id=teacher.id,
        students=students,
        points=points,
        documents=documents,
        chunks=chunks,
        questions=questions,
        question_links=question_links,
        conversations=conversations,
        messages=messages,
        citations=citations,
        attempts=attempts,
        events=events,
        states=states,
        snapshots=snapshots,
        planning=planning,
        reviews=reviews,
        now=now,
    )
    announcements, announcement_reads, notifications = (
        _build_announcements_and_notifications(course_id, teacher.id, now)
    )
    analysis = _build_analyses(
        course_id,
        teacher.id,
        points,
        students,
        events,
        snapshots,
        attempts,
        reviews["flags"],
        conversations,
        messages,
        citations,
        chunks,
        now,
    )

    await _insert_many(session, User, students)
    await _insert_many(session, StudentProfile, student_profiles)
    await _insert_many(session, Course, [course])
    await _insert_many(session, CourseMember, [teacher_membership, *memberships])
    await _insert_many(session, TeachingPolicy, [policy])
    await _insert_many(session, Document, documents)
    await _insert_many(session, DocumentPage, pages)
    await _insert_many(session, Chapter, chapters)
    await _insert_many(session, KnowledgePoint, points)
    await _insert_many(session, KnowledgeChunk, chunks, batch_size=250)
    await _insert_many(session, KnowledgeRelation, relations)
    await _insert_many(session, QuestionItem, questions)
    await _insert_many(session, TeachingStrategy, planning["strategies"])
    await _insert_many(
        session,
        TeachingStrategyVersion,
        planning["strategy_versions"],
    )
    await _insert_many(session, ExecutionPlan, planning["plans"])
    await _insert_many(session, ExecutionPlanWeek, planning["weeks"])
    await _insert_many(session, PlanTask, planning["tasks"])
    await session.execute(
        insert(strategy_target_knowledge_points),
        planning["strategy_points"],
    )
    await session.execute(
        insert(strategy_target_students),
        planning["strategy_students"],
    )
    await session.execute(
        insert(plan_target_knowledge_points),
        planning["plan_points"],
    )
    await session.execute(insert(plan_target_students), planning["plan_students"])
    await session.execute(insert(plan_task_knowledge_points), planning["task_points"])
    await session.execute(insert(plan_task_target_students), planning["task_students"])
    await _insert_many(session, Conversation, conversations)
    await _insert_many(session, Message, messages)
    await _insert_many(session, MessageCitation, citations)
    await session.execute(
        insert(question_item_knowledge_points),
        question_links,
    )
    await _insert_many(session, QuickCheckAttempt, attempts)
    await _insert_many(session, LearningEvent, events, batch_size=1000)
    await _insert_many(session, StudentKnowledgeState, states, batch_size=1000)
    await _insert_many(session, MasterySnapshot, snapshots, batch_size=2000)
    await _insert_many(session, AIReviewFlag, reviews["flags"])
    await _insert_many(session, ReviewAnswerVersion, reviews["versions"])
    await _insert_many(session, ReviewRegenerationRun, reviews["runs"])
    await _insert_many(session, ReviewHistoryEntry, reviews["history"])
    await _insert_many(session, AIAnalysis, analysis["analyses"])
    await _insert_many(session, AIAnalysisEvidence, analysis["evidence"])
    await _insert_many(session, AIAnalysisStageEvent, analysis["stages"])
    await _insert_many(session, AIAnalysisResult, analysis["results"])
    await _insert_many(session, CourseAnnouncement, announcements)
    await _insert_many(session, CourseAnnouncementRead, announcement_reads)
    await _insert_many(session, Notification, notifications)
    await session.commit()

    counts = await _collect_counts(session, teacher.id)
    manifest = {
        "manifestVersion": 1,
        "datasetName": DATASET_NAME,
        "namespace": str(SEED_NAMESPACE),
        "generatedAt": now.isoformat(),
        "course": {
            "courseId": str(course_id),
            "courseCode": COURSE_CODE,
            "courseName": COURSE_NAME,
            "term": COURSE_TERM,
            "studentCount": STUDENT_COUNT,
            "chapterCount": CHAPTER_COUNT,
            "knowledgePointCount": KNOWLEDGE_POINT_COUNT,
        },
        "teacher": {
            "userId": str(teacher.id),
            "email": teacher.email,
            "displayName": teacher.display_name,
        },
        "students": [
            {
                "userId": str(_student_id(index)),
                "studentNo": f"SE2026{index + 1:03d}",
                "displayName": STUDENT_NAMES[index],
                "band": _student_band(index),
                "baseScore": _student_base_score(index),
            }
            for index in range(STUDENT_COUNT)
        ],
        "resources": resource_manifest,
        "causalDesign": causal_design,
        "counts": counts,
        "storageRoot": str(storage_root.resolve()),
        "resetCommand": (
            "apps\\api\\.venv\\Scripts\\python.exe -m "
            "database.seeds.seed_software_engineering_class --reset-only"
        ),
        "secretsIncluded": False,
    }
    return manifest


def _write_manifest(manifest: dict[str, Any], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def _parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Seed the complete 48-student software engineering demo course."
    )
    parser.add_argument("--database-url", default=None)
    parser.add_argument("--storage-root", type=Path, default=DEFAULT_STORAGE_ROOT)
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST_PATH)
    parser.add_argument("--teacher-email", default=None)
    parser.add_argument("--reset-only", action="store_true")
    return parser.parse_args(argv)


async def _run(args: argparse.Namespace) -> dict[str, Any]:
    database_url = args.database_url
    if database_url is None:
        from database.db.session import async_session_factory
        from database.db.session import engine as default_engine

        active_engine = default_engine
        factory = async_session_factory
    else:
        engine = create_async_engine(database_url, pool_pre_ping=True)
        active_engine = engine
        factory = async_sessionmaker(active_engine, expire_on_commit=False)
        if database_url.startswith("sqlite"):

            @event.listens_for(active_engine.sync_engine, "connect")
            def _enable_foreign_keys(dbapi_connection: Any, _: Any) -> None:
                cursor = dbapi_connection.cursor()
                cursor.execute("PRAGMA foreign_keys=ON")
                cursor.close()

            async with active_engine.begin() as connection:
                await connection.run_sync(Base.metadata.create_all)
    try:
        async with factory() as session:
            if args.reset_only:
                await reset_software_engineering_class(
                    session,
                    args.storage_root.resolve(),
                )
                return {"reset": True, "courseId": str(_course_id())}
            return await seed_software_engineering_class(
                session,
                storage_root=args.storage_root.resolve(),
                teacher_email=args.teacher_email,
            )
    finally:
        if database_url is not None:
            await active_engine.dispose()


def main(argv: Sequence[str] | None = None) -> int:
    args = _parse_args(argv)
    manifest = asyncio.run(_run(args))
    if not args.reset_only:
        _write_manifest(manifest, args.manifest.resolve())
    print(json.dumps(manifest, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
