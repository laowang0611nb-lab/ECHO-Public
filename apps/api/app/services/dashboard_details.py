from collections import defaultdict
from datetime import UTC, datetime, timedelta
from uuid import UUID

from database.models.chat import Conversation
from database.models.course import CourseMember
from database.models.document import Document
from database.models.knowledge import Chapter, KnowledgePoint
from database.models.learning import LearningEvent, StudentKnowledgeState
from database.models.user import User, UserRole
from sqlalchemy import and_, distinct, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.dashboard_details import (
    ChapterAnalyticsResponse,
    CourseStudentAnalyticsResponse,
    KnowledgePointAnalyticsResponse,
    LearningEvidenceResponse,
    StudentAnalyticsItemResponse,
    StudentAnalyticsSummaryResponse,
    StudentLearningDetailResponse,
    StudentMasteryBrief,
    StudentWeakKnowledgePointResponse,
)
from app.schemas.learning import MasteryStateResponse
from app.services.learning import ensure_course_teacher


class KnowledgePointNotFoundError(Exception):
    pass


class StudentNotFoundError(Exception):
    pass


def _mastery_status(score: float | None) -> str:
    if score is None:
        return "no_data"
    if score >= 80:
        return "stable"
    if score >= 65:
        return "basic"
    if score >= 50:
        return "attention"
    return "risk"


async def list_chapter_analytics(
    session: AsyncSession,
    course_id: UUID,
    requester_id: UUID,
) -> list[ChapterAnalyticsResponse]:
    await ensure_course_teacher(session, course_id, requester_id)
    rows = await session.execute(
        select(
            Chapter.id,
            Chapter.title,
            Chapter.order_index,
            func.count(distinct(KnowledgePoint.id)).label("knowledge_point_count"),
            func.count(distinct(StudentKnowledgeState.user_id)).label("active_learners"),
            func.avg(StudentKnowledgeState.score).label("average_mastery"),
        )
        .outerjoin(
            KnowledgePoint,
            and_(
                KnowledgePoint.chapter_id == Chapter.id,
                KnowledgePoint.trashed_at.is_(None),
            ),
        )
        .outerjoin(
            StudentKnowledgeState,
            StudentKnowledgeState.knowledge_point_id == KnowledgePoint.id,
        )
        .join(Document, Document.id == Chapter.document_id)
        .where(
            Chapter.course_id == course_id,
            Chapter.trashed_at.is_(None),
            Document.trashed_at.is_(None),
        )
        .group_by(Chapter.id, Chapter.title, Chapter.order_index)
        .order_by(Chapter.order_index)
    )
    return [
        ChapterAnalyticsResponse(
            chapter_id=chapter_id,
            title=title,
            order_index=order_index,
            knowledge_point_count=int(point_count or 0),
            active_learner_count=int(learner_count or 0),
            average_mastery=(
                round(float(average_mastery), 2) if average_mastery is not None else None
            ),
        )
        for (
            chapter_id,
            title,
            order_index,
            point_count,
            learner_count,
            average_mastery,
        ) in rows.all()
    ]


