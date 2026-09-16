from uuid import UUID

from sqlalchemy import distinct, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.course import CourseMember
from app.models.knowledge import Chapter, KnowledgePoint
from app.models.learning import LearningEvent, StudentKnowledgeState
from app.models.user import User, UserRole
from app.schemas.dashboard_details import (
    ChapterAnalyticsResponse,
    KnowledgePointAnalyticsResponse,
    LearningEvidenceResponse,
    StudentLearningDetailResponse,
    StudentMasteryBrief,
)
from app.schemas.learning import MasteryStateResponse
from app.services.learning import ensure_course_teacher


class KnowledgePointNotFoundError(Exception):
    pass


class StudentNotFoundError(Exception):
    pass


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
        .outerjoin(KnowledgePoint, KnowledgePoint.chapter_id == Chapter.id)
        .outerjoin(
            StudentKnowledgeState,
            StudentKnowledgeState.knowledge_point_id == KnowledgePoint.id,
        )
        .where(Chapter.course_id == course_id)
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
            .where(
                KnowledgePoint.id == knowledge_point_id,
                KnowledgePoint.course_id == course_id,
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
            .where(
                StudentKnowledgeState.course_id == course_id,
                StudentKnowledgeState.user_id == student_id,
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
        .outerjoin(KnowledgePoint, KnowledgePoint.id == LearningEvent.knowledge_point_id)
        .where(
            LearningEvent.course_id == course_id,
            LearningEvent.user_id == student_id,
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
