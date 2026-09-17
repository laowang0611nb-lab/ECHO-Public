from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.chat import Conversation, Message
from app.models.course import CourseMember
from app.models.knowledge import KnowledgePoint
from app.models.learning import (
    LearningEvent,
    LearningEventType,
    MasterySnapshot,
    StudentKnowledgeState,
)
from app.models.user import UserRole
from app.schemas.learning import LearningEventCreate
from app.services.course import get_course_for_member

EVENT_SCORE_DELTAS: dict[LearningEventType, float] = {
    LearningEventType.QUESTION_ASKED: 0.0,
    LearningEventType.HINT_REQUESTED: -1.0,
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
) -> LearningEvent:
    for attempt in range(3):
        try:
            return await _record_learning_event_once(
                session,
                course_id,
                payload,
                require_student_membership=require_student_membership,
            )
        except IntegrityError as exc:
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

    knowledge_point_id = payload.knowledge_point_id
    if knowledge_point_id is not None:
        knowledge_point = await session.scalar(
            select(KnowledgePoint).where(
                KnowledgePoint.id == knowledge_point_id,
                KnowledgePoint.course_id == course_id,
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

    await session.commit()
    await session.refresh(event)
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
