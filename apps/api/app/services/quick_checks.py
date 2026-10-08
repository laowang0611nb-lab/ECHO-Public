import json
from collections.abc import Sequence
from uuid import UUID

from database.models.chat import Conversation, Message, MessageRole
from database.models.document import Document, DocumentStatus
from database.models.knowledge import Chapter, KnowledgeChunk, KnowledgePoint
from database.models.learning import (
    LearningEventType,
    QuickCheckAttempt,
    StudentKnowledgeState,
)
from database.models.resource import (
    QuestionItem,
    QuestionType,
    question_item_knowledge_points,
)
from database.models.user import User
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.learning import LearningEventCreate
from app.schemas.quick_check import (
    GeneratedQuickCheckDraft,
    HintBlock,
    MasteryUpdateBlock,
    QuickCheckAttemptRequest,
    QuickCheckAttemptResponse,
    QuickCheckBlock,
    QuickCheckOptionBlock,
)
from app.schemas.search import ChunkSearchResult
from app.services.chat_provider import ChatProvider
from app.services.course import get_course_for_member
from app.services.learning import record_learning_event

MAX_QUICK_CHECK_ATTEMPTS = 2
MIN_QUICK_CHECK_SOURCE_CHARS = 80


class QuickCheckNotFoundError(Exception):
    pass


class QuickCheckForbiddenError(Exception):
    pass


class QuickCheckUnavailableError(Exception):
    pass


class QuickCheckInvalidOptionError(Exception):
    pass


class QuickCheckConflictError(Exception):
    pass


class QuickCheckLockedError(Exception):
    pass


class HintNotFoundError(Exception):
    pass


def _string_metadata_list(value: object) -> list[str]:
    if not isinstance(value, list):
        return []
    return [item.strip() for item in value if isinstance(item, str) and item.strip()]


def _question_options(item: QuestionItem) -> list[QuickCheckOptionBlock]:
    raw_options = item.metadata_json.get("options")
    if not isinstance(raw_options, list):
        raise QuickCheckUnavailableError
    options: list[QuickCheckOptionBlock] = []
    for raw_option in raw_options:
        if not isinstance(raw_option, dict):
            raise QuickCheckUnavailableError
        option_id = raw_option.get("id")
        label = raw_option.get("label")
        if not isinstance(option_id, str) or not isinstance(label, str):
            raise QuickCheckUnavailableError
        options.append(QuickCheckOptionBlock(id=option_id, label=label))
    if len(options) < 2:
        raise QuickCheckUnavailableError
    option_ids = {option.id for option in options}
    if len(option_ids) != len(options):
        raise QuickCheckUnavailableError
    return options


def _correct_option_id(item: QuestionItem, options: Sequence[QuickCheckOptionBlock]) -> str:
    raw_correct = item.metadata_json.get("correct_option_id")
    if isinstance(raw_correct, str):
        for option in options:
            if raw_correct in {option.id, option.label}:
                return option.id
    if item.answer:
        for option in options:
            if item.answer in {option.id, option.label}:
                return option.id
    raise QuickCheckUnavailableError


def _hint_levels(item: QuestionItem) -> list[str]:
    hints = _string_metadata_list(item.metadata_json.get("hint_levels"))
    if not hints:
        hints = _string_metadata_list(item.metadata_json.get("hints"))
    fallback = item.explanation.strip() if item.explanation and item.explanation.strip() else ""
    if fallback and fallback not in hints:
        hints.append(fallback)
    if not hints:
        hints.append("先回到课程材料，把题干中的关键词和每个选项分别对应起来。")
    if len(hints) == 1:
        hints.append("再检查一次题干限制条件，想一想哪个选项最符合课程中的定义。")
    return hints[:3]


def _max_attempts(item: QuestionItem) -> int:
    raw = item.metadata_json.get("max_attempts")
    if isinstance(raw, int) and 1 <= raw <= 3:
        return raw
    return MAX_QUICK_CHECK_ATTEMPTS


def _question_knowledge_point_id_sync(item: QuestionItem) -> UUID | None:
    raw = item.metadata_json.get("knowledge_point_id")
    if isinstance(raw, str):
        try:
            return UUID(raw)
        except ValueError:
            return None
    if isinstance(raw, UUID):
        return raw
    return None


