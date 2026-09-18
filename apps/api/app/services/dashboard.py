from datetime import UTC, date, datetime, time, timedelta
from uuid import UUID
from zoneinfo import ZoneInfo

from database.models.course import CourseMember
from database.models.knowledge import KnowledgePoint
from database.models.learning import LearningEvent, LearningEventType, StudentKnowledgeState
from database.models.review import AIReviewFlag, ReviewStatus
from database.models.user import UserRole
from sqlalchemy import and_, case, distinct, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.schemas.dashboard import (
    CourseDashboardResponse,
    DashboardInsight,
    DashboardLearningDifficulty,
    DashboardOverviewStats,
    DashboardTeacherAction,
    DashboardTrendPoint,
    HighRiskKnowledgePoint,
    TeacherDashboardOverviewResponse,
)
from app.services.dashboard_details import list_chapter_analytics
from app.services.learning import ensure_course_teacher


def dashboard_day_bounds(
    now: datetime,
    timezone_name: str,
) -> list[tuple[date, datetime, datetime]]:
    timezone = ZoneInfo(timezone_name)
    start_date = now.astimezone(timezone).date() - timedelta(days=6)
    bounds: list[tuple[date, datetime, datetime]] = []
    for offset in range(7):
        day = start_date + timedelta(days=offset)
        start = datetime.combine(day, time.min, tzinfo=timezone).astimezone(UTC)
        end = datetime.combine(day + timedelta(days=1), time.min, tzinfo=timezone).astimezone(UTC)
        bounds.append((day, start, end))
    return bounds


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
        select(func.count(distinct(LearningEvent.user_id)))
        .join(
            CourseMember,
            and_(
                CourseMember.course_id == LearningEvent.course_id,
                CourseMember.user_id == LearningEvent.user_id,
            ),
        )
        .where(
            LearningEvent.course_id == course_id,
            CourseMember.role == UserRole.STUDENT,
            LearningEvent.created_at >= since,
        )
    )
    question_count = await session.scalar(
        select(func.count())
        .select_from(LearningEvent)
        .join(
            CourseMember,
            and_(
                CourseMember.course_id == LearningEvent.course_id,
                CourseMember.user_id == LearningEvent.user_id,
            ),
        )
        .where(
            LearningEvent.course_id == course_id,
            CourseMember.role == UserRole.STUDENT,
            LearningEvent.event_type == LearningEventType.QUESTION_ASKED,
            LearningEvent.created_at >= since,
        )
    )
    total_events = await session.scalar(
        select(func.count())
        .select_from(LearningEvent)
        .join(
            CourseMember,
            and_(
                CourseMember.course_id == LearningEvent.course_id,
                CourseMember.user_id == LearningEvent.user_id,
            ),
        )
        .where(
            LearningEvent.course_id == course_id,
            CourseMember.role == UserRole.STUDENT,
        )
    )
    average_mastery = await session.scalar(
        select(func.avg(StudentKnowledgeState.score)).where(
            StudentKnowledgeState.course_id == course_id
        )
    )
    pending_review_count = await session.scalar(
        select(func.count())
        .select_from(AIReviewFlag)
        .join(
            CourseMember,
            and_(
                CourseMember.course_id == AIReviewFlag.course_id,
                CourseMember.user_id == AIReviewFlag.student_id,
            ),
        )
        .where(
            AIReviewFlag.course_id == course_id,
            AIReviewFlag.status == ReviewStatus.OPEN,
            CourseMember.role == UserRole.STUDENT,
        )
    )

    risk_rows = await session.execute(
        select(
            KnowledgePoint.id,
            KnowledgePoint.name,
            func.avg(StudentKnowledgeState.score).label("average_score"),
            func.count(
                distinct(
                    case(
                        (StudentKnowledgeState.score < 60, StudentKnowledgeState.user_id),
                    )
                )
            ).label("affected_students"),
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
        pending_review_count=int(pending_review_count or 0),
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


async def get_teacher_dashboard_overview(
    session: AsyncSession,
    course_id: UUID,
    requester_id: UUID,
) -> TeacherDashboardOverviewResponse:
    dashboard = await get_course_dashboard(session, course_id, requester_id)
    chapter_mastery = await list_chapter_analytics(session, course_id, requester_id)
    now = datetime.now(UTC)
    bounds = dashboard_day_bounds(now, settings.business_timezone)
    start_date = bounds[0][0]
    since = bounds[0][1]
    until = bounds[-1][2]
    local_day = case(
        *(
            (
                and_(
                    LearningEvent.created_at >= start,
                    LearningEvent.created_at < end,
                ),
                day.isoformat(),
            )
            for day, start, end in bounds
        ),
        else_=None,
    ).label("day")

    trend_rows = await session.execute(
        select(
            local_day,
            func.count(LearningEvent.id).label("interaction_count"),
            func.count(distinct(LearningEvent.user_id)).label("active_student_count"),
        )
        .join(
            CourseMember,
            and_(
                CourseMember.course_id == LearningEvent.course_id,
                CourseMember.user_id == LearningEvent.user_id,
            ),
        )
        .where(
            LearningEvent.course_id == course_id,
            CourseMember.role == UserRole.STUDENT,
            LearningEvent.created_at >= since,
            LearningEvent.created_at < until,
            local_day.is_not(None),
        )
        .group_by(local_day)
        .order_by(local_day)
    )
    trend_by_day = {
        str(day): (int(interaction_count), int(active_student_count))
        for day, interaction_count, active_student_count in trend_rows.all()
    }
    trend = [
        DashboardTrendPoint(
            date=day,
            interaction_count=trend_by_day.get(str(day), (0, 0))[0],
            active_student_count=trend_by_day.get(str(day), (0, 0))[1],
        )
        for day in (start_date + timedelta(days=offset) for offset in range(7))
    ]

    attention_count = await session.scalar(
        select(func.count()).select_from(
            select(KnowledgePoint.id)
            .join(
                StudentKnowledgeState,
                StudentKnowledgeState.knowledge_point_id == KnowledgePoint.id,
            )
            .where(KnowledgePoint.course_id == course_id)
            .group_by(KnowledgePoint.id)
            .having(func.avg(StudentKnowledgeState.score) < 60)
            .subquery()
        )
    )
    attention_count = int(attention_count or 0)
    learning_difficulties = [
        DashboardLearningDifficulty(
            knowledge_point_id=point.knowledge_point_id,
            name=point.name,
            average_score=point.average_score,
            affected_students=point.affected_students,
        )
        for point in dashboard.high_risk_knowledge_points
    ]

    teacher_actions: list[DashboardTeacherAction] = []
    if dashboard.pending_review_count:
        teacher_actions.append(
            DashboardTeacherAction(
                action_type="review_flags",
                priority="high",
                target_id=None,
            )
        )
    if dashboard.high_risk_knowledge_points:
        weakest = dashboard.high_risk_knowledge_points[0]
        teacher_actions.append(
            DashboardTeacherAction(
                action_type="support_knowledge_point",
                priority="high" if weakest.average_score < 50 else "medium",
                target_id=weakest.knowledge_point_id,
            )
        )
    if dashboard.student_count > dashboard.active_student_count:
        teacher_actions.append(
            DashboardTeacherAction(
                action_type="encourage_inactive_students",
                priority="low",
                target_id=None,
            )
        )

    if dashboard.pending_review_count >= 5 or attention_count >= 3:
        risk_level = "high"
    elif dashboard.pending_review_count or attention_count:
        risk_level = "medium"
    else:
        risk_level = "low"

    if risk_level == "low":
        summary = "No immediate teaching risks detected in the last seven days."
    else:
        summary = (
            f"{attention_count} knowledge points need attention and "
            f"{dashboard.pending_review_count} AI answers await review."
        )

    return TeacherDashboardOverviewResponse(
        course_id=course_id,
        stats=DashboardOverviewStats(
            student_count=dashboard.student_count,
            active_student_count=dashboard.active_student_count,
            weekly_interaction_count=sum(point.interaction_count for point in trend),
            average_mastery=dashboard.average_mastery,
            attention_knowledge_point_count=attention_count,
            pending_review_count=dashboard.pending_review_count,
        ),
        trend=trend,
        insight=DashboardInsight(
            risk_level=risk_level,
            summary=summary,
            generated_at=now,
        ),
        chapter_mastery=chapter_mastery,
        learning_difficulties=learning_difficulties,
        teacher_actions=teacher_actions,
    )
