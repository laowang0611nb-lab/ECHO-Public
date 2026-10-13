import hashlib
import json
import re
from dataclasses import dataclass
from datetime import UTC, datetime
from enum import StrEnum
from uuid import UUID

from database.models.chat import (
    ConversationTeachingState,
    TeachingDialogEvent,
    TeachingIntent,
    TeachingStage,
)
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.search import ChunkSearchResult
from app.services.chat_provider import ChatProvider

MAX_TEACHING_HINT_LEVELS = 3
MAX_CONSECUTIVE_INCORRECT_ATTEMPTS = 2

CHITCHAT_INPUTS = frozenset(
    {
        "hi",
        "hello",
        "hey",
        "你好",
        "您好",
        "嗨",
        "哈喽",
        "在吗",
        "在么",
        "在不在",
        "有人吗",
        "你好吗",
        "您好吗",
        "谢谢",
        "多谢",
        "感谢",
        "thanks",
        "thankyou",
        "thx",
        "ok",
        "okay",
        "好的",
        "收到",
        "了解",
        "嗯",
        "哦",
        "哈哈",
        "测试",
        "test",
        "testing",
        "试一下",
        "试试",
    }
)
CHITCHAT_PREFIX_PATTERN = re.compile(
    r"^(?:你好|您好|嗨|哈喽|hi|hello|hey|thanks|thankyou|谢谢|多谢|感谢)"
    r"[\s,，。.!！?？:：;；]*",
    re.IGNORECASE,
)
ANSWER_REQUEST_PATTERN = re.compile(
    r"(?:直接|马上|赶紧|请)?\s*(?:告诉|给|说|公布|展示|写出|写出?|列出)?\s*"
    r"(?:我)?\s*(?:正确)?\s*(?:答案|最终答案|结果|选项|解法|步骤)"
    r"|(?:别|不要|不用)\s*(?:再)?\s*(?:提示|引导|让我想)"
    r"|(?:直接|就)\s*(?:说|给|告诉我)\s*吧",
    re.IGNORECASE,
)
EXERCISE_MARKERS = (
    "选择",
    "multiple choice",
    "correct option",
    "which option",
    "单选",
    "exercise",
    "homework",
    "solve",
    "calculate",
    "prove",
    "give an example",
    "多选",
    "哪一",
    "哪些",
    "是否正确",
    "判断",
    "计算",
    "证明",
    "作业",
    "习题",
    "题目",
    "选项",
    "填空",
    "编程",
    "代码",
    "输出",
    "结果",
    "求解",
    "帮我做",
    "怎么做",
    "举个例子",
    "举例",
)
CONCEPT_MARKERS = (
    "什么是",
    "是什么",
    "解释",
    "explain",
    "what is",
    "why",
    "how does",
    "describe",
    "summarize",
    "说明",
    "定义",
    "含义",
    "区别",
    "为什么",
    "原理",
    "概述",
    "总结",
    "介绍一下",
    "列出",
    "讲讲",
)
AMBIGUOUS_MARKERS = (
    "这个",
    "那个",
    "它",
    "这里",
    "那里",
    "具体",
    "没听懂",
    "不清楚",
    "怎么弄",
    "怎么办",
)
ATTEMPT_MARKERS = (
    "我认为",
    "我觉得",
    "我选",
    "我的答案",
    "我猜",
    "是不是",
    "因为",
    "所以",
    "步骤",
    "先",
    "然后",
)
CORRECT_ATTEMPT_MARKERS = (
    "我懂了",
    "我明白了",
    "我会了",
    "理解了",
    "知道了",
)
INCORRECT_ATTEMPT_MARKERS = (
    "不会",
    "不知道",
    "不懂",
    "没思路",
    "没头绪",
    "想不出来",
)
ANSWER_LEAK_PATTERNS = (
    re.compile(r"(?:最终|正确|标准)?答案\s*[是为：:]\s*[A-Da-d0-9一二三四五六七八九十]"),
    re.compile(r"正确(?:的)?(?:选项|答案)"),
    re.compile(r"(?:应该|应当|可以)?\s*(?:选|选择)\s*[A-Da-d]\b"),
    re.compile(r"the\s+correct\s+(?:answer|option)", re.IGNORECASE),
    re.compile(r"option\s+[A-D]\s+is\s+(?:correct|right)", re.IGNORECASE),
)


