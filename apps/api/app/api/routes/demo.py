from datetime import UTC, datetime

from database.models.chat import Conversation, Message
from database.models.course import Course, CourseMember
from database.models.document import Document
from database.models.knowledge import Chapter, KnowledgePoint
from database.models.learning import LearningEvent
from database.models.planning import ExecutionPlan, PlanTask, TeachingStrategy
from database.models.review import AIReviewFlag
from database.models.user import User, UserRole
from database.seeds.seed_teacher_student_analytics import (
    DEMO_COURSE_ID,
    seed_teacher_student_analytics,
)
from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func, select

from app.api.dependencies import CurrentUser, DBSession
from app.schemas.demo import DemoDatasetStatus

router = APIRouter(prefix="/demo", tags=["demo"])


@router.get(
    "/status",
    response_model=DemoDatasetStatus,
    summary="Inspect the isolated demonstration dataset",
)
async def demo_status(current_user: CurrentUser, session: DBSession) -> DemoDatasetStatus:
    _ensure_teacher(current_user)
    return await _demo_dataset_status(session)


@router.post(
    "/reset",
    response_model=DemoDatasetStatus,
    summary="Reset the isolated demonstration dataset",
)
async def reset_demo_data(
    current_user: CurrentUser,
    session: DBSession,
) -> DemoDatasetStatus:
    _ensure_teacher(current_user)
    await seed_teacher_student_analytics(session, None)
    return await _demo_dataset_status(session)


def _ensure_teacher(user: User) -> None:
    if user.role != UserRole.TEACHER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only teachers can manage the demonstration dataset",
        )


async def _demo_dataset_status(session: DBSession) -> DemoDatasetStatus:
    course = await session.get(Course, DEMO_COURSE_ID)
    if course is None:
        return DemoDatasetStatus(
            available=False,
            seeded=False,
            isolated=True,
            namespace=f"demo:{DEMO_COURSE_ID}",
            course_id=None,
            course_name=None,
            course_code=None,
            student_count=0,
            knowledge_point_count=0,
            learning_event_count=0,
            review_count=0,
            strategy_count=0,
            plan_count=0,
            strategy_id=None,
            student_id=None,
            plan_id=None,
            plan_task_id=None,
            review_id=None,
            message_id=None,
            conversation_id=None,
            knowledge_point_id=None,
            resource_id=None,
            checked_at=datetime.now(UTC),
        )

    student_count = int(
        await session.scalar(
            select(func.count())
            .select_from(CourseMember)
            .where(
                CourseMember.course_id == course.id,
                CourseMember.role == UserRole.STUDENT,
            )
        )
        or 0
    )
    knowledge_point_count = int(
        await session.scalar(
            select(func.count())
            .select_from(KnowledgePoint)
            .join(Chapter, Chapter.id == KnowledgePoint.chapter_id)
            .where(
                Chapter.course_id == course.id,
                Chapter.trashed_at.is_(None),
                KnowledgePoint.trashed_at.is_(None),
            )
        )
        or 0
    )
    learning_event_count = int(
        await session.scalar(
            select(func.count())
            .select_from(LearningEvent)
            .where(LearningEvent.course_id == course.id)
        )
        or 0
    )
    review_count = int(
        await session.scalar(
            select(func.count())
            .select_from(AIReviewFlag)
            .where(AIReviewFlag.course_id == course.id)
        )
        or 0
    )
    strategy_count = int(
        await session.scalar(
            select(func.count())
            .select_from(TeachingStrategy)
            .where(TeachingStrategy.course_id == course.id)
        )
        or 0
    )
    plan_count = int(
        await session.scalar(
            select(func.count())
            .select_from(ExecutionPlan)
            .where(ExecutionPlan.course_id == course.id)
        )
        or 0
    )

    strategy_id = await session.scalar(
        select(TeachingStrategy.id)
        .where(TeachingStrategy.course_id == course.id)
        .order_by(TeachingStrategy.created_at.desc())
        .limit(1)
    )
    plan_id = await session.scalar(
        select(ExecutionPlan.id)
        .where(ExecutionPlan.course_id == course.id)
        .order_by(ExecutionPlan.created_at.desc())
        .limit(1)
    )
    student_id = await session.scalar(
        select(CourseMember.user_id)
        .where(
            CourseMember.course_id == course.id,
            CourseMember.role == UserRole.STUDENT,
        )
        .order_by(CourseMember.joined_at)
        .limit(1)
    )
    plan_task_id = await session.scalar(
        select(PlanTask.id)
        .where(PlanTask.plan_id == plan_id)
        .order_by(PlanTask.week_number, PlanTask.order_index)
        .limit(1)
    )
    review = await session.scalar(
        select(AIReviewFlag)
        .where(AIReviewFlag.course_id == course.id)
        .order_by(AIReviewFlag.created_at.desc())
        .limit(1)
    )
    knowledge_point_id = await session.scalar(
        select(KnowledgePoint.id)
        .join(Chapter, Chapter.id == KnowledgePoint.chapter_id)
        .where(
            Chapter.course_id == course.id,
            Chapter.trashed_at.is_(None),
            KnowledgePoint.trashed_at.is_(None),
        )
        .order_by(KnowledgePoint.order_index)
        .limit(1)
    )
    resource_id = await session.scalar(
        select(Document.id)
        .where(Document.course_id == course.id, Document.trashed_at.is_(None))
        .order_by(Document.created_at)
        .limit(1)
    )
    conversation_id = review.conversation_id if review is not None else None
    message_id = review.message_id if review is not None else None
    if conversation_id is None:
        conversation_id = await session.scalar(
            select(Conversation.id)
            .join(Message, Message.conversation_id == Conversation.id)
            .where(Conversation.course_id == course.id)
            .order_by(Conversation.created_at)
            .limit(1)
        )

    seeded = all(
        value > 0
        for value in (
            student_count,
            knowledge_point_count,
            learning_event_count,
            strategy_count,
            plan_count,
        )
    )
    return DemoDatasetStatus(
        available=True,
        seeded=seeded,
        isolated=True,
        namespace=f"demo:{course.id}",
        course_id=str(course.id),
        course_name=course.name,
        course_code=course.code,
        student_count=student_count,
        knowledge_point_count=knowledge_point_count,
        learning_event_count=learning_event_count,
        review_count=review_count,
        strategy_count=strategy_count,
        plan_count=plan_count,
        strategy_id=str(strategy_id) if strategy_id else None,
        student_id=str(student_id) if student_id else None,
        plan_id=str(plan_id) if plan_id else None,
        plan_task_id=str(plan_task_id) if plan_task_id else None,
        review_id=str(review.id) if review else None,
        message_id=str(message_id) if message_id else None,
        conversation_id=str(conversation_id) if conversation_id else None,
        knowledge_point_id=str(knowledge_point_id) if knowledge_point_id else None,
        resource_id=str(resource_id) if resource_id else None,
        checked_at=datetime.now(UTC),
    )
