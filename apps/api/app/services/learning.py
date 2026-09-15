from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

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
) -> LearningEvent:
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
            select(StudentKnowledgeState).where(
                StudentKnowledgeState.course_id == course_id,
                StudentKnowledgeState.user_id == payload.student_id,
                StudentKnowledgeState.knowledge_point_id == knowledge_point_id,
            )
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