class TeachingTurnMode(StrEnum):
    NORMAL = "normal"
    CONCEPT_CORE = "concept_core"
    CLARIFY = "clarify"
    HINT = "hint"
    EXPLAIN = "explain"


class AttemptAssessment(StrEnum):
    CORRECT = "correct"
    PARTIAL = "partial"
    INCORRECT = "incorrect"


class TeachingStateConflictError(Exception):
    pass


@dataclass(frozen=True)
class TeachingTurnClassification:
    intent: TeachingIntent
    is_follow_up: bool = False
    confidence: float = 0.7
    source: str = "rules"


@dataclass(frozen=True)
class TeachingTurnPlan:
    intent: TeachingIntent
    state_intent: TeachingIntent
    mode: TeachingTurnMode
    previous_stage: TeachingStage
    next_stage: TeachingStage
    hint_level: int
    attempt_count: int
    consecutive_incorrect_count: int
    answer_requested: bool
    persist_state: bool
    offer_quick_check: bool
    reason: str
    pending_question: str | None
    state_version_expected: int
    assessment: AttemptAssessment | None = None

    @property
    def guards_against_answer_leak(self) -> bool:
        return self.mode in {
            TeachingTurnMode.CLARIFY,
            TeachingTurnMode.HINT,
        }


def _normalize_text(value: str) -> str:
    return " ".join(value.casefold().split())


def _compact_text(value: str) -> str:
    return re.sub(r"[\W_]+", "", value.casefold(), flags=re.UNICODE)


def is_chitchat_text(question: str) -> bool:
    normalized = _normalize_text(question)
    if not normalized:
        return True
    if _compact_text(normalized) in CHITCHAT_INPUTS:
        return True
    remainder = normalized
    for _ in range(3):
        stripped = CHITCHAT_PREFIX_PATTERN.sub("", remainder, count=1).strip()
        if stripped == remainder:
            break
        remainder = stripped
    compact = _compact_text(remainder)
    return (
        not compact
        or len(compact) < 2
        or compact in CHITCHAT_INPUTS
        or compact in {"老师", "你", "您", "请问"}
    )


def explicit_answer_requested(question: str) -> bool:
    return bool(ANSWER_REQUEST_PATTERN.search(_normalize_text(question)))


def looks_like_new_question(question: str) -> bool:
    normalized = _normalize_text(question)
    if not normalized:
        return False
    if any(
        normalized.startswith(marker)
        for marker in (
            "什么是",
            "请解释",
            "解释一下",
            "说明一下",
            "介绍一下",
            "请问",
            "帮我",
        )
    ):
        return True
    return (
        normalized.endswith(("?", "？"))
        and any(marker in normalized for marker in CONCEPT_MARKERS + EXERCISE_MARKERS)
        and not any(marker in normalized for marker in ATTEMPT_MARKERS)
    )


def looks_like_attempt(question: str) -> bool:
    normalized = _normalize_text(question)
    if explicit_answer_requested(normalized):
        return False
    if any(marker in normalized for marker in ATTEMPT_MARKERS):
        return True
    if any(marker in normalized for marker in CORRECT_ATTEMPT_MARKERS):
        return True
    if any(marker in normalized for marker in INCORRECT_ATTEMPT_MARKERS):
        return True
    compact = _compact_text(normalized)
    return bool(compact) and len(compact) <= 12 and not looks_like_new_question(normalized)


def classify_teaching_turn_rules(
    question: str,
    *,
    current_state: ConversationTeachingState | None,
    has_knowledge_point: bool,
) -> TeachingTurnClassification:
    if is_chitchat_text(question):
        return TeachingTurnClassification(TeachingIntent.CHITCHAT, confidence=0.99)
    if explicit_answer_requested(question):
        return TeachingTurnClassification(
            TeachingIntent.ANSWER_REQUEST,
            is_follow_up=current_state is not None,
            confidence=0.95,
        )

    normalized = _normalize_text(question)
    if (
        current_state is not None
        and current_state.stage != TeachingStage.COMPLETED
        and not looks_like_new_question(question)
    ):
        return TeachingTurnClassification(
            TeachingIntent.ATTEMPT,
            is_follow_up=True,
            confidence=0.85,
        )

    if any(marker in normalized for marker in EXERCISE_MARKERS):
        return TeachingTurnClassification(TeachingIntent.EXERCISE, confidence=0.85)
    if any(marker in normalized for marker in CONCEPT_MARKERS):
        return TeachingTurnClassification(TeachingIntent.CONCEPT, confidence=0.85)
    if any(marker in normalized for marker in AMBIGUOUS_MARKERS):
        return TeachingTurnClassification(TeachingIntent.AMBIGUOUS, confidence=0.75)
    compact = _compact_text(normalized)
    if len(compact) <= 6:
        return TeachingTurnClassification(TeachingIntent.AMBIGUOUS, confidence=0.7)
    if normalized.endswith(("?", "？")) and has_knowledge_point:
        return TeachingTurnClassification(TeachingIntent.CONCEPT, confidence=0.6)
    return TeachingTurnClassification(TeachingIntent.AMBIGUOUS, confidence=0.55)


