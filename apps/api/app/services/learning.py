from uuid import UUID

from database.models.chat import Conversation, Message
from database.models.course import CourseMember
from database.models.document import Document
from database.models.knowledge import Chapter, KnowledgePoint
from database.models.learning import (
    LearningEvent,
    LearningEventType,
    MasterySnapshot,
    StudentKnowledgeState,
)
from database.models.planning import (
    ExecutionPlan,
    ExecutionPlanStatus,
    PlanTargetScope,
    PlanTask,
    PlanTaskStatus,
    plan_target_students,
    plan_task_target_students,
)
from database.models.user import UserRole
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.learning import LearningEventCreate
from app.services.course import get_course_for_member

EVENT_SCORE_DELTAS: dict[LearningEventType, float] = {
    LearningEventType.QUESTION_ASKED: 0.0,
    LearningEventType.HINT_REQUESTED: 0.0,
    LearningEventType.QUIZ_CORRECT: 8.0,
    LearningEventType.QUIZ_WRONG: -6.0,
    LearningEventType.CONCEPT_CONFUSION: -5.0,
    LearningEventType.REPEATED_ERROR: -5.0,
    LearningEventType.RESOLVED: 4.0,
    LearningEventType.TEACHER_ADJUSTMENT: 0.0,
}


class KnowledgePointNotFoundError(Exception):
    pass


class StudentMasteryForbiddenError(Exception):
    pass


class LearningEventForbiddenError(Exception):
    pass


class LearningEventStudentNotFoundError(Exception):
    pass


class LearningEventReferenceMismatchError(Exception):
    pass


class LearningEventConflictError(Exception):
    pass


async def ensure_course_teacher(
    session: AsyncSession,
    course_id: UUID,
    user_id: UUID,
) -> None:
    await get_course_for_member(session, course_id, user_id)
    membership = await session.scalar(
        select(CourseMember).where(
            CourseMember.course_id == course_id,
            CourseMember.user_id == user_id,
        )
    )
    if membership is None or membership.role != UserRole.TEACHER:
        raise LearningEventForbiddenError


def clamp_score(score: float) -> float:
    return max(0.0, min(100.0, score))


async def record_learning_event(
    session: AsyncSession,
    course_id: UUID,
    payload: LearningEventCreate,
    *,
    require_student_membership: bool = True,
    commit: bool = True,
) -> LearningEvent:
    for attempt in range(3):
        try:
            return await _record_learning_event_once(
                session,
                course_id,
                payload,
                require_student_membership=require_student_membership,
                commit=commit,
            )
        except IntegrityError as exc:
            if not commit:
                raise LearningEventConflictError from exc
            await session.rollback()
            if payload.knowledge_point_id is None or attempt == 2:
                raise LearningEventConflictError from exc
    raise LearningEventConflictError