async def _question_knowledge_point_id(
    session: AsyncSession,
    item: QuestionItem,
) -> UUID | None:
    points = list(
        await session.scalars(
            select(question_item_knowledge_points.c.knowledge_point_id)
            .join(
                KnowledgePoint,
                KnowledgePoint.id == question_item_knowledge_points.c.knowledge_point_id,
            )
            .join(Chapter, Chapter.id == KnowledgePoint.chapter_id)
            .join(Document, Document.id == Chapter.document_id)
            .where(
                question_item_knowledge_points.c.question_item_id == item.id,
                KnowledgePoint.trashed_at.is_(None),
                Chapter.trashed_at.is_(None),
                Document.trashed_at.is_(None),
            )
            .limit(1)
        )
    )
    if points:
        return points[0]
    fallback = _question_knowledge_point_id_sync(item)
    if fallback is None:
        return None
    return await session.scalar(
        select(KnowledgePoint.id)
        .join(Chapter, Chapter.id == KnowledgePoint.chapter_id)
        .join(Document, Document.id == Chapter.document_id)
        .where(
            KnowledgePoint.id == fallback,
            KnowledgePoint.trashed_at.is_(None),
            Chapter.trashed_at.is_(None),
            Document.trashed_at.is_(None),
        )
    )


async def _knowledge_point_material_supports_quick_check(
    session: AsyncSession,
    course_id: UUID,
    knowledge_point_id: UUID,
    sources: Sequence[ChunkSearchResult],
) -> bool:
    point = await session.scalar(
        select(KnowledgePoint)
        .join(Chapter, Chapter.id == KnowledgePoint.chapter_id)
        .join(Document, Document.id == Chapter.document_id)
        .where(
            KnowledgePoint.id == knowledge_point_id,
            KnowledgePoint.course_id == course_id,
            KnowledgePoint.trashed_at.is_(None),
            Chapter.trashed_at.is_(None),
            Document.trashed_at.is_(None),
            Document.status == DocumentStatus.READY,
        )
    )
    if point is None or not sources:
        return False
    matching_source_ids = set(
        await session.scalars(
            select(KnowledgeChunk.id)
            .join(Chapter, Chapter.id == KnowledgeChunk.chapter_id)
            .join(Document, Document.id == KnowledgeChunk.document_id)
            .where(
                KnowledgeChunk.id.in_([source.chunk_id for source in sources]),
                KnowledgeChunk.course_id == course_id,
                KnowledgeChunk.chapter_id == point.chapter_id,
                Chapter.trashed_at.is_(None),
                Document.trashed_at.is_(None),
                Document.status == DocumentStatus.READY,
            )
        )
    )
    relevant_source_chars = sum(
        len(source.content.strip()) for source in sources if source.chunk_id in matching_source_ids
    )
    return relevant_source_chars >= MIN_QUICK_CHECK_SOURCE_CHARS


async def resolve_knowledge_point_id(
    session: AsyncSession,
    course_id: UUID,
    source_chunk_ids: Sequence[UUID],
    explicit_id: UUID | None = None,
) -> UUID | None:
    if explicit_id is not None:
        point = await session.scalar(
            select(KnowledgePoint.id)
            .join(Chapter, Chapter.id == KnowledgePoint.chapter_id)
            .join(Document, Document.id == Chapter.document_id)
            .where(
                KnowledgePoint.id == explicit_id,
                KnowledgePoint.course_id == course_id,
                KnowledgePoint.trashed_at.is_(None),
                Chapter.trashed_at.is_(None),
                Document.trashed_at.is_(None),
            )
        )
        if point is None:
            raise QuickCheckNotFoundError
        return point

    if not source_chunk_ids:
        return None
    chapter_ids = list(
        await session.scalars(
            select(KnowledgeChunk.chapter_id)
            .join(Chapter, Chapter.id == KnowledgeChunk.chapter_id)
            .join(Document, Document.id == Chapter.document_id)
            .where(
                KnowledgeChunk.id.in_(source_chunk_ids),
                KnowledgeChunk.course_id == course_id,
                KnowledgeChunk.chapter_id.is_not(None),
                Chapter.trashed_at.is_(None),
                Document.trashed_at.is_(None),
            )
        )
    )
    chapter_ids = [chapter_id for chapter_id in chapter_ids if chapter_id is not None]
    if not chapter_ids:
        return None
    return await session.scalar(
        select(KnowledgePoint.id)
        .join(Chapter, Chapter.id == KnowledgePoint.chapter_id)
        .join(Document, Document.id == Chapter.document_id)
        .where(
            KnowledgePoint.course_id == course_id,
            KnowledgePoint.chapter_id.in_(chapter_ids),
            KnowledgePoint.trashed_at.is_(None),
            Chapter.trashed_at.is_(None),
            Document.trashed_at.is_(None),
        )
        .order_by(KnowledgePoint.order_index, KnowledgePoint.created_at)
        .limit(1)
    )