async def classify_teaching_turn(
    provider: ChatProvider | None,
    question: str,
    *,
    current_state: ConversationTeachingState | None,
    has_knowledge_point: bool,
    use_llm: bool,
) -> TeachingTurnClassification:
    classification = classify_teaching_turn_rules(
        question,
        current_state=current_state,
        has_knowledge_point=has_knowledge_point,
    )
    if (
        not use_llm
        or provider is None
        or not hasattr(provider, "complete")
        or classification.confidence >= 0.7
    ):
        return classification

    system_prompt = (
        "Classify one student turn for a course teaching agent. Return strict JSON only "
        'with {"intent": one of "concept","exercise","ambiguous","attempt",'
        '"answer_request","chitchat", "confidence": number}. '
        "Do not answer the question and do not include markdown."
    )
    user_prompt = (
        f"Current teaching stage: "
        f"{current_state.stage.value if current_state else 'none'}\n"
        f"Knowledge point resolved: {str(has_knowledge_point).lower()}\n"
        f"Student turn:\n{question}"
    )
    try:
        raw = await provider.complete(
            [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ]
        )
        payload = _parse_json_object(raw)
        raw_intent = payload.get("intent")
        raw_confidence = payload.get("confidence", 0.6)
        intent = TeachingIntent(raw_intent)
        confidence = float(raw_confidence)
    except (TypeError, ValueError, json.JSONDecodeError):
        return classification
    return TeachingTurnClassification(
        intent=intent,
        is_follow_up=intent == TeachingIntent.ATTEMPT,
        confidence=max(0.0, min(confidence, 1.0)),
        source="llm",
    )


def _parse_json_object(raw: str) -> dict[str, object]:
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.removeprefix("```json").removeprefix("```").strip()
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3].strip()
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start < 0 or end <= start:
        raise json.JSONDecodeError("JSON object not found", cleaned, 0)
    payload = json.loads(cleaned[start : end + 1])
    if not isinstance(payload, dict):
        raise TypeError("JSON payload is not an object")
    return payload


async def assess_question_attempt(
    provider: ChatProvider | None,
    *,
    question: str,
    student_answer: str,
    sources: list[ChunkSearchResult],
    use_llm: bool,
) -> AttemptAssessment:
    normalized = _normalize_text(student_answer)
    if any(marker in normalized for marker in CORRECT_ATTEMPT_MARKERS):
        return AttemptAssessment.CORRECT
    if any(marker in normalized for marker in INCORRECT_ATTEMPT_MARKERS):
        return AttemptAssessment.INCORRECT
    if not use_llm or provider is None or not hasattr(provider, "complete"):
        return AttemptAssessment.PARTIAL

    source_text = "\n".join(
        f"[{index}] {source.content[:600]}" for index, source in enumerate(sources[:3], start=1)
    )
    system_prompt = (
        "Assess whether the student's attempted response is correct for the course "
        "question. Return strict JSON only with "
        '{"assessment":"correct|partial|incorrect","confidence":number}. '
        "Do not reveal the answer and do not add explanations."
    )
    user_prompt = (
        f"Question:\n{question}\n\n"
        f"Student attempt:\n{student_answer}\n\n"
        f"Course sources:\n{source_text or 'No course sources found.'}"
    )
    try:
        raw = await provider.complete(
            [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ]
        )
        payload = _parse_json_object(raw)
        assessment = AttemptAssessment(payload.get("assessment"))
        confidence = float(payload.get("confidence", 0.6))
    except (TypeError, ValueError, json.JSONDecodeError):
        return AttemptAssessment.PARTIAL
    if assessment == AttemptAssessment.CORRECT and confidence < 0.75:
        return AttemptAssessment.PARTIAL
    return assessment


