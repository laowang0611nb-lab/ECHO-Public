import re
from datetime import UTC, datetime
from uuid import UUID

from database.models.chat import Conversation, Message, MessageRole
from database.models.course import CourseMember
from database.models.notification import NotificationSeverity, NotificationType
from database.models.review import (
    AIReviewFlag,
    ReviewAnswerVersion,
    ReviewGenerationStatus,
    ReviewHistoryAction,
    ReviewReason,
    ReviewSeverity,
    ReviewStatus,
    ReviewVersionSource,
)
from database.models.user import User, UserRole
from sqlalchemy import and_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.review import (
    NotResolvedRequest,
    ReviewDecision,
    ReviewDecisionRequest,
    ReviewFlagResponse,
)
from app.services.learning import LearningEventForbiddenError, ensure_course_teacher
from app.services.notifications import create_notification

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
CONVERSATIONAL_PREFIX_PATTERN = re.compile(
    r"^(?:你好|您好|谢谢|hello\b|hi\b|thanks\b)[\s,，。.!！?？:：;；]*",
    re.IGNORECASE,
)
TRIVIAL_QUESTION_PATTERNS = (
    "你是谁",
    "你能做什么",
    "在吗",
    "在么",
    "有人吗",
    "你在吗",
    "whoareyou",
    "whatcanyoudo",
)
QUESTION_INTENT_MARKERS = (
    "什么",
    "怎么",
    "如何",
    "为什么",
    "为何",
    "哪",
    "是否",
    "能否",
    "能不能",
    "请解释",
    "解释一下",
    "介绍一下",
    "区别",
    "比较",
    "定义",
    "含义",
    "作用",
    "举例",
    "证明",
    "计算",
    "分析",
    "评价",
    "总结",
    "概括",
    "列出",
    "罗列",
    "说明",
    "描述",
    "举个例子",
    "举一个",
    "示例",
    "推导",
    "what",
    "how",
    "why",
    "which",
    "when",
    "where",
    "explain",
    "define",
    "compare",
    "calculate",
    "analyze",
    "summarize",
    "summary",
    "example",
    "describe",
    "outline",
    "illustrate",
)


class ReviewFlagNotFoundError(Exception):
    pass


class ReviewFlagForbiddenError(Exception):
    pass


class ReviewFlagConflictError(Exception):
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


def _is_substantive_question(question: str) -> bool:
    normalized = " ".join(question.casefold().split())
    while normalized:
        stripped, replacements = CONVERSATIONAL_PREFIX_PATTERN.subn("", normalized, count=1)
        if replacements == 0:
            break
        normalized = stripped
    if not normalized:
        return False
    compact = re.sub(r"[\s\W_]+", "", normalized)
    if compact in {"吗", "么", "呢"}:
        return False
    if any(compact.startswith(pattern) for pattern in TRIVIAL_QUESTION_PATTERNS):
        return False
    if normalized.endswith(("?", "？")):
        return True
    return any(marker in normalized for marker in QUESTION_INTENT_MARKERS)