def build_quick_check_block(
    item: QuestionItem,
    *,
    question_id: UUID | None = None,
    status: str = "unanswered",
    selected_option_id: str | None = None,
    correct: bool | None = None,
    explanation: str | None = None,
    hint: str | None = None,
    attempts_used: int = 0,
    locked: bool = False,
) -> QuickCheckBlock:
    options = _question_options(item)
    max_attempts = _max_attempts(item)
    remaining = max(0, max_attempts - attempts_used)
    if correct:
        status = "correct"
        remaining = None
    elif locked:
        status = "locked"
        remaining = 0
    elif selected_option_id is not None:
        status = "selected"
    return QuickCheckBlock(
        question_id=question_id or item.id,
        title=item.title,
        prompt=item.content,
        options=options,
        status=status,
        selected_option_id=selected_option_id,
        attempts_remaining=remaining,
        correct=correct,
        explanation=explanation,
        hint=hint,
    )


def build_hint_block(item: QuestionItem, level: int) -> HintBlock:
    hints = _hint_levels(item)
    normalized_level = max(1, min(level, len(hints)))
    return HintBlock(
        level=normalized_level,
        title=item.title or None,
        content=hints[normalized_level - 1],
        can_request_more=normalized_level < len(hints),
    )


def _quick_check_from_message_blocks(
    message: Message,
    question_id: UUID,
) -> dict[str, object] | None:
    for raw_block in message.blocks:
        if not isinstance(raw_block, dict):
            continue
        if raw_block.get("type") != "quick_check":
            continue
        if raw_block.get("question_id") == str(question_id):
            return raw_block
    return None


def _hint_level_from_message(message: Message) -> int:
    levels: list[int] = []
    for raw_block in message.blocks:
        if not isinstance(raw_block, dict) or raw_block.get("type") != "hint":
            continue
        level = raw_block.get("level")
        if isinstance(level, int):
            levels.append(level)
    return max(levels, default=0)


def _replace_message_block(
    message: Message,
    *,
    block_type: str,
    question_id: UUID | None,
    block: dict[str, object],
) -> None:
    next_blocks: list[dict[str, object]] = []
    replaced = False
    for raw_block in message.blocks:
        if not isinstance(raw_block, dict):
            continue
        if raw_block.get("type") != block_type:
            next_blocks.append(raw_block)
            continue
        if block_type == "quick_check":
            if raw_block.get("question_id") != (str(question_id) if question_id else None):
                next_blocks.append(raw_block)
                continue
        next_blocks.append(block)
        replaced = True
    if not replaced:
        next_blocks.append(block)
    message.blocks = next_blocks


async def _load_message_for_user(
    session: AsyncSession,
    message_id: UUID,
    user_id: UUID,
) -> tuple[Message, Conversation]:
    message = await session.get(Message, message_id)
    if message is None:
        raise QuickCheckNotFoundError
    conversation = await session.get(Conversation, message.conversation_id)
    if conversation is None:
        raise QuickCheckNotFoundError
    if conversation.user_id != user_id:
        raise QuickCheckForbiddenError
    return message, conversation


async def _resolve_attempt_target(
    session: AsyncSession,
    user_id: UUID,
    payload: QuickCheckAttemptRequest,
    question_item: QuestionItem,
) -> tuple[UUID | None, Message | None]:
    conversation_id = payload.conversation_id
    message: Message | None = None
    if payload.message_id is not None:
        message, conversation = await _load_message_for_user(
            session,
            payload.message_id,
            user_id,
        )
        if conversation_id is not None and conversation.id != conversation_id:
            raise QuickCheckConflictError
        conversation_id = conversation.id
    if conversation_id is not None:
        conversation = await session.get(Conversation, conversation_id)
        if conversation is None:
            raise QuickCheckNotFoundError
        if conversation.user_id != user_id:
            raise QuickCheckForbiddenError
        if conversation.course_id != question_item.course_id:
            raise QuickCheckConflictError
    return conversation_id, message


