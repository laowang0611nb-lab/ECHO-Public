from collections import defaultdict
from datetime import UTC, date, datetime, time, timedelta
from uuid import UUID
from zoneinfo import ZoneInfo

from database.models.document import Document
from database.models.knowledge import Chapter, KnowledgePoint
from database.models.learning import (
    LearningEvent,
    LearningEventType,
    MasterySnapshot,
)
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.schemas.teacher_resources import (
    ErrorPattern,
    ErrorPatternResponse,
    MasteryTrendPoint,
    MasteryTrendRange,
    MasteryTrendResponse,
)
from app.services.teacher_access import (
    TeacherContentNotFoundError,
    ensure_student_member,
    ensure_teacher,
)

ERROR_EVENT_TYPES = {
    LearningEventType.QUIZ_WRONG,
    LearningEventType.CONCEPT_CONFUSION,
    LearningEventType.REPEATED_ERROR,
    LearningEventType.HINT_REQUESTED,
}

ERROR_METADATA_KEYS = ("error_code", "pattern_code", "error_type", "pattern")
ERROR_DEFAULT_CODES = {
    LearningEventType.QUIZ_WRONG: "assessment_error",
    LearningEventType.CONCEPT_CONFUSION: "concept_confusion",
    LearningEventType.REPEATED_ERROR: "repeated_error",
    LearningEventType.HINT_REQUESTED: "hint_needed",
}
ERROR_PATTERN_COPY = {
    "assessment_error": (
        "作答错误",
        "答题事件显示该知识点仍存在未解决的理解偏差。",
    ),
    "concept_confusion": (
        "概念混淆",
        "学习事件明确记录了概念混淆或边界理解错误。",
    ),
    "repeated_error": (
        "重复错误",
        "同一知识点在窗口期内反复出现错误证据。",
    ),
    "hint_needed": (
        "需要提示",
        "学生在该知识点上频繁请求提示，说明独立完成度不足。",
    ),
    "boundary_missing": (
        "遗漏边界值",
        "证据记录显示学生连续遗漏边界条件。",
    ),
}


def _window(days: int, now: datetime | None = None) -> tuple[date, date, datetime, datetime]:
    current = now or datetime.now(UTC)
    local_now = current.astimezone(ZoneInfo(settings.business_timezone))
    end_date = local_now.date()
    start_date = end_date - timedelta(days=days - 1)
    zone = ZoneInfo(settings.business_timezone)
    start = datetime.combine(start_date, time.min, tzinfo=zone).astimezone(UTC)
    end = datetime.combine(end_date + timedelta(days=1), time.min, tzinfo=zone).astimezone(UTC)
    return start_date, end_date, start, end


def _trend_points(
    snapshots: list[MasterySnapshot],
) -> list[MasteryTrendPoint]:
    grouped: dict[date, list[MasterySnapshot]] = defaultdict(list)
    zone = ZoneInfo(settings.business_timezone)
    for snapshot in snapshots:
        created_at = snapshot.created_at
        if created_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=UTC)
        grouped[created_at.astimezone(zone).date()].append(snapshot)

    return [
        MasteryTrendPoint(
            date=day,
            average_mastery=round(
                sum(snapshot.score for snapshot in day_snapshots) / len(day_snapshots),
                2,
            ),
            affected_students=len(
                {snapshot.user_id for snapshot in day_snapshots if snapshot.score < 60}
            ),
            evidence_count=len(day_snapshots),
            snapshot_ids=[snapshot.id for snapshot in day_snapshots],
            event_ids=[
                snapshot.source_event_id
                for snapshot in day_snapshots
                if snapshot.source_event_id is not None
            ],
        )
        for day, day_snapshots in sorted(grouped.items())
    ]


async def get_knowledge_point_mastery_trend(
    session: AsyncSession,
    course_id: UUID,
    knowledge_point_id: UUID,
    requester_id: UUID,
    *,
    days: int,
) -> MasteryTrendResponse:
    await ensure_teacher(session, course_id, requester_id)
    point = await session.scalar(
        select(KnowledgePoint.id)
        .join(Chapter, Chapter.id == KnowledgePoint.chapter_id)
        .join(Document, Document.id == Chapter.document_id)
        .where(
            KnowledgePoint.id == knowledge_point_id,
            KnowledgePoint.course_id == course_id,
            KnowledgePoint.trashed_at.is_(None),
            Chapter.trashed_at.is_(None),
            Document.trashed_at.is_(None),
        )
    )
    if point is None:
        raise TeacherContentNotFoundError
    start_date, end_date, start, end = _window(days)
    snapshots = list(
        await session.scalars(
            select(MasterySnapshot)
            .where(
                MasterySnapshot.course_id == course_id,
                MasterySnapshot.knowledge_point_id == knowledge_point_id,
                MasterySnapshot.created_at >= start,
                MasterySnapshot.created_at < end,
            )
            .order_by(MasterySnapshot.created_at, MasterySnapshot.id)
        )
    )
    return MasteryTrendResponse(
        knowledge_point_id=knowledge_point_id,
        range=MasteryTrendRange(start_date=start_date, end_date=end_date, days=days),
        points=_trend_points(snapshots),
    )


