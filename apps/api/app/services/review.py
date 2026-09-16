from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.chat import Conversation, Message, MessageRole
from app.models.review import (
    AIReviewFlag,
    ReviewReason,
    ReviewSeverity,
    ReviewStatus,
)
from app.models.user import User
from app.schemas.review import (
    NotResolvedRequest,
    ReviewDecision,
    ReviewDecisionRequest,
    ReviewFlagResponse,
)
from app.services.learning import LearningEventForbiddenError, ensure_course_teacher

FOLLOW_UP_MARKERS = (
    "没解决",
    "没有解决",
    "还是不懂",
    "仍然不懂",
    "还是不明白",
    "still confused",
    "not solved",
    "didn't help",
)
OUTSIDE_MATERIAL_MARKERS = (
    "课程外补充",
    "教材中没有",
    "教材未提及",
    "course-external",
    "not in the course material",
)


class ReviewFlagNotFoundError(Exception):
    pass


class ReviewFlagForbiddenError(Exception):
    pass


async def _ensure_review_teacher(
    session: AsyncSession,
    course_id: UUID,
    requester_id: UUID,
) -> None:
    try:
        await ensure_course_teacher(session, course_id, requester_id)
    except LearningEventForbiddenError as exc:
        raise ReviewFlagForbiddenError from exc


def _detect_review_reasons(
    question: str,
    history: list[Message],
    answer: str,
    used_source_count: int,
) -> list[tuple[ReviewReason, ReviewSeverity, dict[str, object]]]:
    normalized_answer = answer.casefold()
    normalized_question = question.casefold()
    reasons: list[tuple[ReviewReason, ReviewSeverity, dict[str, object]]] = []

    if used_source_count == 0:
        reasons.append(
            (
                ReviewReason.MISSING_COURSE_BASIS,
                ReviewSeverity.HIGH,
                {"used_source_count": 0, "question_excerpt": question[:500]},
            )
        )

    outside_markers = [
        marker for marker in OUTSIDE_MATERIAL_MARKERS if marker.casefold() in normalized_answer
    ]
    if outside_markers:
        reasons.append(
            (
                ReviewReason.OUTSIDE_MATERIAL_HEAVY,
                ReviewSeverity.MEDIUM,
                {
                    "used_source_count": used_source_count,
                    "matched_markers": outside_markers,
                },
            )
        )

    prior_user_questions = [
        message.content.strip()
        for message in history
        if message.role == MessageRole.USER and message.content.strip()
    ]
    prior_assistant_exists = any(
        message.role == MessageRole.ASSISTANT and message.content.strip() for message in history
    )
    repeated_question = bool(
        prior_user_questions and prior_user_questions[-1].casefold() == normalized_question
    )
    explicit_follow_up = any(
        marker.casefold() in normalized_question for marker in FOLLOW_UP_MARKERS
    )
    if prior_assistant_exists and (repeated_question or explicit_follow_up):
        reasons.append(
            (
                ReviewReason.REPEATED_FOLLOW_UP,
                ReviewSeverity.MEDIUM,
                {
                    "repeated_question": repeated_question,
                    "explicit_follow_up": explicit_follow_up,
                },
            )
        )

    return reasons


async def attach_auto_review_flags(
    session: AsyncSession,
    assistant_message: Message,
    course_id: UUID,
    student_id: UUID,
    question: str,
    history: list[Message],
    used_source_count: int,
) -> list[AIReviewFlag]:
    flags: list[AIReviewFlag] = []
    for reason, severity, details in _detect_review_reasons(
        question,
        history,
        assistant_message.content,
        used_source_count,
    ):
        flag = AIReviewFlag(
            course_id=course_id,
            conversation_id=assistant_message.conversation_id,
            message_id=assistant_message.id,
            student_id=student_id,
            reason=reason,
            severity=severity,
            status=ReviewStatus.OPEN,
            details=details,
        )
        session.add(flag)
        flags.append(flag)
    return flags


async def _build_review_response(
    session: AsyncSession,
    flag: AIReviewFlag,
) -> ReviewFlagResponse:
    message = await session.get(Message, flag.message_id)
    if message is None:
        raise ReviewFlagNotFoundError
    question = await session.scalar(
        select(Message)
        .where(
            Message.conversation_id == flag.conversation_id,
            Message.role == MessageRole.USER,
            Message.created_at <= message.created_at,
        )
        .order_by(Message.created_at.desc(), Message.id.desc())
        .limit(1)
    )
    student = await session.get(User, flag.student_id)
    return ReviewFlagResponse(
        id=flag.id,
        course_id=flag.course_id,
        conversation_id=flag.conversation_id,
        message_id=flag.message_id,
        student_id=flag.student_id,
        student_display_name=student.display_name if student else "Unknown student",
        reason=flag.reason,
        severity=flag.severity,
        status=flag.status,
        details=flag.details,
        question=question.content if question else None,
        answer=message.content,
        teacher_note=flag.teacher_note,
        corrected_answer=flag.corrected_answer,
        reviewed_by=flag.reviewed_by,
        reviewed_at=flag.reviewed_at,
        created_at=flag.created_at,
        updated_at=flag.updated_at,
    )