async def _load_question(
    session: AsyncSession,
    question_id: UUID,
) -> QuestionItem:
    item = await session.scalar(
        select(QuestionItem).where(
            QuestionItem.id == question_id,
            QuestionItem.trashed_at.is_(None),
        )
    )
    if item is None:
        raise QuickCheckNotFoundError
    return item


async def _mastery_score(
    session: AsyncSession,
    course_id: UUID,
    user_id: UUID,
    knowledge_point_id: UUID | None,
) -> float | None:
    if knowledge_point_id is None:
        return None
    score = await session.scalar(
        select(StudentKnowledgeState.score).where(
            StudentKnowledgeState.course_id == course_id,
            StudentKnowledgeState.user_id == user_id,
            StudentKnowledgeState.knowledge_point_id == knowledge_point_id,
        )
    )
    return 50.0 if score is None else float(score)


async def submit_quick_check_attempt(
    session: AsyncSession,
    user_id: UUID,
    question_id: UUID,
    payload: QuickCheckAttemptRequest,
) -> QuickCheckAttemptResponse:
    item = await _load_question(session, question_id)
    await get_course_for_member(session, item.course_id, user_id)
    options = _question_options(item)
    correct_option_id = _correct_option_id(item, options)
    option_ids = {option.id for option in options}
    if payload.selected_option_id not in option_ids:
        raise QuickCheckInvalidOptionError

    existing = await session.scalar(
        select(QuickCheckAttempt).where(
            QuickCheckAttempt.user_id == user_id,
            QuickCheckAttempt.attempt_id == payload.attempt_id,
        )
    )
    if existing is not None:
        if existing.question_item_id != question_id:
            raise QuickCheckConflictError
        if not existing.response_json:
            raise QuickCheckConflictError
        return QuickCheckAttemptResponse.model_validate(existing.response_json)

    conversation_id, message = await _resolve_attempt_target(
        session,
        user_id,
        payload,
        item,
    )

    await session.execute(select(User.id).where(User.id == user_id).with_for_update())
    attempt_count_statement = (
        select(func.count())
        .select_from(QuickCheckAttempt)
        .where(
            QuickCheckAttempt.user_id == user_id,
            QuickCheckAttempt.question_item_id == question_id,
        )
    )
    if conversation_id is not None:
        attempt_count_statement = attempt_count_statement.where(
            QuickCheckAttempt.conversation_id == conversation_id
        )
    prior_attempts = int(await session.scalar(attempt_count_statement) or 0)
    max_attempts = _max_attempts(item)
    if prior_attempts >= max_attempts:
        raise QuickCheckLockedError

    knowledge_point_id = await _question_knowledge_point_id(session, item)
    correct = payload.selected_option_id == correct_option_id
    attempt = QuickCheckAttempt(
        course_id=item.course_id,
        user_id=user_id,
        knowledge_point_id=knowledge_point_id,
        question_item_id=question_id,
        conversation_id=conversation_id,
        message_id=message.id if message is not None else None,
        attempt_id=payload.attempt_id,
        selected_option_id=payload.selected_option_id,
        correct=correct,
        response_json={},
    )
    session.add(attempt)
    try:
        await session.flush()
    except IntegrityError as exc:
        await session.rollback()
        existing = await session.scalar(
            select(QuickCheckAttempt).where(
                QuickCheckAttempt.user_id == user_id,
                QuickCheckAttempt.attempt_id == payload.attempt_id,
            )
        )
        if existing is not None and existing.response_json:
            return QuickCheckAttemptResponse.model_validate(existing.response_json)
        raise QuickCheckConflictError from exc

    before_score = await _mastery_score(
        session,
        item.course_id,
        user_id,
        knowledge_point_id,
    )
    attempt_number = prior_attempts + 1
    event = await record_learning_event(
        session,
        item.course_id,
        LearningEventCreate(
            student_id=user_id,
            knowledge_point_id=knowledge_point_id,
            conversation_id=conversation_id,
            message_id=message.id if message is not None else None,
            event_type=(
                LearningEventType.QUIZ_CORRECT if correct else LearningEventType.QUIZ_WRONG
            ),
            evidence=f"Quick Check 选择：{payload.selected_option_id}",
            metadata_json={
                "question_item_id": str(question_id),
                "attempt_id": payload.attempt_id,
                "attempt_number": attempt_number,
                "selected_option_id": payload.selected_option_id,
            },
        ),
        commit=False,
    )
    after_score = await _mastery_score(
        session,
        item.course_id,
        user_id,
        knowledge_point_id,
    )
    mastery_update: MasteryUpdateBlock | None = None
    if (
        correct
        and knowledge_point_id is not None
        and after_score is not None
        and before_score is not None
    ):
        mastery_update = MasteryUpdateBlock(
            knowledge_point_id=knowledge_point_id,
            knowledge_point_name=None,
            before=before_score,
            after=after_score,
            reason="本次快速检测表现良好",
            evidence_id=str(event.id),
        )

    locked = not correct and attempt_number >= max_attempts
    hint: str | None = None
    explanation: str | None = None
    if correct:
        explanation = item.explanation
    elif locked:
        explanation = item.explanation
    else:
        hints = _hint_levels(item)
        hint = hints[min(attempt_number - 1, len(hints) - 1)]

    response = QuickCheckAttemptResponse(
        attempt_id=payload.attempt_id,
        question_id=question_id,
        correct=correct,
        locked=locked,
        explanation=explanation,
        hint=hint,
        mastery_update=mastery_update,
    )
    attempt.response_json = response.model_dump(mode="json")
    if message is not None:
        updated_block = build_quick_check_block(
            item,
            question_id=question_id,
            selected_option_id=payload.selected_option_id,
            correct=correct,
            explanation=explanation,
            hint=hint,
            attempts_used=attempt_number,
            locked=locked,
        )
        _replace_message_block(
            message,
            block_type="quick_check",
            question_id=question_id,
            block=updated_block.model_dump(mode="json"),
        )
        if mastery_update is not None:
            message.blocks = [
                block
                for block in message.blocks
                if not (
                    isinstance(block, dict)
                    and block.get("type") == "mastery_update"
                    and block.get("knowledge_point_id") == str(mastery_update.knowledge_point_id)
                )
            ]
            message.blocks = [
                *message.blocks,
                mastery_update.model_dump(mode="json"),
            ]
    session.add(attempt)
    await session.commit()
    return response