def build_topic_key(
    *,
    resolved_knowledge_point_id: UUID | None,
    question: str,
) -> str:
    if resolved_knowledge_point_id is not None:
        return f"kp:{resolved_knowledge_point_id}"
    digest = hashlib.sha256(_compact_text(question).encode("utf-8")).hexdigest()[:24]
    return f"topic:{digest}"


async def latest_teaching_state(
    session: AsyncSession,
    conversation_id: UUID,
) -> ConversationTeachingState | None:
    return await session.scalar(
        select(ConversationTeachingState)
        .where(ConversationTeachingState.conversation_id == conversation_id)
        .order_by(
            ConversationTeachingState.updated_at.desc(),
            ConversationTeachingState.created_at.desc(),
        )
        .limit(1)
    )


def select_teaching_state_for_turn(
    *,
    latest_state: ConversationTeachingState | None,
    resolved_knowledge_point_id: UUID | None,
    classification: TeachingTurnClassification,
    question: str,
) -> tuple[ConversationTeachingState | None, str]:
    if classification.intent == TeachingIntent.CHITCHAT:
        return None, ""
    if (
        classification.is_follow_up
        and latest_state is not None
        and latest_state.stage != TeachingStage.COMPLETED
    ):
        return latest_state, latest_state.topic_key
    if (
        latest_state is not None
        and resolved_knowledge_point_id is not None
        and latest_state.knowledge_point_id == resolved_knowledge_point_id
    ):
        return latest_state, latest_state.topic_key
    return None, build_topic_key(
        resolved_knowledge_point_id=resolved_knowledge_point_id,
        question=question,
    )


