from datetime import UTC, datetime, timedelta
from uuid import UUID

from database.models.course import CourseMember
from database.models.document import Document
from database.models.knowledge import Chapter, KnowledgePoint
from database.models.learning import (
    LearningEvent,
    LearningEventType,
    MasterySnapshot,
    QuickCheckAttempt,
    StudentKnowledgeState,
)
from database.models.resource import QuestionItem, question_item_knowledge_points
from database.models.user import UserRole
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.student_learning import (
    ChapterProgressItem,
    KnowledgePointQuickCheckSet,
    MisconceptionEvidence,
    StudentCourseProgressResponse,
    StudentLearningEventItem,
    StudentLearningEventPage,
    WrongQuestionDetail,
    WrongQuestionPage,
    WrongQuestionSummary,
)
from app.services.course import get_course_for_member
from app.services.quick_checks import (
    QuickCheckUnavailableError,
    build_quick_check_block,
)
from app.services.teacher_access import decode_cursor, encode_cursor

MISCONCEPTION_EVENT_TYPES = {
    LearningEventType.QUIZ_WRONG,
    LearningEventType.CONCEPT_CONFUSION,
    LearningEventType.REPEATED_ERROR,
    LearningEventType.HINT_REQUESTED,
}
MASTERY_COMPLETION_THRESHOLD = 80.0


class StudentLearningForbiddenError(Exception):
    pass


class StudentLearningNotFoundError(Exception):
    pass


async def ensure_student_learning_access(
    session: AsyncSession,
    course_id: UUID,
    student_id: UUID,
    requester_id: UUID,
) -> None:
    await get_course_for_member(session, course_id, requester_id)
    student_membership = await session.scalar(
        select(CourseMember.id).where(
            CourseMember.course_id == course_id,
            CourseMember.user_id == student_id,
            CourseMember.role == UserRole.STUDENT,
        )
    )
    if student_membership is None:
        raise StudentLearningNotFoundError
    if student_id == requester_id:
        return
    requester_membership = await session.scalar(
        select(CourseMember).where(
            CourseMember.course_id == course_id,
            CourseMember.user_id == requester_id,
        )
    )
    if requester_membership is None or requester_membership.role != UserRole.TEACHER:
        raise StudentLearningForbiddenError