async def get_student_mastery_trend(
    session: AsyncSession,
    course_id: UUID,
    student_id: UUID,
    requester_id: UUID,
    *,
    days: int,
) -> MasteryTrendResponse:
    await ensure_teacher(session, course_id, requester_id)
    await ensure_student_member(session, course_id, student_id)
    start_date, end_date, start, end = _window(days)
    snapshots = list(
        await session.scalars(
            select(MasterySnapshot)
            .join(
                KnowledgePoint,
                KnowledgePoint.id == MasterySnapshot.knowledge_point_id,
            )
            .join(Chapter, Chapter.id == KnowledgePoint.chapter_id)
            .join(Document, Document.id == Chapter.document_id)
            .where(
                MasterySnapshot.course_id == course_id,
                MasterySnapshot.user_id == student_id,
                MasterySnapshot.created_at >= start,
                MasterySnapshot.created_at < end,
                KnowledgePoint.trashed_at.is_(None),
                Chapter.trashed_at.is_(None),
                Document.trashed_at.is_(None),
            )
            .order_by(MasterySnapshot.created_at, MasterySnapshot.id)
        )
    )
    return MasteryTrendResponse(
        student_id=student_id,
        range=MasteryTrendRange(start_date=start_date, end_date=end_date, days=days),
        points=_trend_points(snapshots),
    )


def _pattern_code(event: LearningEvent) -> str:
    for key in ERROR_METADATA_KEYS:
        value = event.metadata_json.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip().casefold().replace(" ", "_")
    return ERROR_DEFAULT_CODES.get(event.event_type, event.event_type.value)


def _pattern_copy(code: str) -> tuple[str, str]:
    if code in ERROR_PATTERN_COPY:
        return ERROR_PATTERN_COPY[code]
    return code.replace("_", " ").title(), "由可追溯 LearningEvent 聚合得到。"


def _build_error_patterns(
    events: list[LearningEvent],
    *,
    window_days: int,
    now: datetime | None = None,
) -> list[ErrorPattern]:
    if not events:
        return []
    current = now or datetime.now(UTC)
    split = current - timedelta(days=window_days / 2)
    grouped: dict[str, list[LearningEvent]] = defaultdict(list)
    for event in events:
        grouped[_pattern_code(event)].append(event)

    patterns: list[ErrorPattern] = []
    for code, code_events in grouped.items():
        recent = [
            event
            for event in code_events
            if (
                event.created_at.replace(tzinfo=UTC)
                if event.created_at.tzinfo is None
                else event.created_at
            )
            >= split
        ]
        previous = [
            event
            for event in code_events
            if (
                event.created_at.replace(tzinfo=UTC)
                if event.created_at.tzinfo is None
                else event.created_at
            )
            < split
        ]
        if not previous:
            trend = "unknown"
        elif len(recent) > len(previous) * 1.2:
            trend = "up"
        elif len(recent) < len(previous) * 0.8:
            trend = "down"
        else:
            trend = "stable"
        label, description = _pattern_copy(code)
        patterns.append(
            ErrorPattern(
                code=code,
                label=label,
                description=description,
                occurrence_count=len(code_events),
                affected_students=len({event.user_id for event in code_events}),
                trend=trend,
                sample_evidence_ids=[
                    event.id
                    for event in sorted(
                        code_events,
                        key=lambda item: item.created_at,
                        reverse=True,
                    )[:5]
                ],
            )
        )
    return sorted(patterns, key=lambda item: (-item.occurrence_count, item.code))


async def get_knowledge_point_error_patterns(
    session: AsyncSession,
    course_id: UUID,
    knowledge_point_id: UUID,
    requester_id: UUID,
    *,
    days: int,
) -> ErrorPatternResponse:
    await ensure_teacher(session, course_id, requester_id)
    point = await session.scalar(
        select(KnowledgePoint.id)
        .join(Chapter, Chapter.id == KnowledgePoint.chapter_id)
        .join(Document, Document.id == Chapter.document_id)
        .where(
            KnowledgePoint.id == knowledge_point_id,
            KnowledgePoint.course_id == course_id,
            KnowledgePoint.trashed_at.is_(None),
            Chapter.trashed_at.is_(None),
            Document.trashed_at.is_(None),
        )
    )
    if point is None:
        raise TeacherContentNotFoundError
    _, _, start, end = _window(days)
    events = list(
        await session.scalars(
            select(LearningEvent).where(
                LearningEvent.course_id == course_id,
                LearningEvent.knowledge_point_id == knowledge_point_id,
                LearningEvent.event_type.in_(ERROR_EVENT_TYPES),
                LearningEvent.created_at >= start,
                LearningEvent.created_at < end,
            )
        )
    )
    return ErrorPatternResponse(
        knowledge_point_id=knowledge_point_id,
        window_days=days,
        patterns=_build_error_patterns(events, window_days=days),
    )


async def get_student_error_patterns(
    session: AsyncSession,
    course_id: UUID,
    student_id: UUID,
    requester_id: UUID,
    *,
    days: int,
) -> ErrorPatternResponse:
    await ensure_teacher(session, course_id, requester_id)
    await ensure_student_member(session, course_id, student_id)
    _, _, start, end = _window(days)
    events = list(
        await session.scalars(
            select(LearningEvent)
            .outerjoin(
                KnowledgePoint,
                KnowledgePoint.id == LearningEvent.knowledge_point_id,
            )
            .outerjoin(Chapter, Chapter.id == KnowledgePoint.chapter_id)
            .outerjoin(Document, Document.id == Chapter.document_id)
            .where(
                LearningEvent.course_id == course_id,
                LearningEvent.user_id == student_id,
                LearningEvent.event_type.in_(ERROR_EVENT_TYPES),
                LearningEvent.created_at >= start,
                LearningEvent.created_at < end,
                or_(
                    KnowledgePoint.id.is_(None),
                    and_(
                        KnowledgePoint.trashed_at.is_(None),
                        Chapter.trashed_at.is_(None),
                        Document.trashed_at.is_(None),
                    ),
                ),
            )
        )
    )
    return ErrorPatternResponse(
        student_id=student_id,
        window_days=days,
        patterns=_build_error_patterns(events, window_days=days),
    )