def plan_teaching_turn(
    *,
    classification: TeachingTurnClassification,
    state: ConversationTeachingState | None,
    assessment: AttemptAssessment | None = None,
    max_hint_levels: int = MAX_TEACHING_HINT_LEVELS,
    max_incorrect_attempts: int = MAX_CONSECUTIVE_INCORRECT_ATTEMPTS,
) -> TeachingTurnPlan:
    previous_stage = state.stage if state is not None else TeachingStage.IDLE
    hint_level = state.hint_level if state is not None else 0
    attempt_count = state.attempt_count if state is not None else 0
    incorrect_count = state.consecutive_incorrect_count if state is not None else 0
    answer_requested = state.answer_requested if state is not None else False
    state_intent = state.intent if state is not None else classification.intent
    state_version = state.state_version if state is not None else 1

    if classification.intent == TeachingIntent.CHITCHAT:
        return TeachingTurnPlan(
            intent=classification.intent,
            state_intent=state_intent,
            mode=TeachingTurnMode.NORMAL,
            previous_stage=previous_stage,
            next_stage=previous_stage,
            hint_level=hint_level,
            attempt_count=attempt_count,
            consecutive_incorrect_count=incorrect_count,
            answer_requested=answer_requested,
            persist_state=False,
            offer_quick_check=False,
            reason="chitchat",
            pending_question=None,
            state_version_expected=state_version,
        )

    if classification.intent == TeachingIntent.ANSWER_REQUEST:
        return TeachingTurnPlan(
            intent=classification.intent,
            state_intent=state_intent,
            mode=TeachingTurnMode.EXPLAIN,
            previous_stage=previous_stage,
            next_stage=TeachingStage.READY_FOR_QUICK_CHECK,
            hint_level=hint_level,
            attempt_count=attempt_count,
            consecutive_incorrect_count=incorrect_count,
            answer_requested=True,
            persist_state=True,
            offer_quick_check=True,
            reason="student_requested_answer",
            pending_question=state.pending_question if state is not None else None,
            state_version_expected=state_version,
        )

    is_attempt = classification.intent == TeachingIntent.ATTEMPT and state is not None
    if not is_attempt:
        if classification.intent == TeachingIntent.CONCEPT:
            return TeachingTurnPlan(
                intent=classification.intent,
                state_intent=classification.intent,
                mode=TeachingTurnMode.CONCEPT_CORE,
                previous_stage=previous_stage,
                next_stage=TeachingStage.AWAITING_ATTEMPT,
                hint_level=0,
                attempt_count=0,
                consecutive_incorrect_count=0,
                answer_requested=False,
                persist_state=True,
                offer_quick_check=False,
                reason="concept_core_and_self_check",
                pending_question=None,
                state_version_expected=state_version,
            )
        if classification.intent == TeachingIntent.EXERCISE:
            return TeachingTurnPlan(
                intent=classification.intent,
                state_intent=classification.intent,
                mode=TeachingTurnMode.HINT,
                previous_stage=previous_stage,
                next_stage=TeachingStage.AWAITING_ATTEMPT,
                hint_level=1,
                attempt_count=0,
                consecutive_incorrect_count=0,
                answer_requested=False,
                persist_state=True,
                offer_quick_check=False,
                reason="first_layer_hint",
                pending_question=None,
                state_version_expected=state_version,
            )
        return TeachingTurnPlan(
            intent=classification.intent,
            state_intent=classification.intent,
            mode=TeachingTurnMode.CLARIFY,
            previous_stage=previous_stage,
            next_stage=TeachingStage.CLARIFY_WAITING,
            hint_level=0,
            attempt_count=0,
            consecutive_incorrect_count=0,
            answer_requested=False,
            persist_state=True,
            offer_quick_check=False,
            reason="needs_clarification",
            pending_question=None,
            state_version_expected=state_version,
        )

    if previous_stage == TeachingStage.CLARIFY_WAITING:
        return TeachingTurnPlan(
            intent=classification.intent,
            state_intent=state_intent,
            mode=TeachingTurnMode.HINT,
            previous_stage=previous_stage,
            next_stage=TeachingStage.AWAITING_ATTEMPT,
            hint_level=1,
            attempt_count=attempt_count,
            consecutive_incorrect_count=0,
            answer_requested=answer_requested,
            persist_state=True,
            offer_quick_check=False,
            reason="clarification_received",
            pending_question=state.pending_question if state is not None else None,
            state_version_expected=state_version,
        )

    effective_assessment = assessment or AttemptAssessment.PARTIAL
    next_attempt_count = attempt_count + 1
    if effective_assessment == AttemptAssessment.CORRECT:
        return TeachingTurnPlan(
            intent=classification.intent,
            state_intent=state_intent,
            mode=TeachingTurnMode.EXPLAIN,
            previous_stage=previous_stage,
            next_stage=TeachingStage.READY_FOR_QUICK_CHECK,
            hint_level=hint_level,
            attempt_count=next_attempt_count,
            consecutive_incorrect_count=0,
            answer_requested=answer_requested,
            persist_state=True,
            offer_quick_check=True,
            reason="attempt_correct",
            pending_question=state.pending_question if state is not None else None,
            state_version_expected=state_version,
            assessment=effective_assessment,
        )

    next_incorrect_count = incorrect_count + (
        1 if effective_assessment == AttemptAssessment.INCORRECT else 0
    )
    if next_incorrect_count >= max(1, max_incorrect_attempts) or hint_level >= max(
        1, max_hint_levels
    ):
        return TeachingTurnPlan(
            intent=classification.intent,
            state_intent=state_intent,
            mode=TeachingTurnMode.EXPLAIN,
            previous_stage=previous_stage,
            next_stage=TeachingStage.READY_FOR_QUICK_CHECK,
            hint_level=hint_level,
            attempt_count=next_attempt_count,
            consecutive_incorrect_count=next_incorrect_count,
            answer_requested=answer_requested,
            persist_state=True,
            offer_quick_check=True,
            reason="attempt_limit_reached",
            pending_question=state.pending_question if state is not None else None,
            state_version_expected=state_version,
            assessment=effective_assessment,
        )
    return TeachingTurnPlan(
        intent=classification.intent,
        state_intent=state_intent,
        mode=TeachingTurnMode.HINT,
        previous_stage=previous_stage,
        next_stage=TeachingStage.AWAITING_ATTEMPT,
        hint_level=min(hint_level + 1, max(1, max_hint_levels)),
        attempt_count=next_attempt_count,
        consecutive_incorrect_count=next_incorrect_count,
        answer_requested=answer_requested,
        persist_state=True,
        offer_quick_check=False,
        reason="next_hint",
        pending_question=state.pending_question if state is not None else None,
        state_version_expected=state_version,
        assessment=effective_assessment,
    )