async def request_next_hint(
    session: AsyncSession,
    user_id: UUID,
    message_id: UUID,
    requested_level: int | None = None,
) -> HintBlock:
    message, conversation = await _load_message_for_user(session, message_id, user_id)
    if message.role != MessageRole.ASSISTANT:
        raise HintNotFoundError
    question_id: UUID | None = None
    for raw_block in message.blocks:
        if not isinstance(raw_block, dict):
            continue
        if raw_block.get("type") != "quick_check":
            continue
        raw_question_id = raw_block.get("question_id")
        if isinstance(raw_question_id, str):
            try:
                question_id = UUID(raw_question_id)
            except ValueError:
                continue
            break
    if question_id is None:
        raise HintNotFoundError
    item = await _load_question(session, question_id)
    if item.course_id != conversation.course_id:
        raise QuickCheckConflictError
    current_level = _hint_level_from_message(message)
    target_level = (
        current_level + 1 if requested_level is None else max(current_level + 1, requested_level)
    )
    hint = build_hint_block(item, target_level)
    _replace_message_block(
        message,
        block_type="hint",
        question_id=None,
        block=hint.model_dump(mode="json"),
    )
    knowledge_point_id = await _question_knowledge_point_id(session, item)
    await record_learning_event(
        session,
        conversation.course_id,
        LearningEventCreate(
            student_id=user_id,
            knowledge_point_id=knowledge_point_id,
            conversation_id=conversation.id,
            message_id=message.id,
            event_type=LearningEventType.HINT_REQUESTED,
            evidence=f"请求第 {hint.level} 层提示",
            metadata_json={
                "question_item_id": str(question_id),
                "hint_level": hint.level,
            },
        ),
    )
    return hint