async def _record_learning_event_once(
    session: AsyncSession,
    course_id: UUID,
    payload: LearningEventCreate,
    *,
    require_student_membership: bool = True,
    commit: bool = True,
) -> LearningEvent:
    membership_query = select(CourseMember.id).where(
        CourseMember.course_id == course_id,
        CourseMember.user_id == payload.student_id,
    )
    if require_student_membership:
        membership_query = membership_query.where(CourseMember.role == UserRole.STUDENT)
    student_membership = await session.scalar(membership_query)
    if student_membership is None:
        raise LearningEventStudentNotFoundError

    if payload.conversation_id is not None:
        conversation = await session.get(Conversation, payload.conversation_id)
        if (
            conversation is None
            or conversation.course_id != course_id
            or conversation.user_id != payload.student_id
        ):
            raise LearningEventReferenceMismatchError

    if payload.message_id is not None:
        message = await session.get(Message, payload.message_id)
        if message is None:
            raise LearningEventReferenceMismatchError
        message_conversation = await session.get(Conversation, message.conversation_id)
        if (
            message_conversation is None
            or message_conversation.course_id != course_id
            or message_conversation.user_id != payload.student_id
            or (
                payload.conversation_id is not None
                and message.conversation_id != payload.conversation_id
            )
        ):
            raise LearningEventReferenceMismatchError

    plan_id = payload.plan_id
    task_id = payload.task_id
    week_number = payload.week_number
    task_target_ids: set[UUID] | None = None
    if task_id is not None:
        task = await session.get(PlanTask, task_id)
        if task is None or task.status == PlanTaskStatus.CANCELLED:
            raise LearningEventReferenceMismatchError
        if plan_id is None:
            plan_id = task.plan_id
        elif task.plan_id != plan_id:
            raise LearningEventReferenceMismatchError
        if week_number is None:
            week_number = task.week_number
        task_target_ids = set(
            await session.scalars(
                select(plan_task_target_students.c.user_id).where(
                    plan_task_target_students.c.task_id == task.id
                )
            )
        )
        if task_target_ids and payload.student_id not in task_target_ids:
            raise LearningEventReferenceMismatchError

    if plan_id is not None:
        plan = await session.get(ExecutionPlan, plan_id)
        if plan is None or plan.course_id != course_id:
            raise LearningEventReferenceMismatchError
        if plan.status in {
            ExecutionPlanStatus.CANCELLED,
            ExecutionPlanStatus.COMPLETED,
        }:
            raise LearningEventReferenceMismatchError
        if plan.target_scope != PlanTargetScope.WHOLE_CLASS and task_id is None:
            target_ids = set(
                await session.scalars(
                    select(plan_target_students.c.user_id).where(
                        plan_target_students.c.plan_id == plan.id
                    )
                )
            )
            if payload.student_id not in target_ids:
                raise LearningEventReferenceMismatchError
        if (
            plan.target_scope != PlanTargetScope.WHOLE_CLASS
            and task_id is not None
            and not task_target_ids
        ):
            raise LearningEventReferenceMismatchError

    knowledge_point_id = payload.knowledge_point_id
    if knowledge_point_id is not None:
        knowledge_point = await session.scalar(
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
        if knowledge_point is None:
            raise KnowledgePointNotFoundError

    event = LearningEvent(
        course_id=course_id,
        user_id=payload.student_id,
        knowledge_point_id=knowledge_point_id,
        conversation_id=payload.conversation_id,
        message_id=payload.message_id,
        plan_id=plan_id,
        task_id=task_id,
        week_number=week_number,
        event_type=payload.event_type,
        weight=payload.weight,
        evidence=payload.evidence,
        metadata_json=payload.metadata_json,
    )
    session.add(event)
    await session.flush()

    if knowledge_point_id is not None:
        state = await session.scalar(
            select(StudentKnowledgeState)
            .where(
                StudentKnowledgeState.course_id == course_id,
                StudentKnowledgeState.user_id == payload.student_id,
                StudentKnowledgeState.knowledge_point_id == knowledge_point_id,
            )
            .with_for_update()
        )
        if state is None:
            state = StudentKnowledgeState(
                course_id=course_id,
                user_id=payload.student_id,
                knowledge_point_id=knowledge_point_id,
                score=50.0,
            )
            session.add(state)

        if payload.event_type == LearningEventType.TEACHER_ADJUSTMENT:
            target_score = payload.metadata_json.get("target_score")
            if isinstance(target_score, int | float):
                state.score = clamp_score(float(target_score))
        else:
            delta = EVENT_SCORE_DELTAS[payload.event_type] * payload.weight
            state.score = clamp_score(state.score + delta)

        session.add(
            MasterySnapshot(
                course_id=course_id,
                user_id=payload.student_id,
                knowledge_point_id=knowledge_point_id,
                source_event_id=event.id,
                score=state.score,
            )
        )

    if commit:
        await session.commit()
        await session.refresh(event)
    else:
        await session.flush()
    return event


async def list_student_mastery(
    session: AsyncSession,
    course_id: UUID,
    student_id: UUID,
    requester_id: UUID,
) -> list[StudentKnowledgeState]:
    await get_course_for_member(session, course_id, requester_id)
    requester_membership = await session.scalar(
        select(CourseMember).where(
            CourseMember.course_id == course_id,
            CourseMember.user_id == requester_id,
        )
    )
    if requester_id != student_id and (
        requester_membership is None or requester_membership.role != UserRole.TEACHER
    ):
        raise StudentMasteryForbiddenError

    states = await session.scalars(
        select(StudentKnowledgeState)
        .where(
            StudentKnowledgeState.course_id == course_id,
            StudentKnowledgeState.user_id == student_id,
        )
        .order_by(StudentKnowledgeState.updated_at.desc())
    )
    return list(states)