def _detect_review_reasons(
    question: str,
    history: list[Message],
    answer: str,
    used_source_count: int,
    has_course_material: bool,
) -> list[tuple[ReviewReason, ReviewSeverity, dict[str, object]]]:
    normalized_answer = answer.casefold()
    normalized_question = question.casefold()
    substantive_question = _is_substantive_question(question)
    reasons: list[tuple[ReviewReason, ReviewSeverity, dict[str, object]]] = []

    if used_source_count == 0 and substantive_question and has_course_material:
        reasons.append(
            (
                ReviewReason.MISSING_COURSE_BASIS,
                ReviewSeverity.HIGH,
                {
                    "used_source_count": 0,
                    "question_excerpt": question[:500],
                    "substantive_question": True,
                },
            )
        )

    outside_markers = [
        marker for marker in OUTSIDE_MATERIAL_MARKERS if marker.casefold() in normalized_answer
    ]
    if (
        has_course_material
        and outside_markers
        and (len(outside_markers) >= 2 or used_source_count == 0)
    ):
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
    *,
    has_course_material: bool,
) -> list[AIReviewFlag]:
    flags: list[AIReviewFlag] = []
    for reason, severity, details in _detect_review_reasons(
        question,
        history,
        assistant_message.content,
        used_source_count,
        has_course_material,
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
        await session.flush()
        if severity == ReviewSeverity.HIGH:
            teacher_ids = list(
                await session.scalars(
                    select(CourseMember.user_id).where(
                        CourseMember.course_id == course_id,
                        CourseMember.role == UserRole.TEACHER,
                    )
                )
            )
            for teacher_id in teacher_ids:
                await create_notification(
                    session,
                    user_id=teacher_id,
                    actor_id=student_id,
                    course_id=course_id,
                    type=NotificationType.AI_HIGH_RISK,
                    severity=NotificationSeverity.CRITICAL,
                    title="AI 回答需要高风险审核",
                    body=question[:500],
                    action_url=f"/review-flags/{flag.id}",
                    payload_json={"review_flag_id": str(flag.id)},
                    dedupe_key=f"review-high-risk:{assistant_message.id}:{reason.value}",
                )
    return flags


async def _build_review_responses(
    session: AsyncSession,
    flags: list[AIReviewFlag],
) -> list[ReviewFlagResponse]:
    if not flags:
        return []

    message_ids = {flag.message_id for flag in flags}
    conversation_ids = {flag.conversation_id for flag in flags}
    student_ids = {flag.student_id for flag in flags}
    messages = {
        message.id: message
        for message in await session.scalars(select(Message).where(Message.id.in_(message_ids)))
    }
    if len(messages) != len(message_ids):
        raise ReviewFlagNotFoundError

    students = {
        student.id: student
        for student in await session.scalars(select(User).where(User.id.in_(student_ids)))
    }
    user_messages: dict[UUID, list[Message]] = {}
    for message in await session.scalars(
        select(Message)
        .where(
            Message.conversation_id.in_(conversation_ids),
            Message.role == MessageRole.USER,
        )
        .order_by(Message.created_at, Message.id)
    ):
        user_messages.setdefault(message.conversation_id, []).append(message)

    responses: list[ReviewFlagResponse] = []
    for flag in flags:
        message = messages[flag.message_id]
        question = next(
            (
                candidate
                for candidate in reversed(user_messages.get(flag.conversation_id, []))
                if candidate.created_at <= message.created_at
            ),
            None,
        )
        student = students.get(flag.student_id)
        responses.append(
            ReviewFlagResponse(
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
                current_version=flag.current_version or 1,
                generation_status=flag.generation_status or ReviewGenerationStatus.IDLE,
                teacher_note=flag.teacher_note,
                corrected_answer=flag.corrected_answer,
                reviewed_by=flag.reviewed_by,
                reviewed_at=flag.reviewed_at,
                created_at=flag.created_at,
                updated_at=flag.updated_at,
            )
        )
    return responses


async def _build_review_response(
    session: AsyncSession,
    flag: AIReviewFlag,
) -> ReviewFlagResponse:
    return (await _build_review_responses(session, [flag]))[0]


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
    statement = (
        select(AIReviewFlag)
        .join(
            CourseMember,
            and_(
                CourseMember.course_id == AIReviewFlag.course_id,
                CourseMember.user_id == AIReviewFlag.student_id,
            ),
        )
        .where(
            AIReviewFlag.course_id == course_id,
            CourseMember.role == UserRole.STUDENT,
        )
    )
    if status is not None:
        statement = statement.where(AIReviewFlag.status == status)
    if severity is not None:
        statement = statement.where(AIReviewFlag.severity == severity)
    flags = list(
        await session.scalars(
            statement.order_by(AIReviewFlag.created_at.desc(), AIReviewFlag.id.desc()).limit(limit)
        )
    )
    return await _build_review_responses(session, flags)


async def get_review_flag(
    session: AsyncSession,
    course_id: UUID,
    flag_id: UUID,
    requester_id: UUID,
) -> ReviewFlagResponse:
    await _ensure_review_teacher(session, course_id, requester_id)
    flag = await session.scalar(
        select(AIReviewFlag)
        .join(
            CourseMember,
            and_(
                CourseMember.course_id == AIReviewFlag.course_id,
                CourseMember.user_id == AIReviewFlag.student_id,
            ),
        )
        .where(
            AIReviewFlag.id == flag_id,
            AIReviewFlag.course_id == course_id,
            CourseMember.role == UserRole.STUDENT,
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
        select(AIReviewFlag)
        .join(
            CourseMember,
            and_(
                CourseMember.course_id == AIReviewFlag.course_id,
                CourseMember.user_id == AIReviewFlag.student_id,
            ),
        )
        .where(
            AIReviewFlag.id == flag_id,
            AIReviewFlag.course_id == course_id,
            CourseMember.role == UserRole.STUDENT,
        )
        .with_for_update()
    )
    if flag is None:
        raise ReviewFlagNotFoundError
    if flag.status == ReviewStatus.GENERATING:
        raise ReviewFlagConflictError

    from app.services.review_workflow import _append_history, ensure_original_version

    current = await ensure_original_version(session, flag)
    previous_status = flag.status
    status_by_decision = {
        ReviewDecision.CONFIRM_CORRECT: ReviewStatus.CONFIRMED_CORRECT,
        ReviewDecision.MARK_INCORRECT: ReviewStatus.MARKED_INCORRECT,
        ReviewDecision.DISMISS: ReviewStatus.DISMISSED,
    }
    target_status = status_by_decision[payload.decision]
    version = flag.current_version
    if payload.decision == ReviewDecision.MARK_INCORRECT and payload.corrected_answer:
        version = flag.current_version + 1
        session.add(
            ReviewAnswerVersion(
                review_flag_id=flag.id,
                version=version,
                answer=payload.corrected_answer,
                knowledge_point_ids=current.knowledge_point_ids,
                citations=current.citations,
                source=ReviewVersionSource.TEACHER,
                instruction=payload.note,
                created_by=requester_id,
            )
        )
        flag.current_version = version
    flag.status = target_status
    flag.teacher_note = payload.note
    flag.corrected_answer = payload.corrected_answer
    flag.reviewed_by = requester_id
    flag.reviewed_at = datetime.now(UTC)
    await _append_history(
        session,
        flag,
        version=version,
        action={
            ReviewDecision.CONFIRM_CORRECT: ReviewHistoryAction.CONFIRM_CORRECT,
            ReviewDecision.MARK_INCORRECT: ReviewHistoryAction.MARK_INCORRECT,
            ReviewDecision.DISMISS: ReviewHistoryAction.DISMISS,
        }[payload.decision],
        from_status=previous_status,
        to_status=target_status,
        teacher_id=requester_id,
        note=payload.note,
        answer_snapshot=current.answer,
        corrected_answer_snapshot=payload.corrected_answer,
    )
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
    for attempt in range(3):
        try:
            return await _mark_message_not_resolved_once(
                session,
                course_id,
                message_id,
                requester_id,
                payload,
            )
        except IntegrityError as exc:
            await session.rollback()
            if attempt == 2:
                raise ReviewFlagConflictError from exc
    raise ReviewFlagConflictError


async def _mark_message_not_resolved_once(
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

    student_membership = await session.scalar(
        select(CourseMember.id).where(
            CourseMember.course_id == course_id,
            CourseMember.user_id == requester_id,
            CourseMember.role == UserRole.STUDENT,
        )
    )
    if student_membership is None:
        raise ReviewFlagForbiddenError

    flag = await session.scalar(
        select(AIReviewFlag)
        .where(
            AIReviewFlag.message_id == message_id,
            AIReviewFlag.reason == ReviewReason.STUDENT_NOT_RESOLVED,
        )
        .with_for_update()
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
