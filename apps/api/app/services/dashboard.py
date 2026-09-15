from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import distinct, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.course import CourseMember
from app.models.knowledge import KnowledgePoint
from app.models.learning import LearningEvent, LearningEventType, StudentKnowledgeState
from app.models.user import UserRole
from app.schemas.dashboard import CourseDashboardResponse, HighRiskKnowledgePoint
from app.services.learning import ensure_course_teacher


async def get_course_dashboard(
    session: AsyncSession,
    course_id: UUID,
    requester_id: UUID,
) -> CourseDashboardResponse:
    await ensure_course_teacher(session, course_id, requester_id)
    since = datetime.now(UTC) - timedelta(days=7)

    student_count = await session.scalar(
        select(func.count())
        .select_from(CourseMember)
        .where(
            CourseMember.course_id == course_id,
            CourseMember.role == UserRole.STUDENT,
        )
    )
    active_student_count = await session.scalar(
        select(func.count(distinct(LearningEvent.user_id))).where(
            LearningEvent.course_id == course_id,
            LearningEvent.created_at >= since,
        )
    )
    question_count = await session.scalar(
        select(func.count())
        .select_from(LearningEvent)
        .where(
            LearningEvent.course_id == course_id,
            LearningEvent.event_type == LearningEventType.QUESTION_ASKED,
            LearningEvent.created_at >= since,
        )
    )
    total_events = await session.scalar(
        select(func.count()).select_from(LearningEvent).where(LearningEvent.course_id == course_id)
    )
    average_mastery = await session.scalar(
        select(func.avg(StudentKnowledgeState.score)).where(
            StudentKnowledgeState.course_id == course_id
        )
    )

    risk_rows = await session.execute(
        select(
            KnowledgePoint.id,
            KnowledgePoint.name,
            func.avg(StudentKnowledgeState.score).label("average_score"),
            func.count(distinct(StudentKnowledgeState.user_id)).label("affected_students"),
        )
        .join(
            StudentKnowledgeState,
            StudentKnowledgeState.knowledge_point_id == KnowledgePoint.id,
        )
        .where(KnowledgePoint.course_id == course_id)
        .group_by(KnowledgePoint.id, KnowledgePoint.name)
        .having(func.avg(StudentKnowledgeState.score) < 60)
        .order_by(func.avg(StudentKnowledgeState.score), KnowledgePoint.name)
        .limit(10)
    )

    return CourseDashboardResponse(
        course_id=course_id,
        student_count=int(student_count or 0),
        active_student_count=int(active_student_count or 0),
        question_count_7d=int(question_count or 0),
        total_learning_events=int(total_events or 0),
        average_mastery=round(float(average_mastery), 2) if average_mastery is not None else None,
        high_risk_knowledge_points=[
            HighRiskKnowledgePoint(
                knowledge_point_id=point_id,
                name=name,
                average_score=round(float(score), 2),
                affected_students=int(affected),
            )
            for point_id, name, score, affected in risk_rows.all()
        ],
    )