def build_teaching_stage_instruction(plan: TeachingTurnPlan) -> str:
    if plan.mode == TeachingTurnMode.NORMAL:
        return (
            "This is ordinary conversation or a non-course turn. Reply naturally and briefly. "
            "Do not force a course hint, quiz, or quick check."
        )
    if plan.mode == TeachingTurnMode.CONCEPT_CORE:
        return (
            "This is a concept-explanation turn. Lead with the key idea, give only a compact "
            "definition or core concept plus one or two essential points, and end with exactly "
            "one short self-check question. Do not provide a full worked solution for an "
            "exercise. Do not create a quick check yet."
        )
    if plan.mode == TeachingTurnMode.CLARIFY:
        return (
            "The question is ambiguous. Ask exactly one focused clarifying question. Do not "
            "explain the concept, give a hint, reveal an answer, or add a second question."
        )
    if plan.mode == TeachingTurnMode.HINT:
        return (
            f"This is hint level {plan.hint_level} of at most {MAX_TEACHING_HINT_LEVELS}. "
            "Guide the student's next thinking step only. Do not reveal the correct option, "
            "final answer, complete derivation, complete code, or conclusion. Do not include "
            "a quick check in this turn."
        )
    return (
        "The student has met the condition for a full scaffolded explanation. Lead with the "
        "key answer or idea, then explain in clear steps and state the final conclusion. Keep "
        "it concise and grounded in the course sources. A quick check may be shown after this "
        "response."
    )


def answer_leak_detected(answer: str, plan: TeachingTurnPlan) -> bool:
    if not plan.guards_against_answer_leak:
        return False
    normalized = answer.strip()
    return any(pattern.search(normalized) for pattern in ANSWER_LEAK_PATTERNS)


def fallback_teaching_answer(plan: TeachingTurnPlan) -> str:
    if plan.mode == TeachingTurnMode.CLARIFY:
        return "我还需要确认一下：你能补充题目、选项或具体想解决哪一步吗？"
    if plan.mode == TeachingTurnMode.HINT:
        if plan.hint_level <= 1:
            return "先不直接给答案。请先标出题干里的关键词，并说说它对应哪个课程概念。"
        return "先回头检查你的前一步：哪个条件或定义还没有用上？说说你的判断依据。"
    return "请先告诉我你目前的思路或卡住的地方，我会根据你的尝试继续提示。"


async def persist_teaching_plan(
    session: AsyncSession,
    *,
    plan: TeachingTurnPlan,
    state: ConversationTeachingState | None,
    conversation_id: UUID,
    topic_key: str,
    knowledge_point_id: UUID | None,
    question: str,
    user_message_id: UUID,
    assistant_message_id: UUID,
    quick_check_id: UUID | None,
) -> ConversationTeachingState | None:
    if not plan.persist_state:
        return state
    now = datetime.now(UTC)
    values = {
        "knowledge_point_id": knowledge_point_id,
        "intent": plan.state_intent,
        "stage": plan.next_stage,
        "hint_level": plan.hint_level,
        "attempt_count": plan.attempt_count,
        "consecutive_incorrect_count": plan.consecutive_incorrect_count,
        "answer_requested": plan.answer_requested,
        "pending_question": plan.pending_question or question,
        "last_user_message_id": user_message_id,
        "last_assistant_message_id": assistant_message_id,
        "quick_check_id": quick_check_id,
        "state_version": plan.state_version_expected + 1,
        "updated_at": now,
    }

    if state is None:
        state = ConversationTeachingState(
            conversation_id=conversation_id,
            topic_key=topic_key,
            **values,
        )
        state.state_version = 1
        session.add(state)
        try:
            await session.flush()
        except IntegrityError as exc:
            raise TeachingStateConflictError from exc
    else:
        result = await session.execute(
            update(ConversationTeachingState)
            .where(
                ConversationTeachingState.id == state.id,
                ConversationTeachingState.state_version == plan.state_version_expected,
            )
            .values(**values)
        )
        if result.rowcount != 1:
            raise TeachingStateConflictError
        await session.refresh(state)

    session.add(
        TeachingDialogEvent(
            state_id=state.id,
            message_id=assistant_message_id,
            from_stage=plan.previous_stage,
            to_stage=plan.next_stage,
            action=plan.mode.value,
            reason=plan.reason,
            metadata_json={
                "intent": plan.intent.value,
                "hint_level": plan.hint_level,
                "attempt_count": plan.attempt_count,
                "assessment": plan.assessment.value if plan.assessment else None,
            },
            created_at=now,
        )
    )
    return state