async def _active_knowledge_point(
    session: AsyncSession,
    course_id: UUID,
    knowledge_point_id: UUID,
) -> KnowledgePoint:
    point = await session.scalar(
        select(KnowledgePoint)
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
        raise StudentLearningNotFoundError
    return point


def _event_mastery_before(event: LearningEvent, mastery_after: float | None) -> float | None:
    if mastery_after is None or event.event_type == LearningEventType.TEACHER_ADJUSTMENT:
        return None
    deltas = {
        LearningEventType.QUESTION_ASKED: 0.0,
        LearningEventType.HINT_REQUESTED: 0.0,
        LearningEventType.QUIZ_CORRECT: 8.0,
        LearningEventType.QUIZ_WRONG: -6.0,
        LearningEventType.CONCEPT_CONFUSION: -5.0,
        LearningEventType.REPEATED_ERROR: -5.0,
        LearningEventType.RESOLVED: 4.0,
    }
    delta = deltas.get(event.event_type, 0.0) * event.weight
    return max(0.0, min(100.0, mastery_after - delta))


async def list_student_learning_events(
    session: AsyncSession,
    course_id: UUID,
    student_id: UUID,
    requester_id: UUID,
    *,
    cursor: str | None,
    limit: int,
    event_type: LearningEventType | None,
    knowledge_point_id: UUID | None,
    from_time: datetime | None,
    to_time: datetime | None,
) -> StudentLearningEventPage:
    await ensure_student_learning_access(session, course_id, student_id, requester_id)
    filters = [
        LearningEvent.course_id == course_id,
        LearningEvent.user_id == student_id,
    ]
    if event_type is not None:
        filters.append(LearningEvent.event_type == event_type)
    if knowledge_point_id is not None:
        filters.append(LearningEvent.knowledge_point_id == knowledge_point_id)
    if from_time is not None:
        filters.append(LearningEvent.created_at >= from_time)
    if to_time is not None:
        filters.append(LearningEvent.created_at <= to_time)

    total = int(
        await session.scalar(select(func.count()).select_from(LearningEvent).where(*filters)) or 0
    )
    offset = decode_cursor(cursor)
    rows = await session.execute(
        select(LearningEvent, KnowledgePoint)
        .outerjoin(
            KnowledgePoint,
            KnowledgePoint.id == LearningEvent.knowledge_point_id,
        )
        .where(*filters)
        .order_by(LearningEvent.created_at.desc(), LearningEvent.id.desc())
        .offset(offset)
        .limit(limit)
    )
    event_rows = rows.all()
    event_ids = [event.id for event, _ in event_rows]
    snapshots = (
        list(
            await session.scalars(
                select(MasterySnapshot).where(MasterySnapshot.source_event_id.in_(event_ids))
            )
        )
        if event_ids
        else []
    )
    mastery_after = {
        snapshot.source_event_id: float(snapshot.score)
        for snapshot in snapshots
        if snapshot.source_event_id is not None
    }
    items = [
        StudentLearningEventItem(
            id=event.id,
            course_id=event.course_id,
            student_id=event.user_id,
            knowledge_point_id=event.knowledge_point_id,
            knowledge_point_name=point.name if point else None,
            conversation_id=event.conversation_id,
            message_id=event.message_id,
            plan_id=event.plan_id,
            task_id=event.task_id,
            week_number=event.week_number,
            event_type=event.event_type,
            result=event.result,
            weight=event.weight,
            evidence=event.evidence,
            metadata_json=event.metadata_json,
            mastery_before=_event_mastery_before(event, mastery_after.get(event.id)),
            mastery_after=mastery_after.get(event.id),
            created_at=event.created_at,
        )
        for event, point in event_rows
    ]
    next_cursor = encode_cursor(offset + limit) if offset + limit < total else None
    return StudentLearningEventPage(items=items, total=total, next_cursor=next_cursor)


async def get_student_course_progress(
    session: AsyncSession,
    course_id: UUID,
    student_id: UUID,
    requester_id: UUID,
) -> StudentCourseProgressResponse:
    await ensure_student_learning_access(session, course_id, student_id, requester_id)
    chapter_rows = (
        await session.execute(
            select(Chapter, KnowledgePoint)
            .join(Document, Document.id == Chapter.document_id)
            .outerjoin(
                KnowledgePoint,
                and_(
                    KnowledgePoint.chapter_id == Chapter.id,
                    KnowledgePoint.trashed_at.is_(None),
                ),
            )
            .where(
                Chapter.course_id == course_id,
                Chapter.trashed_at.is_(None),
                Document.trashed_at.is_(None),
            )
            .order_by(Chapter.order_index, KnowledgePoint.order_index)
        )
    ).all()
    states = list(
        await session.scalars(
            select(StudentKnowledgeState).where(
                StudentKnowledgeState.course_id == course_id,
                StudentKnowledgeState.user_id == student_id,
            )
        )
    )
    state_by_point = {state.knowledge_point_id: state for state in states}
    latest_events = (
        await session.execute(
            select(
                LearningEvent.knowledge_point_id,
                func.max(LearningEvent.created_at).label("last_learning_at"),
            )
            .join(
                KnowledgePoint,
                KnowledgePoint.id == LearningEvent.knowledge_point_id,
            )
            .join(Chapter, Chapter.id == KnowledgePoint.chapter_id)
            .join(Document, Document.id == Chapter.document_id)
            .where(
                LearningEvent.course_id == course_id,
                LearningEvent.user_id == student_id,
                LearningEvent.knowledge_point_id.is_not(None),
                KnowledgePoint.trashed_at.is_(None),
                Chapter.trashed_at.is_(None),
                Document.trashed_at.is_(None),
            )
            .group_by(LearningEvent.knowledge_point_id)
        )
    ).all()
    latest_by_point = {
        knowledge_point_id: last_learning_at
        for knowledge_point_id, last_learning_at in latest_events
        if knowledge_point_id is not None
    }
    last_learning_at = await session.scalar(
        select(func.max(LearningEvent.created_at)).where(
            LearningEvent.course_id == course_id,
            LearningEvent.user_id == student_id,
        )
    )
    current_event = await session.scalar(
        select(LearningEvent)
        .join(
            KnowledgePoint,
            KnowledgePoint.id == LearningEvent.knowledge_point_id,
        )
        .join(Chapter, Chapter.id == KnowledgePoint.chapter_id)
        .join(Document, Document.id == Chapter.document_id)
        .where(
            LearningEvent.course_id == course_id,
            LearningEvent.user_id == student_id,
            LearningEvent.knowledge_point_id.is_not(None),
            KnowledgePoint.trashed_at.is_(None),
            Chapter.trashed_at.is_(None),
            Document.trashed_at.is_(None),
        )
        .order_by(LearningEvent.created_at.desc(), LearningEvent.id.desc())
        .limit(1)
    )
    current_point = None
    current_chapter_id = None
    if current_event is not None and current_event.knowledge_point_id is not None:
        current_point = await session.get(KnowledgePoint, current_event.knowledge_point_id)
        current_chapter_id = current_point.chapter_id if current_point else None

    chapter_points: dict[UUID, list[KnowledgePoint]] = {}
    chapter_titles: dict[UUID, tuple[str, int]] = {}
    for chapter, point in chapter_rows:
        chapter_titles[chapter.id] = (chapter.title, chapter.order_index)
        if point is not None:
            chapter_points.setdefault(chapter.id, []).append(point)

    progress_items: list[ChapterProgressItem] = []
    total_points = 0
    total_started = 0
    for chapter_id in sorted(chapter_titles, key=lambda value: chapter_titles[value][1]):
        points = chapter_points.get(chapter_id, [])
        scores = [
            float(state_by_point[point.id].score) for point in points if point.id in state_by_point
        ]
        started_points = [
            point for point in points if point.id in state_by_point or point.id in latest_by_point
        ]
        mastered_points = [
            point
            for point in points
            if point.id in state_by_point
            and float(state_by_point[point.id].score) >= MASTERY_COMPLETION_THRESHOLD
        ]
        point_count = len(points)
        started_count = len(started_points)
        mastered_count = len(mastered_points)
        progress_percent = round(started_count * 100 / point_count) if point_count else 0
        if started_count == 0:
            status = "not_started"
            basis = "尚无学习证据"
        elif point_count > 0 and mastered_count == point_count:
            status = "completed"
            basis = "所有知识点均有学习证据且掌握度不低于 80"
        else:
            status = "in_progress"
            basis = f"已接触 {started_count}/{point_count} 个知识点"
        chapter_last_learning = max(
            (latest_by_point[point.id] for point in points if point.id in latest_by_point),
            default=None,
        )
        progress_items.append(
            ChapterProgressItem(
                chapter_id=chapter_id,
                title=chapter_titles[chapter_id][0],
                order_index=chapter_titles[chapter_id][1],
                status=status,
                progress_percent=progress_percent,
                knowledge_point_count=point_count,
                started_knowledge_point_count=started_count,
                mastered_knowledge_point_count=mastered_count,
                average_mastery=round(sum(scores) / len(scores), 2) if scores else None,
                last_learning_at=chapter_last_learning,
                completion_basis=basis,
            )
        )
        total_points += point_count
        total_started += started_count

    return StudentCourseProgressResponse(
        course_id=course_id,
        student_id=student_id,
        current_chapter_id=current_chapter_id,
        current_knowledge_point_id=(
            current_event.knowledge_point_id if current_event is not None else None
        ),
        last_learning_at=last_learning_at,
        overall_progress_percent=(round(total_started * 100 / total_points) if total_points else 0),
        chapters=progress_items,
    )


def _question_options(question: QuestionItem) -> list[dict[str, str]]:
    raw_options = question.metadata_json.get("options")
    if not isinstance(raw_options, list):
        return []
    options: list[dict[str, str]] = []
    for raw in raw_options:
        if not isinstance(raw, dict):
            continue
        option_id = raw.get("id")
        label = raw.get("label")
        if isinstance(option_id, str) and isinstance(label, str):
            options.append({"id": option_id, "label": label})
    return options


def _correct_option_id(question: QuestionItem) -> str | None:
    raw = question.metadata_json.get("correct_option_id")
    if isinstance(raw, str) and raw:
        return raw
    return question.answer


async def _wrong_question_base_rows(
    session: AsyncSession,
    course_id: UUID,
    student_id: UUID,
    *,
    knowledge_point_id: UUID | None,
):
    point_id_subquery = (
        select(question_item_knowledge_points.c.knowledge_point_id)
        .where(question_item_knowledge_points.c.question_item_id == QuestionItem.id)
        .limit(1)
        .scalar_subquery()
    )
    wrong_aggregate = (
        select(
            QuickCheckAttempt.question_item_id.label("question_item_id"),
            func.count().label("wrong_count"),
            func.max(QuickCheckAttempt.created_at).label("latest_wrong_at"),
        )
        .where(
            QuickCheckAttempt.course_id == course_id,
            QuickCheckAttempt.user_id == student_id,
            QuickCheckAttempt.correct.is_(False),
        )
        .group_by(QuickCheckAttempt.question_item_id)
        .subquery()
    )
    correct_aggregate = (
        select(
            QuickCheckAttempt.question_item_id.label("question_item_id"),
            func.max(QuickCheckAttempt.created_at).label("latest_correct_at"),
        )
        .where(
            QuickCheckAttempt.course_id == course_id,
            QuickCheckAttempt.user_id == student_id,
            QuickCheckAttempt.correct.is_(True),
        )
        .group_by(QuickCheckAttempt.question_item_id)
        .subquery()
    )
    statement = (
        select(
            QuestionItem,
            point_id_subquery.label("knowledge_point_id"),
            KnowledgePoint.name.label("knowledge_point_name"),
            Chapter.id.label("chapter_id"),
            Chapter.title.label("chapter_title"),
            wrong_aggregate.c.wrong_count,
            wrong_aggregate.c.latest_wrong_at,
            correct_aggregate.c.latest_correct_at,
        )
        .join(
            wrong_aggregate,
            wrong_aggregate.c.question_item_id == QuestionItem.id,
        )
        .outerjoin(
            KnowledgePoint,
            KnowledgePoint.id == point_id_subquery,
        )
        .outerjoin(Chapter, Chapter.id == KnowledgePoint.chapter_id)
        .outerjoin(
            correct_aggregate,
            correct_aggregate.c.question_item_id == QuestionItem.id,
        )
        .where(
            QuestionItem.course_id == course_id,
            QuestionItem.trashed_at.is_(None),
        )
    )
    if knowledge_point_id is not None:
        statement = statement.where(point_id_subquery == knowledge_point_id)
    return statement


async def list_student_wrong_questions(
    session: AsyncSession,
    course_id: UUID,
    student_id: UUID,
    requester_id: UUID,
    *,
    cursor: str | None,
    limit: int,
    knowledge_point_id: UUID | None,
    review_status: str | None,
) -> WrongQuestionPage:
    await ensure_student_learning_access(session, course_id, student_id, requester_id)
    statement = await _wrong_question_base_rows(
        session,
        course_id,
        student_id,
        knowledge_point_id=knowledge_point_id,
    )
    resolved = and_(
        statement.selected_columns.latest_correct_at.is_not(None),
        statement.selected_columns.latest_correct_at > statement.selected_columns.latest_wrong_at,
    )
    if review_status == "resolved":
        statement = statement.where(resolved)
    elif review_status == "unresolved":
        statement = statement.where(~resolved)
    total = int(await session.scalar(select(func.count()).select_from(statement.subquery())) or 0)
    offset = decode_cursor(cursor)
    rows = (
        await session.execute(
            statement.order_by(
                statement.selected_columns.latest_wrong_at.desc(),
                QuestionItem.id.desc(),
            )
            .offset(offset)
            .limit(limit)
        )
    ).all()
    point_ids = {row.knowledge_point_id for row in rows if row.knowledge_point_id is not None}
    mastery_rows = (
        list(
            await session.scalars(
                select(StudentKnowledgeState).where(
                    StudentKnowledgeState.course_id == course_id,
                    StudentKnowledgeState.user_id == student_id,
                    StudentKnowledgeState.knowledge_point_id.in_(point_ids),
                )
            )
        )
        if point_ids
        else []
    )
    mastery = {row.knowledge_point_id: float(row.score) for row in mastery_rows}
    items = [
        WrongQuestionSummary(
            question_id=question.id,
            title=question.title,
            prompt=question.content,
            question_type=question.type.value,
            difficulty=question.difficulty.value,
            chapter_id=chapter_id,
            chapter_title=chapter_title,
            knowledge_point_id=point_id,
            knowledge_point_name=point_name,
            wrong_count=int(wrong_count),
            latest_wrong_at=latest_wrong_at,
            mastery=mastery.get(point_id) if point_id else None,
            review_status=(
                "resolved"
                if latest_correct_at is not None and latest_correct_at > latest_wrong_at
                else "unresolved"
            ),
        )
        for (
            question,
            point_id,
            point_name,
            chapter_id,
            chapter_title,
            wrong_count,
            latest_wrong_at,
            latest_correct_at,
        ) in rows
    ]
    next_cursor = encode_cursor(offset + limit) if offset + limit < total else None
    return WrongQuestionPage(items=items, total=total, next_cursor=next_cursor)


async def get_student_wrong_question_detail(
    session: AsyncSession,
    course_id: UUID,
    student_id: UUID,
    requester_id: UUID,
    question_id: UUID,
) -> WrongQuestionDetail:
    await ensure_student_learning_access(session, course_id, student_id, requester_id)
    statement = await _wrong_question_base_rows(
        session,
        course_id,
        student_id,
        knowledge_point_id=None,
    )
    row = (await session.execute(statement.where(QuestionItem.id == question_id).limit(1))).first()
    if row is None:
        raise StudentLearningNotFoundError
    (
        question,
        point_id,
        point_name,
        chapter_id,
        chapter_title,
        wrong_count,
        latest_wrong_at,
        latest_correct_at,
    ) = row
    mastery_score = None
    if point_id is not None:
        state = await session.scalar(
            select(StudentKnowledgeState).where(
                StudentKnowledgeState.course_id == course_id,
                StudentKnowledgeState.user_id == student_id,
                StudentKnowledgeState.knowledge_point_id == point_id,
            )
        )
        mastery_score = float(state.score) if state is not None else None
    summary = WrongQuestionSummary(
        question_id=question.id,
        title=question.title,
        prompt=question.content,
        question_type=question.type.value,
        difficulty=question.difficulty.value,
        chapter_id=chapter_id,
        chapter_title=chapter_title,
        knowledge_point_id=point_id,
        knowledge_point_name=point_name,
        wrong_count=int(wrong_count),
        latest_wrong_at=latest_wrong_at,
        mastery=mastery_score,
        review_status=(
            "resolved"
            if latest_correct_at is not None and latest_correct_at > latest_wrong_at
            else "unresolved"
        ),
    )
    question = await session.get(QuestionItem, question_id)
    if question is None or question.trashed_at is not None:
        raise StudentLearningNotFoundError
    latest_wrong = await session.scalar(
        select(QuickCheckAttempt)
        .where(
            QuickCheckAttempt.course_id == course_id,
            QuickCheckAttempt.user_id == student_id,
            QuickCheckAttempt.question_item_id == question_id,
            QuickCheckAttempt.correct.is_(False),
        )
        .order_by(QuickCheckAttempt.created_at.desc(), QuickCheckAttempt.id.desc())
        .limit(1)
    )
    if latest_wrong is None:
        raise StudentLearningNotFoundError
    return WrongQuestionDetail(
        question=summary,
        options=_question_options(question),
        correct_option_id=_correct_option_id(question),
        explanation=question.explanation,
        selected_option_id=latest_wrong.selected_option_id,
        latest_attempt_id=latest_wrong.attempt_id,
        source_document_id=question.source_document_id,
        source_page=question.source_page,
    )


async def list_knowledge_point_quick_checks(
    session: AsyncSession,
    course_id: UUID,
    knowledge_point_id: UUID,
    requester_id: UUID,
    *,
    count: int,
    purpose: str,
) -> KnowledgePointQuickCheckSet:
    await get_course_for_member(session, course_id, requester_id)
    point = await _active_knowledge_point(session, course_id, knowledge_point_id)
    linked_question_ids = select(question_item_knowledge_points.c.question_item_id).where(
        question_item_knowledge_points.c.knowledge_point_id == knowledge_point_id
    )
    candidates = list(
        await session.scalars(
            select(QuestionItem)
            .where(
                QuestionItem.course_id == course_id,
                QuestionItem.trashed_at.is_(None),
                QuestionItem.id.in_(linked_question_ids),
            )
            .order_by(QuestionItem.created_at.desc(), QuestionItem.id.desc())
            .limit(max(count * 3, count))
        )
    )
    items = []
    for question in candidates:
        try:
            items.append(build_quick_check_block(question, question_id=question.id))
        except (QuickCheckUnavailableError, ValueError):
            continue
        if len(items) >= count:
            break
    return KnowledgePointQuickCheckSet(
        course_id=course_id,
        knowledge_point_id=knowledge_point_id,
        knowledge_point_name=point.name,
        purpose="consolidation",
        requested_count=count,
        items=items,
        insufficient_questions=len(items) < min(2, count),
    )


async def get_student_misconception_evidence(
    session: AsyncSession,
    course_id: UUID,
    student_id: UUID,
    requester_id: UUID,
    knowledge_point_id: UUID,
    *,
    days: int,
) -> MisconceptionEvidence:
    await ensure_student_learning_access(session, course_id, student_id, requester_id)
    point = await _active_knowledge_point(session, course_id, knowledge_point_id)
    end = datetime.now(UTC)
    start = end - timedelta(days=days)
    events = list(
        await session.scalars(
            select(LearningEvent)
            .where(
                LearningEvent.course_id == course_id,
                LearningEvent.user_id == student_id,
                LearningEvent.knowledge_point_id == knowledge_point_id,
                LearningEvent.event_type.in_(MISCONCEPTION_EVENT_TYPES),
                LearningEvent.created_at >= start,
            )
            .order_by(LearningEvent.created_at.desc(), LearningEvent.id.desc())
        )
    )
    if not events:
        return MisconceptionEvidence(
            knowledge_point_id=knowledge_point_id,
            label="证据不足",
            description="当前窗口期内没有足够的错误或困惑证据。",
            occurrence_count=0,
            affected_student_count=0,
            sample_event_ids=[],
            insufficient_evidence=True,
            window_start=start.date(),
            window_end=end.date(),
        )
    latest = events[0]
    label = {
        LearningEventType.QUIZ_WRONG: "作答错误",
        LearningEventType.CONCEPT_CONFUSION: "概念混淆",
        LearningEventType.REPEATED_ERROR: "重复错误",
        LearningEventType.HINT_REQUESTED: "提示依赖",
    }.get(latest.event_type, "学习困难")
    return MisconceptionEvidence(
        knowledge_point_id=knowledge_point_id,
        label=label,
        description=(
            latest.evidence or f"最近在“{point.name}”上出现{label}证据，建议结合错题重新巩固。"
        ),
        occurrence_count=len(events),
        affected_student_count=1,
        sample_event_ids=[event.id for event in events[:5]],
        insufficient_evidence=len(events) < 2,
        window_start=start.date(),
        window_end=end.date(),
    )