async def get_knowledge_point_analytics(
    session: AsyncSession,
    course_id: UUID,
    knowledge_point_id: UUID,
    requester_id: UUID,
) -> KnowledgePointAnalyticsResponse:
    await ensure_course_teacher(session, course_id, requester_id)
    point_row = (
        await session.execute(
            select(KnowledgePoint.id, KnowledgePoint.name, Chapter.id, Chapter.title)
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
    ).first()
    if point_row is None:
        raise KnowledgePointNotFoundError

    student_rows = await session.execute(
        select(User.id, User.display_name, StudentKnowledgeState.score)
        .join(StudentKnowledgeState, StudentKnowledgeState.user_id == User.id)
        .where(
            StudentKnowledgeState.course_id == course_id,
            StudentKnowledgeState.knowledge_point_id == knowledge_point_id,
        )
        .order_by(StudentKnowledgeState.score, User.display_name)
    )
    students = [
        StudentMasteryBrief(student_id=student_id, display_name=name, score=float(score))
        for student_id, name, score in student_rows.all()
    ]
    average = (
        round(sum(student.score for student in students) / len(students), 2) if students else None
    )
    return KnowledgePointAnalyticsResponse(
        knowledge_point_id=point_row[0],
        name=point_row[1],
        chapter_id=point_row[2],
        chapter_title=point_row[3],
        average_mastery=average,
        affected_students=sum(student.score < 60 for student in students),
        students=students,
    )


async def get_course_student_analytics(
    session: AsyncSession,
    course_id: UUID,
    requester_id: UUID,
    *,
    include_details: bool = True,
) -> CourseStudentAnalyticsResponse:
    await ensure_course_teacher(session, course_id, requester_id)
    member_rows = await session.execute(
        select(CourseMember, User)
        .join(User, User.id == CourseMember.user_id)
        .where(
            CourseMember.course_id == course_id,
            CourseMember.role == UserRole.STUDENT,
        )
        .order_by(CourseMember.joined_at.asc(), CourseMember.id.asc())
    )
    members = list(member_rows.all())
    student_ids = [user.id for _, user in members]
    now = datetime.now(UTC)
    window_start = now - timedelta(days=7)
    states_by_student: dict[UUID, list[tuple[StudentKnowledgeState, str]]] = defaultdict(list)
    events_by_student: dict[UUID, list[LearningEvidenceResponse]] = defaultdict(list)
    event_counts: dict[UUID, int] = defaultdict(int)
    active_day_counts: dict[UUID, int] = defaultdict(int)
    last_active_at: dict[UUID, datetime] = {}
    conversation_counts: dict[UUID, int] = defaultdict(int)

    if student_ids:
        state_rows = await session.execute(
            select(StudentKnowledgeState, KnowledgePoint.name)
            .join(
                KnowledgePoint,
                KnowledgePoint.id == StudentKnowledgeState.knowledge_point_id,
            )
            .join(Chapter, Chapter.id == KnowledgePoint.chapter_id)
            .join(Document, Document.id == Chapter.document_id)
            .where(
                StudentKnowledgeState.course_id == course_id,
                StudentKnowledgeState.user_id.in_(student_ids),
                KnowledgePoint.trashed_at.is_(None),
                Chapter.trashed_at.is_(None),
                Document.trashed_at.is_(None),
            )
            .order_by(
                StudentKnowledgeState.user_id,
                StudentKnowledgeState.score,
                KnowledgePoint.name,
            )
        )
        for state, point_name in state_rows.all():
            states_by_student[state.user_id].append((state, point_name))

        if include_details:
            event_rank = (
                select(
                    LearningEvent.id.label("id"),
                    LearningEvent.user_id.label("user_id"),
                    LearningEvent.knowledge_point_id.label("knowledge_point_id"),
                    KnowledgePoint.name.label("point_name"),
                    LearningEvent.event_type.label("event_type"),
                    LearningEvent.evidence.label("evidence"),
                    LearningEvent.created_at.label("created_at"),
                    func.row_number()
                    .over(
                        partition_by=LearningEvent.user_id,
                        order_by=LearningEvent.created_at.desc(),
                    )
                    .label("row_number"),
                )
                .outerjoin(
                    KnowledgePoint,
                    and_(
                        KnowledgePoint.id == LearningEvent.knowledge_point_id,
                        KnowledgePoint.trashed_at.is_(None),
                    ),
                )
                .outerjoin(
                    Chapter,
                    and_(
                        Chapter.id == KnowledgePoint.chapter_id,
                        Chapter.trashed_at.is_(None),
                    ),
                )
                .outerjoin(
                    Document,
                    and_(
                        Document.id == Chapter.document_id,
                        Document.trashed_at.is_(None),
                    ),
                )
                .where(
                    LearningEvent.course_id == course_id,
                    LearningEvent.user_id.in_(student_ids),
                    or_(
                        LearningEvent.knowledge_point_id.is_(None),
                        and_(
                            KnowledgePoint.id.is_not(None),
                            Chapter.id.is_not(None),
                            Document.id.is_not(None),
                        ),
                    ),
                )
                .subquery()
            )
            recent_event_rows = await session.execute(
                select(event_rank)
                .where(event_rank.c.row_number <= 20)
                .order_by(event_rank.c.user_id, event_rank.c.created_at.desc())
            )
            for row in recent_event_rows.all():
                events_by_student[row.user_id].append(
                    LearningEvidenceResponse(
                        event_id=row.id,
                        knowledge_point_id=row.knowledge_point_id,
                        knowledge_point_name=row.point_name,
                        event_type=row.event_type.value,
                        evidence=row.evidence,
                        created_at=row.created_at,
                    )
                )

        count_rows = await session.execute(
            select(LearningEvent.user_id, func.count(LearningEvent.id))
            .where(
                LearningEvent.course_id == course_id,
                LearningEvent.user_id.in_(student_ids),
            )
            .group_by(LearningEvent.user_id)
        )
        event_counts.update({user_id: int(count) for user_id, count in count_rows.all()})

        active_rows = await session.execute(
            select(
                LearningEvent.user_id,
                func.count(distinct(func.date(LearningEvent.created_at))),
            )
            .where(
                LearningEvent.course_id == course_id,
                LearningEvent.user_id.in_(student_ids),
                LearningEvent.created_at >= window_start,
            )
            .group_by(LearningEvent.user_id)
        )
        active_day_counts.update({user_id: int(count) for user_id, count in active_rows.all()})

        last_active_rows = await session.execute(
            select(LearningEvent.user_id, func.max(LearningEvent.created_at))
            .where(
                LearningEvent.course_id == course_id,
                LearningEvent.user_id.in_(student_ids),
            )
            .group_by(LearningEvent.user_id)
        )
        last_active_at.update(
            {
                user_id: created_at
                for user_id, created_at in last_active_rows.all()
                if created_at is not None
            }
        )

        conversation_rows = await session.execute(
            select(Conversation.user_id, func.count(Conversation.id))
            .where(
                Conversation.course_id == course_id,
                Conversation.user_id.in_(student_ids),
            )
            .group_by(Conversation.user_id)
        )
        conversation_counts.update(
            {user_id: int(count) for user_id, count in conversation_rows.all()}
        )

    items: list[StudentAnalyticsItemResponse] = []
    for membership, user in members:
        student_states = states_by_student.get(user.id, [])
        mastery_states = [
            MasteryStateResponse.model_validate(state, from_attributes=True)
            for state, _ in student_states
        ]
        average_mastery = (
            round(
                sum(state.score for state, _ in student_states) / len(student_states),
                2,
            )
            if student_states
            else None
        )
        weak_points = [
            StudentWeakKnowledgePointResponse(
                knowledge_point_id=state.knowledge_point_id,
                name=point_name,
                score=float(state.score),
            )
            for state, point_name in student_states
            if state.score < 60
        ][:5]
        recent_evidence = events_by_student.get(user.id, [])
        items.append(
            StudentAnalyticsItemResponse(
                member={
                    "id": membership.id,
                    "course_id": membership.course_id,
                    "user_id": user.id,
                    "email": user.email,
                    "display_name": user.display_name,
                    "avatar_url": user.avatar_url,
                    "role": membership.role,
                    "joined_at": membership.joined_at,
                },
                average_mastery=average_mastery,
                mastery_states=mastery_states if include_details else [],
                recent_evidence=recent_evidence if include_details else [],
                weak_knowledge_points=weak_points,
                learning_event_count=event_counts.get(user.id, 0),
                active_days_7=active_day_counts.get(user.id, 0),
                last_active_at=last_active_at.get(user.id),
                conversation_count=conversation_counts.get(user.id, 0),
            )
        )

    mastery_values = [item.average_mastery for item in items if item.average_mastery is not None]
    active_student_count = sum(1 for item in items if item.active_days_7 > 0)
    attention_student_count = sum(
        1 for item in items if _mastery_status(item.average_mastery) in {"attention", "risk"}
    )
    return CourseStudentAnalyticsResponse(
        course_id=course_id,
        generated_at=now,
        items=items,
        summary=StudentAnalyticsSummaryResponse(
            student_count=len(items),
            average_mastery=(
                round(sum(mastery_values) / len(mastery_values), 2) if mastery_values else None
            ),
            active_student_count=active_student_count,
            attention_student_count=attention_student_count,
            students_with_evidence=sum(1 for item in items if item.learning_event_count > 0),
        ),
        chapter_analytics=await list_chapter_analytics(
            session,
            course_id,
            requester_id,
        ),
    )


async def get_student_learning_detail(
    session: AsyncSession,
    course_id: UUID,
    student_id: UUID,
    requester_id: UUID,
) -> StudentLearningDetailResponse:
    await ensure_course_teacher(session, course_id, requester_id)
    student_row = (
        await session.execute(
            select(User.id, User.display_name)
            .join(CourseMember, CourseMember.user_id == User.id)
            .where(
                CourseMember.course_id == course_id,
                CourseMember.user_id == student_id,
                CourseMember.role == UserRole.STUDENT,
            )
        )
    ).first()
    if student_row is None:
        raise StudentNotFoundError

    states = list(
        await session.scalars(
            select(StudentKnowledgeState)
            .join(
                KnowledgePoint,
                KnowledgePoint.id == StudentKnowledgeState.knowledge_point_id,
            )
            .join(Chapter, Chapter.id == KnowledgePoint.chapter_id)
            .join(Document, Document.id == Chapter.document_id)
            .where(
                StudentKnowledgeState.course_id == course_id,
                StudentKnowledgeState.user_id == student_id,
                KnowledgePoint.trashed_at.is_(None),
                Chapter.trashed_at.is_(None),
                Document.trashed_at.is_(None),
            )
            .order_by(StudentKnowledgeState.score)
        )
    )
    average = round(sum(state.score for state in states) / len(states), 2) if states else None

    event_rows = await session.execute(
        select(
            LearningEvent.id,
            LearningEvent.knowledge_point_id,
            KnowledgePoint.name,
            LearningEvent.event_type,
            LearningEvent.evidence,
            LearningEvent.created_at,
        )
        .outerjoin(
            KnowledgePoint,
            and_(
                KnowledgePoint.id == LearningEvent.knowledge_point_id,
                KnowledgePoint.trashed_at.is_(None),
            ),
        )
        .outerjoin(
            Chapter,
            and_(
                Chapter.id == KnowledgePoint.chapter_id,
                Chapter.trashed_at.is_(None),
            ),
        )
        .outerjoin(
            Document,
            and_(
                Document.id == Chapter.document_id,
                Document.trashed_at.is_(None),
            ),
        )
        .where(
            LearningEvent.course_id == course_id,
            LearningEvent.user_id == student_id,
            or_(
                LearningEvent.knowledge_point_id.is_(None),
                and_(
                    KnowledgePoint.id.is_not(None),
                    Chapter.id.is_not(None),
                    Document.id.is_not(None),
                ),
            ),
        )
        .order_by(LearningEvent.created_at.desc())
        .limit(50)
    )
    evidence = [
        LearningEvidenceResponse(
            event_id=event_id,
            knowledge_point_id=point_id,
            knowledge_point_name=point_name,
            event_type=event_type.value,
            evidence=event_evidence,
            created_at=created_at,
        )
        for (
            event_id,
            point_id,
            point_name,
            event_type,
            event_evidence,
            created_at,
        ) in event_rows.all()
    ]

    mastery_states = [
        MasteryStateResponse.model_validate(state, from_attributes=True) for state in states
    ]
    return StudentLearningDetailResponse(
        student_id=student_row[0],
        display_name=student_row[1],
        average_mastery=average,
        mastery_states=mastery_states,
        recent_evidence=evidence,
    )