async def _generate_question_draft(
    provider: ChatProvider,
    *,
    question: str,
    knowledge_point: KnowledgePoint,
    sources: Sequence[ChunkSearchResult],
    teaching_policy: str | None,
) -> GeneratedQuickCheckDraft | None:
    complete = getattr(provider, "complete", None)
    if complete is None:
        return None
    source_text = "\n\n".join(
        f"[{index}] {source.content[:1200]}" for index, source in enumerate(sources[:4], start=1)
    )
    system_prompt = (
        "You design one short single-choice diagnostic question for a student. "
        "Return strict JSON only. Do not reveal chain-of-thought. The JSON shape is "
        '{"title":string,"prompt":string,"options":[{"id":string,"label":string}],'
        '"correct_option_id":string,"explanation":string,"hints":[string,string]}. '
        "Use 2 to 4 options, exactly one correct option, and 2 to 3 progressive hints. "
        "The explanation and hints must be grounded in the course material."
    )
    user_prompt = (
        f"STUDENT QUESTION:\n{question}\n\n"
        f"KNOWLEDGE POINT:\n{knowledge_point.name}\n"
        f"{knowledge_point.description or 'No description.'}\n\n"
        f"TEACHER POLICY:\n{teaching_policy or 'No additional policy.'}\n\n"
        f"COURSE MATERIAL:\n{source_text or 'No retrieved course material.'}\n\n"
        "Create a question that checks the key distinction needed to answer the "
        "student question."
    )
    try:
        raw = await complete(
            [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ]
        )
    except Exception:
        return None
    if not raw:
        return None
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.removeprefix("```json").removeprefix("```").strip()
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3].strip()
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start < 0 or end <= start:
        return None
    try:
        payload = json.loads(cleaned[start : end + 1])
        return GeneratedQuickCheckDraft.model_validate(payload)
    except (ValueError, TypeError, json.JSONDecodeError):
        return None


async def ensure_quick_check_for_chat(
    session: AsyncSession,
    provider: ChatProvider,
    *,
    course_id: UUID,
    user_id: UUID,
    question: str,
    knowledge_point_id: UUID | None,
    sources: Sequence[ChunkSearchResult],
    teaching_policy: str | None,
) -> QuestionItem | None:
    if knowledge_point_id is None:
        return None
    statement = select(QuestionItem).where(
        QuestionItem.course_id == course_id,
        QuestionItem.trashed_at.is_(None),
        QuestionItem.type == QuestionType.SINGLE_CHOICE,
        QuestionItem.id.in_(
            select(question_item_knowledge_points.c.question_item_id).where(
                question_item_knowledge_points.c.knowledge_point_id == knowledge_point_id
            )
        ),
    )
    candidates = list(
        await session.scalars(
            statement.order_by(QuestionItem.created_at.desc(), QuestionItem.id.desc()).limit(8)
        )
    )
    for candidate in candidates:
        try:
            _question_options(candidate)
            _correct_option_id(candidate, _question_options(candidate))
        except QuickCheckUnavailableError:
            continue
        return candidate

    if not await _knowledge_point_material_supports_quick_check(
        session,
        course_id,
        knowledge_point_id,
        sources,
    ):
        return None
    point = await session.scalar(
        select(KnowledgePoint)
        .join(Chapter, Chapter.id == KnowledgePoint.chapter_id)
        .join(Document, Document.id == Chapter.document_id)
        .where(
            KnowledgePoint.id == knowledge_point_id,
            KnowledgePoint.course_id == course_id,
            KnowledgePoint.trashed_at.is_(None),
            Chapter.trashed_at.is_(None),
            Document.trashed_at.is_(None),
            Document.status == DocumentStatus.READY,
        )
    )
    if point is None:
        return None
    draft = await _generate_question_draft(
        provider,
        question=question,
        knowledge_point=point,
        sources=sources,
        teaching_policy=teaching_policy,
    )
    if draft is None:
        return None
    item = QuestionItem(
        course_id=course_id,
        type=QuestionType.SINGLE_CHOICE,
        title=draft.title,
        content=draft.prompt,
        answer=draft.correct_option_id,
        explanation=draft.explanation,
        metadata_json={
            "options": [option.model_dump(mode="json") for option in draft.options],
            "correct_option_id": draft.correct_option_id,
            "hint_levels": draft.hints,
            "max_attempts": MAX_QUICK_CHECK_ATTEMPTS,
            "generated": True,
            "knowledge_point_id": str(knowledge_point_id),
        },
        created_by=user_id,
    )
    item.knowledge_points = [point]
    session.add(item)
    await session.flush()
    return item
