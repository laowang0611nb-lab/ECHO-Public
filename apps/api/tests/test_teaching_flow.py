from uuid import uuid4

from database.models.chat import (
    ConversationTeachingState,
    TeachingIntent,
    TeachingStage,
)

from app.services.teaching_flow import (
    AttemptAssessment,
    TeachingTurnClassification,
    TeachingTurnMode,
    answer_leak_detected,
    build_teaching_stage_instruction,
    build_topic_key,
    classify_teaching_turn_rules,
    plan_teaching_turn,
    select_teaching_state_for_turn,
)


def _state(**overrides: object) -> ConversationTeachingState:
    values: dict[str, object] = {
        "conversation_id": uuid4(),
        "knowledge_point_id": uuid4(),
        "topic_key": "kp:test",
        "intent": TeachingIntent.EXERCISE,
        "stage": TeachingStage.AWAITING_ATTEMPT,
        "hint_level": 1,
        "attempt_count": 0,
        "consecutive_incorrect_count": 0,
        "answer_requested": False,
        "state_version": 1,
    }
    values.update(overrides)
    return ConversationTeachingState(**values)


def test_chitchat_and_explicit_answer_requests_are_classified() -> None:
    chitchat = classify_teaching_turn_rules(
        "你好",
        current_state=None,
        has_knowledge_point=False,
    )
    answer_request = classify_teaching_turn_rules(
        "别提示了，直接告诉我答案",
        current_state=None,
        has_knowledge_point=True,
    )

    assert chitchat.intent == TeachingIntent.CHITCHAT
    assert answer_request.intent == TeachingIntent.ANSWER_REQUEST


def test_first_exercise_turn_only_issues_first_hint() -> None:
    classification = TeachingTurnClassification(TeachingIntent.EXERCISE)
    plan = plan_teaching_turn(classification=classification, state=None)
    instruction = build_teaching_stage_instruction(plan)

    assert plan.mode == TeachingTurnMode.HINT
    assert plan.hint_level == 1
    assert plan.next_stage == TeachingStage.AWAITING_ATTEMPT
    assert plan.offer_quick_check is False
    assert plan.guards_against_answer_leak is True
    assert "Lead with the key answer" not in instruction
    assert "Do not reveal the correct option" in instruction


def test_partial_attempt_advances_to_the_next_hint() -> None:
    state = _state()
    plan = plan_teaching_turn(
        classification=TeachingTurnClassification(TeachingIntent.ATTEMPT),
        state=state,
        assessment=AttemptAssessment.PARTIAL,
    )

    assert plan.mode == TeachingTurnMode.HINT
    assert plan.hint_level == 2
    assert plan.attempt_count == 1
    assert plan.offer_quick_check is False


def test_two_incorrect_attempts_trigger_scaffolded_explanation() -> None:
    state = _state(consecutive_incorrect_count=1)
    plan = plan_teaching_turn(
        classification=TeachingTurnClassification(TeachingIntent.ATTEMPT),
        state=state,
        assessment=AttemptAssessment.INCORRECT,
    )

    assert plan.mode == TeachingTurnMode.EXPLAIN
    assert plan.next_stage == TeachingStage.READY_FOR_QUICK_CHECK
    assert plan.offer_quick_check is True


def test_correct_attempt_reaches_quick_check() -> None:
    state = _state()
    plan = plan_teaching_turn(
        classification=TeachingTurnClassification(TeachingIntent.ATTEMPT),
        state=state,
        assessment=AttemptAssessment.CORRECT,
    )

    assert plan.mode == TeachingTurnMode.EXPLAIN
    assert plan.next_stage == TeachingStage.READY_FOR_QUICK_CHECK
    assert plan.offer_quick_check is True


def test_answer_leak_guard_catches_mcq_answer_but_not_guidance() -> None:
    plan = plan_teaching_turn(
        classification=TeachingTurnClassification(TeachingIntent.EXERCISE),
        state=None,
    )

    assert answer_leak_detected("答案：A", plan) is True
    assert answer_leak_detected("先判断题干中的关键词，再比较两个选项。", plan) is False


def test_active_follow_up_keeps_state_when_rag_resolves_another_point() -> None:
    state = _state()
    classification = TeachingTurnClassification(
        TeachingIntent.ATTEMPT,
        is_follow_up=True,
    )

    selected, topic = select_teaching_state_for_turn(
        latest_state=state,
        resolved_knowledge_point_id=uuid4(),
        classification=classification,
        question="我选 A",
    )

    assert selected is state
    assert topic == state.topic_key


def test_topic_keys_isolate_different_knowledge_points() -> None:
    first = build_topic_key(
        resolved_knowledge_point_id=uuid4(),
        question="同一个问题",
    )
    second = build_topic_key(
        resolved_knowledge_point_id=uuid4(),
        question="同一个问题",
    )

    assert first != second
    assert first.startswith("kp:")