async def list_review_flags(
    session: AsyncSession,
    course_id: UUID,
    requester_id: UUID,
    *,
    status: ReviewStatus | None,
    severity: ReviewSeverity | None,
    limit: int,
) -> list[ReviewFlagResponse]:
    await _ensure_review_teacher(session, course_id, requester_id)
    statement = select(AIReviewFlag).where(AIReviewFlag.course_id == course_id)
    if status is not None:
        statement = statement.where(AIReviewFlag.status == status)
    if severity is not None:
        statement = statement.where(AIReviewFlag.severity == severity)
    flags = list(
        await session.scalars(
            statement.order_by(AIReviewFlag.created_at.desc(), AIReviewFlag.id.desc()).limit(limit)
        )
    )
    return [await _build_review_response(session, flag) for flag in flags]


async def get_review_flag(
    session: AsyncSession,
    course_id: UUID,
    flag_id: UUID,
    requester_id: UUID,
) -> ReviewFlagResponse:
    await _ensure_review_teacher(session, course_id, requester_id)
    flag = await session.scalar(
        select(AIReviewFlag).where(
            AIReviewFlag.id == flag_id,
            AIReviewFlag.course_id == course_id,
        )
    )
    if flag is None:
        raise ReviewFlagNotFoundError
    return await _build_review_response(session, flag)


async def review_flag(
    session: AsyncSession,
    course_id: UUID,
    flag_id: UUID,
    requester_id: UUID,
    payload: ReviewDecisionRequest,
) -> ReviewFlagResponse:
    await _ensure_review_teacher(session, course_id, requester_id)
    flag = await session.scalar(
        select(AIReviewFlag).where(
            AIReviewFlag.id == flag_id,
            AIReviewFlag.course_id == course_id,
        )
    )
    if flag is None:
        raise ReviewFlagNotFoundError

    status_by_decision = {
        ReviewDecision.CONFIRM_CORRECT: ReviewStatus.CONFIRMED_CORRECT,
        ReviewDecision.MARK_INCORRECT: ReviewStatus.MARKED_INCORRECT,
        ReviewDecision.DISMISS: ReviewStatus.DISMISSED,
    }
    flag.status = status_by_decision[payload.decision]
    flag.teacher_note = payload.note
    flag.corrected_answer = payload.corrected_answer
    flag.reviewed_by = requester_id
    flag.reviewed_at = datetime.now(UTC)
    await session.commit()
    await session.refresh(flag)
    return await _build_review_response(session, flag)


async def mark_message_not_resolved(
    session: AsyncSession,
    course_id: UUID,
    message_id: UUID,
    requester_id: UUID,
    payload: NotResolvedRequest,
) -> ReviewFlagResponse:
    message = await session.get(Message, message_id)
    if message is None or message.role != MessageRole.ASSISTANT:
        raise ReviewFlagNotFoundError
    conversation = await session.get(Conversation, message.conversation_id)
    if conversation is None or conversation.course_id != course_id:
        raise ReviewFlagNotFoundError
    if conversation.user_id != requester_id:
        raise ReviewFlagForbiddenError

    flag = await session.scalar(
        select(AIReviewFlag).where(
            AIReviewFlag.message_id == message_id,
            AIReviewFlag.reason == ReviewReason.STUDENT_NOT_RESOLVED,
        )
    )
    details: dict[str, object] = {"note": payload.note} if payload.note else {}
    if flag is None:
        flag = AIReviewFlag(
            course_id=course_id,
            conversation_id=conversation.id,
            message_id=message.id,
            student_id=requester_id,
            reason=ReviewReason.STUDENT_NOT_RESOLVED,
            severity=ReviewSeverity.HIGH,
            status=ReviewStatus.OPEN,
            details=details,
        )
        session.add(flag)
    else:
        flag.status = ReviewStatus.OPEN
        flag.severity = ReviewSeverity.HIGH
        flag.details = details
        flag.reviewed_by = None
        flag.reviewed_at = None

    await session.commit()
    await session.refresh(flag)
    return await _build_review_response(session, flag)
