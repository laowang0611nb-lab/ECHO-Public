from __future__ import annotations

import hashlib
from datetime import datetime, timedelta
from typing import Any
from uuid import UUID, uuid5

from database.models.chat import MessageRole, MessageStatus
from database.models.learning import LearningEventType
from database.models.resource import QuestionDifficulty, QuestionType
from database.models.review import (
    ReviewGenerationStatus,
    ReviewHistoryAction,
    ReviewReason,
    ReviewSeverity,
    ReviewStatus,
    ReviewVersionSource,
)

CAUSAL_NAMESPACE = UUID("8daf25ba-8c98-4f27-b72f-68d1c78b9dd1")
TARGET_POINT_NAMES = ("边界值分析", "变更影响分析", "质量门禁")
TARGET_STUDENT_START = 32
TARGET_STUDENT_COUNT = 16
BASELINE_DAYS_AGO = 14
MIDPOINT_DAYS_AGO = 5
POST_DAYS_AGO = 1
NON_RESPONSE_CHAIN_INTERVAL = 7


def _id(kind: str, *parts: object) -> UUID:
    return uuid5(CAUSAL_NAMESPACE, f"{kind}:" + ":".join(str(part) for part in parts))


def _clamp(value: float) -> float:
    return round(max(0.0, min(100.0, value)), 2)


def _fraction(key: str) -> float:
    digest = hashlib.blake2b(key.encode("utf-8"), digest_size=8).digest()
    return int.from_bytes(digest, "big") / (2**64 - 1)


def _chain_design(
    *,
    chain_number: int,
    student_id: UUID,
    point_id: UUID,
    point_index: int,
) -> tuple[bool, float, float, str]:
    non_response = chain_number % NON_RESPONSE_CHAIN_INTERVAL in {2, 6}
    baseline_score = round(
        42.0
        + _fraction(f"baseline:{student_id}:{point_id}") * 15.0
        + point_index * 0.7,
        2,
    )
    if non_response:
        delta = round(-2.0 + _fraction(f"non-response:{student_id}:{point_id}") * 5.0, 2)
        return True, baseline_score, _clamp(baseline_score + delta), "not_improved"
    delta = round(12.0 + _fraction(f"response:{student_id}:{point_id}") * 11.0, 2)
    return False, baseline_score, _clamp(baseline_score + delta), "improved"


def _find_task_for_point(
    point_id: UUID,
    planning: dict[str, list[dict[str, Any]]],
) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    task_id = next(
        (
            row["task_id"]
            for row in planning["task_points"]
            if row["knowledge_point_id"] == point_id
        ),
        None,
    )
    task = next(
        (row for row in planning["tasks"] if row["id"] == task_id),
        None,
    )
    plan = (
        next((row for row in planning["plans"] if row["id"] == task["plan_id"]), None)
        if task is not None
        else None
    )
    return task, plan


def _find_chunk_for_point(
    point: dict[str, Any],
    chunks: list[dict[str, Any]],
) -> dict[str, Any]:
    chapter_chunks = [chunk for chunk in chunks if chunk["chapter_id"] == point["chapter_id"]]
    return (chapter_chunks or chunks)[0]


def _questions_for_point(
    course_id: UUID,
    teacher_id: UUID,
    point: dict[str, Any],
    document: dict[str, Any],
    chunk: dict[str, Any],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    point_name = str(point["name"])
    options = [
        {"id": "a", "label": "定义、边界输入和预期结果都明确"},
        {"id": "b", "label": "只要程序运行成功即可"},
        {"id": "c", "label": "由未参与需求讨论的人员独立猜测"},
        {"id": "d", "label": "在完成后一次性补写全部证据"},
    ]
    diagnostic_id = _id("question", point_name, "diagnostic")
    question = {
        "id": diagnostic_id,
        "course_id": course_id,
        "type": QuestionType.SINGLE_CHOICE,
        "difficulty": QuestionDifficulty.MEDIUM,
        "title": f"干预前诊断：{point_name}",
        "content": f"判断“{point_name}”是否真正掌握时，最可靠的依据是什么？",
        "answer": "a",
        "explanation": (
            f"{point['description']} 需要同时核对定义、边界输入、执行结果和可追溯证据。"
        ),
        "source_document_id": document["id"],
        "source_page": chunk["page_start"],
        "metadata_json": {
            "options": options,
            "causal_target": point_name,
            "assessment_phase": "pre_intervention_diagnostic",
        },
        "created_by": teacher_id,
        "trashed_at": None,
        "created_at": chunk["created_at"],
        "updated_at": chunk["created_at"],
    }
    diagnostic_link = {
        "question_item_id": diagnostic_id,
        "knowledge_point_id": point["id"],
    }
    transfer_options = [
        {
            "id": "a",
            "label": "按输入区间核对边界值、异常值、预期结果和回归证据",
        },
        {"id": "b", "label": "只复述概念，不再运行新场景"},
        {"id": "c", "label": "只观察一次正常流程是否报错"},
        {"id": "d", "label": "用多数同学的选择代替结果核对"},
    ]
    transfer_prompts = {
        "边界值分析": (
            "订单金额允许 0 到 1000 元。把同一套边界检查迁移到新功能时，"
            "哪组做法最能证明已经掌握？"
        ),
        "变更影响分析": (
            "需求新增“超时取消订单”后，哪组做法最能证明已正确分析变更影响？"
        ),
        "质量门禁": (
            "发布前增加自动质量门禁时，哪组做法最能证明门禁设计可执行？"
        ),
    }
    transfer_id = _id("question", point_name, "transfer")
    transfer_question = {
        "id": transfer_id,
        "course_id": course_id,
        "type": QuestionType.SINGLE_CHOICE,
        "difficulty": QuestionDifficulty.MEDIUM,
        "title": f"迁移验证：{point_name}",
        "content": transfer_prompts[point_name],
        "answer": "a",
        "explanation": (
            "需要把课程方法迁移到新场景，并保留输入、结果和回归依据，"
            "不能只复述定义或观察一次正常流程。"
        ),
        "source_document_id": document["id"],
        "source_page": chunk["page_start"],
        "metadata_json": {
            "options": transfer_options,
            "causal_target": point_name,
            "assessment_phase": "post_intervention_transfer",
        },
        "created_by": teacher_id,
        "trashed_at": None,
        "created_at": chunk["created_at"],
        "updated_at": chunk["created_at"],
    }
    transfer_link = {
        "question_item_id": transfer_id,
        "knowledge_point_id": point["id"],
    }
    return [question, transfer_question], [diagnostic_link, transfer_link]


def _cohort_summary() -> dict[str, Any]:
    not_improved = sum(
        1
        for point_index in range(len(TARGET_POINT_NAMES))
        for student_offset in range(TARGET_STUDENT_COUNT)
        if (point_index * TARGET_STUDENT_COUNT + student_offset) % NON_RESPONSE_CHAIN_INTERVAL
        in {2, 6}
    )
    total = TARGET_STUDENT_COUNT * len(TARGET_POINT_NAMES)
    return {
        "target_students": TARGET_STUDENT_COUNT,
        "class_students": 48,
        "target_group_coverage": f"{TARGET_STUDENT_COUNT}/{TARGET_STUDENT_COUNT}",
        "knowledge_points": list(TARGET_POINT_NAMES),
        "outcome_distribution": {
            "improved": total - not_improved,
            "not_improved": not_improved,
        },
    }


def _task_submission(outcome: str, occurred_at: datetime) -> dict[str, Any]:
    improved = outcome == "improved"
    return {
        "status": "completed" if improved else "partially_completed",
        "completion_rate": 1.0 if improved else 0.55,
        "submitted_steps": 4 if improved else 3,
        "required_steps": 4,
        "missing_steps": [] if improved else ["迁移题"],
        "recorded_at": occurred_at.isoformat(),
        "source": "plan_task_submission_log",
    }


def _message_rows(
    *,
    course_id: UUID,
    student_id: UUID,
    point: dict[str, Any],
    diagnostic_question: dict[str, Any],
    transfer_question: dict[str, Any],
    chunk: dict[str, Any],
    chain_id: UUID,
    task: dict[str, Any],
    plan: dict[str, Any],
    pre_score: float,
    post_score: float,
    correct_post: bool,
    baseline_time: datetime,
    intervention_time: datetime,
    post_time: datetime,
    outcome: str,
) -> tuple[dict[str, Any], list[dict[str, Any]], list[dict[str, Any]]]:
    point_name = str(point["name"])
    conversation_id = _id("conversation", chain_id)
    message_times = (
        baseline_time,
        baseline_time + timedelta(minutes=8),
        intervention_time,
        post_time,
    )
    if outcome == "improved":
        post_audit = (
            f"因果核验：前测诊断题答错，基线 {pre_score:.1f}；"
            f"计划“{plan['title']}”的任务“{task['title']}”完成率 100%；"
            "延迟迁移题答对；"
            f"掌握度 {post_score:.1f}，变化 {post_score - pre_score:+.1f}。"
            "教师审核确认：任务完整执行与迁移通过共同支持掌握提升，因果链闭合。"
        )
    else:
        post_audit = (
            f"因果核验：前测诊断题答错，基线 {pre_score:.1f}；"
            f"计划“{plan['title']}”的任务“{task['title']}”完成率 55%，迁移题未提交；"
            "延迟迁移题仍答错；"
            f"掌握度 {post_score:.1f}，变化 {post_score - pre_score:+.1f}。"
            "教师审核结论为任务完成不足导致未形成稳定迁移，继续干预，不能判定为已解决。"
        )
    message_contents = (
        (
            (
                f"我在“{point_name}”上总是判断错。前测题是“"
                f"{diagnostic_question['content']}”，我选了错误选项。"
            ),
            (
                f"解决“{point_name}”问题要先把输入边界、预期结果和证据链分开。"
                "课程材料强调可验证性与追踪关系 [1]。"
            ),
            (
                f"我执行了计划“{plan['title']}”中的任务“{task['title']}”，"
                "已完成 4/4 个步骤并提交专项练习、错误复盘和课程例子核对。"
                if outcome == "improved"
                else (
                    f"我执行了计划“{plan['title']}”中的任务“{task['title']}”，"
                    "但只完成 3/4 个步骤，迁移题没有提交。"
                )
            ),
            post_audit,
        )
    )
    conversation = {
        "id": conversation_id,
        "course_id": course_id,
        "user_id": student_id,
        "title": f"{point_name}因果复盘",
        "created_at": baseline_time,
        "updated_at": post_time,
    }
    messages: list[dict[str, Any]] = []
    citations: list[dict[str, Any]] = []
    options = transfer_question["metadata_json"]["options"]
    for index, (role, content, created_at) in enumerate(
        zip(
            (
                MessageRole.USER,
                MessageRole.ASSISTANT,
                MessageRole.USER,
                MessageRole.ASSISTANT,
            ),
            message_contents,
            message_times,
            strict=True,
        )
    ):
        message_id = _id("message", chain_id, index)
        blocks: list[dict[str, Any]]
        if role == MessageRole.USER:
            blocks = [{"type": "text", "text": content}]
        else:
            blocks = [{"type": "markdown", "markdown": content}]
            if index == 3:
                blocks.append(
                    {
                        "type": "quick_check",
                        "question_id": str(transfer_question["id"]),
                        "title": "干预后验证",
                        "prompt": transfer_question["content"],
                        "options": options,
                        "status": "correct" if correct_post else "wrong",
                        "selected_option_id": "a" if correct_post else "b",
                        "attempts_remaining": 0,
                        "correct": correct_post,
                        "explanation": transfer_question["explanation"],
                        "hint": "核对边界、预期结果和证据链。",
                    }
                )
        messages.append(
            {
                "id": message_id,
                "conversation_id": conversation_id,
                "client_request_id": f"causal-{chain_id}-{index}",
                "role": role,
                "status": MessageStatus.COMPLETE,
                "content": content,
                "blocks": blocks,
                "created_at": created_at,
            }
        )
        if role == MessageRole.ASSISTANT:
            citations.append(
                {
                    "id": _id("citation", message_id),
                    "message_id": message_id,
                    "citation_index": 1,
                    "chunk_id": chunk["id"],
                    "document_id": chunk["document_id"],
                    "page_start": chunk["page_start"],
                    "page_end": chunk["page_end"],
                    "document_name": "软件工程核心讲义.pdf",
                    "chapter_title": str(point["name"]),
                    "quote": str(chunk["content"])[:500],
                    "created_at": created_at,
                }
            )
    return conversation, messages, citations


def _causal_event(
    *,
    course_id: UUID,
    chain_id: UUID,
    student_id: UUID,
    point: dict[str, Any],
    conversation_id: UUID,
    message_id: UUID,
    event_type: LearningEventType,
    phase: str,
    evidence: str,
    created_at: datetime,
    task: dict[str, Any] | None,
    plan: dict[str, Any] | None,
    baseline_score: float,
    post_score: float,
    outcome: str,
) -> dict[str, Any]:
    return {
        "id": _id("event", chain_id, phase),
        "course_id": course_id,
        "user_id": student_id,
        "knowledge_point_id": point["id"],
        "conversation_id": conversation_id,
        "message_id": message_id,
        "plan_id": task["plan_id"] if task else None,
        "task_id": task["id"] if task else None,
        "week_number": task["week_number"] if task else None,
        "event_type": event_type,
        "weight": 1.0,
        "evidence": evidence,
        "metadata_json": {
            "causal_chain_id": str(chain_id),
            "phase": phase,
            "cohort": "target_group",
            "knowledge_point_name": point["name"],
            "baseline_score": baseline_score,
            "post_score": post_score,
            "delta": round(post_score - baseline_score, 2),
            "outcome": outcome,
            "cohort_summary": _cohort_summary(),
            "task_submission": _task_submission(outcome, created_at),
            "assessment_plan": {
                "pre_attempt_id": str(_id("attempt", chain_id, "pre")),
                "post_attempt_id": str(_id("attempt", chain_id, "post")),
                "post_assessment_kind": "delayed_transfer",
                "transfer_delay_hours": 144,
            },
            "evidence_refs": {
                "pre_snapshot_id": str(_id("snapshot", chain_id, "pre")),
                "mid_snapshot_id": str(_id("snapshot", chain_id, "mid")),
                "post_snapshot_id": str(_id("snapshot", chain_id, "post")),
            },
            "causal_sequence": [
                "baseline_problem",
                "intervention_execution",
                "post_check",
                "teacher_audit",
            ],
            "outcome_reason": (
                "计划任务完整执行，延迟迁移验证通过，掌握度提升"
                if outcome == "improved"
                else "计划任务完成不足且迁移题未提交，延迟迁移未通过，掌握度未提升"
            ),
            "plan_id": str(task["plan_id"]) if task else None,
            "task_id": str(task["id"]) if task else None,
            "cohort_size": 16,
            "class_total": 48,
            "target_group_coverage": "16/16",
            "task_status": "completed" if outcome == "improved" else "partially_completed",
            "completion_rate": 1.0 if outcome == "improved" else 0.55,
            "non_response_reason": (
                None if outcome == "improved" else "任务完成不足且迁移题未提交"
            ),
            "intervention_task_id": str(task["id"]) if task else None,
            "source": "targeted_intervention_evidence",
        },
        "created_at": created_at,
    }


def _snapshot_rows(
    *,
    course_id: UUID,
    chain_id: UUID,
    student_id: UUID,
    point: dict[str, Any],
    pre_event_id: UUID,
    mid_event_id: UUID,
    post_event_id: UUID,
    pre_score: float,
    post_score: float,
    now: datetime,
) -> list[dict[str, Any]]:
    midpoint = round(pre_score + (post_score - pre_score) * 0.55, 2)
    return [
        {
            "id": _id("snapshot", chain_id, "pre"),
            "course_id": course_id,
            "user_id": student_id,
            "knowledge_point_id": point["id"],
            "source_event_id": pre_event_id,
            "score": pre_score,
            "created_at": now - timedelta(days=BASELINE_DAYS_AGO),
        },
        {
            "id": _id("snapshot", chain_id, "mid"),
            "course_id": course_id,
            "user_id": student_id,
            "knowledge_point_id": point["id"],
            "source_event_id": mid_event_id,
            "score": midpoint,
            "created_at": now - timedelta(days=MIDPOINT_DAYS_AGO),
        },
        {
            "id": _id("snapshot", chain_id, "post"),
            "course_id": course_id,
            "user_id": student_id,
            "knowledge_point_id": point["id"],
            "source_event_id": post_event_id,
            "score": post_score,
            "created_at": now - timedelta(days=POST_DAYS_AGO),
        },
    ]


def _causal_review_rows(
    *,
    course_id: UUID,
    teacher_id: UUID,
    chain_id: UUID,
    student_id: UUID,
    point: dict[str, Any],
    message: dict[str, Any],
    citation: dict[str, Any],
    task: dict[str, Any],
    plan: dict[str, Any],
    diagnostic_question: dict[str, Any],
    transfer_question: dict[str, Any],
    pre_attempt_id: UUID,
    post_attempt_id: UUID,
    baseline_score: float,
    post_score: float,
    outcome: str,
    reviewed_at: datetime,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]]]:
    flag_id = _id("review", chain_id)
    improved = outcome == "improved"
    reason = (
        ReviewReason.MISSING_COURSE_BASIS
        if improved
        else ReviewReason.STUDENT_NOT_RESOLVED
    )
    severity = ReviewSeverity.LOW if improved else ReviewSeverity.HIGH
    review_status = (
        ReviewStatus.CONFIRMED_CORRECT if improved else ReviewStatus.PENDING_REREVIEW
    )
    generation_status = (
        ReviewGenerationStatus.IDLE
        if improved
        else ReviewGenerationStatus.COMPLETED
    )
    teacher_decision = (
        "confirmed_effect"
        if improved
        else "continue_intervention"
    )
    teacher_note = (
        (
            f"初始回答缺少课程依据；补充引用并完整执行计划“{plan['title']}”任务后，"
            f"前测 {baseline_score:.1f} 到后测 {post_score:.1f}，"
            "延迟迁移通过，教师终审确认因果链闭合。"
        )
        if improved
        else (
            f"学生仅完成计划“{plan['title']}”任务的 55%，迁移题未提交，"
            f"后测仍答错，掌握度由 {baseline_score:.1f} 到 {post_score:.1f}；"
            "教师终审标记仍需继续干预，未闭环。"
        )
    )
    details = {
        "summary": (
            f"目标组覆盖 16/16，班级共 48 人；该生结果为 {outcome}，"
            f"前测 {baseline_score:.1f}，后测 {post_score:.1f}，"
            f"变化 {post_score - baseline_score:+.1f}。"
        ),
        "review_scope": "cohort_causal_audit",
        "cohort_summary": _cohort_summary(),
        "reviewed_student_count": TARGET_STUDENT_COUNT,
        "target_group_coverage": f"{TARGET_STUDENT_COUNT}/{TARGET_STUDENT_COUNT}",
        "cause_status": "confirmed",
        "student_id": str(student_id),
        "knowledge_point_id": str(point["id"]),
        "knowledge_point_name": point["name"],
        "baseline_score": baseline_score,
        "post_score": post_score,
        "delta": round(post_score - baseline_score, 2),
        "outcome": outcome,
        "teacher_final_decision": teacher_decision,
        "task_submission": _task_submission(outcome, reviewed_at),
        "assessment_evidence": {
            "pre_attempt_id": str(pre_attempt_id),
            "post_attempt_id": str(post_attempt_id),
            "diagnostic_question_id": str(diagnostic_question["id"]),
            "transfer_question_id": str(transfer_question["id"]),
            "post_assessment_kind": "delayed_transfer",
        },
        "citation": {
            "document_id": str(citation["document_id"]),
            "chunk_id": str(citation["chunk_id"]),
            "page_start": citation["page_start"],
            "page_end": citation["page_end"],
        },
        "causal_chain_id": str(chain_id),
    }
    flag = {
        "id": flag_id,
        "course_id": course_id,
        "conversation_id": message["conversation_id"],
        "message_id": message["id"],
        "student_id": student_id,
        "reason": reason,
        "severity": severity,
        "status": review_status,
        "current_version": 1,
        "generation_status": generation_status,
        "generation_progress": 0 if improved else 100,
        "generation_error": None,
        "details": details,
        "teacher_note": teacher_note,
        "corrected_answer": None,
        "reviewed_by": teacher_id,
        "reviewed_at": reviewed_at,
        "created_at": message["created_at"],
        "updated_at": reviewed_at,
    }
    version = {
        "id": _id("review-version", flag_id, 1),
        "review_flag_id": flag_id,
        "version": 1,
        "answer": message["content"],
        "knowledge_point_ids": [str(point["id"])],
        "citations": [
            {
                "chunk_id": str(citation["chunk_id"]),
                "document_id": str(citation["document_id"]),
                "page_start": citation["page_start"],
                "page_end": citation["page_end"],
                "quote": citation["quote"],
            }
        ],
        "source": ReviewVersionSource.ORIGINAL,
        "instruction": None,
        "created_by": None,
        "created_at": message["created_at"],
    }
    history = {
        "id": _id("review-history", flag_id, 1),
        "review_flag_id": flag_id,
        "sequence": 1,
        "version": 1,
        "action": (
            ReviewHistoryAction.CONFIRM_CORRECT
            if improved
            else ReviewHistoryAction.MARK_INCORRECT
        ),
        "from_status": ReviewStatus.OPEN,
        "to_status": review_status,
        "teacher_id": teacher_id,
        "note": flag["teacher_note"],
        "answer_snapshot": message["content"],
        "corrected_answer_snapshot": None,
        "created_at": reviewed_at,
    }
    return [flag], [version], [history]


def upgrade_causal_evidence(
    *,
    course_id: UUID,
    teacher_id: UUID,
    students: list[dict[str, Any]],
    points: list[dict[str, Any]],
    documents: list[dict[str, Any]],
    chunks: list[dict[str, Any]],
    questions: list[dict[str, Any]],
    question_links: list[dict[str, Any]],
    conversations: list[dict[str, Any]],
    messages: list[dict[str, Any]],
    citations: list[dict[str, Any]],
    attempts: list[dict[str, Any]],
    events: list[dict[str, Any]],
    states: list[dict[str, Any]],
    snapshots: list[dict[str, Any]],
    planning: dict[str, list[dict[str, Any]]],
    reviews: dict[str, list[dict[str, Any]]],
    now: datetime,
) -> dict[str, Any]:
    target_students = students[TARGET_STUDENT_START : TARGET_STUDENT_START + TARGET_STUDENT_COUNT]
    point_by_name = {str(point["name"]): point for point in points}
    target_points = [point_by_name[name] for name in TARGET_POINT_NAMES]
    document = next(
        document for document in documents if document["resource_type"].value == "textbook"
    )
    state_by_key = {
        (state["user_id"], state["knowledge_point_id"]): state for state in states
    }
    target_student_ids = {student["id"] for student in target_students}
    target_point_ids = {point["id"] for point in target_points}
    snapshots[:] = [
        snapshot
        for snapshot in snapshots
        if not (
            snapshot["user_id"] in target_student_ids
            and snapshot["knowledge_point_id"] in target_point_ids
        )
    ]
    events[:] = [
        event
        for event in events
        if not (
            event["user_id"] in target_student_ids
            and event["knowledge_point_id"] in target_point_ids
        )
    ]

    for point in target_points:
        point_questions, point_links = _questions_for_point(
            course_id,
            teacher_id,
            point,
            document,
            _find_chunk_for_point(point, chunks),
        )
        questions.extend(point_questions)
        question_links.extend(point_links)

    diagnostic_question_by_point: dict[UUID, dict[str, Any]] = {}
    transfer_question_by_point: dict[UUID, dict[str, Any]] = {}
    for point in target_points:
        point_questions, _ = _questions_for_point(
            course_id,
            teacher_id,
            point,
            document,
            _find_chunk_for_point(point, chunks),
        )
        diagnostic_question_by_point[point["id"]] = point_questions[0]
        transfer_question_by_point[point["id"]] = point_questions[1]

    class_baseline_created = 0
    for student_index, student in enumerate(students):
        for point in target_points:
            state = state_by_key[(student["id"], point["id"])]
            if student in target_students:
                point_index = target_points.index(point)
                chain_number = point_index * len(target_students) + target_students.index(student)
                _, baseline_score, endpoint_score, _ = _chain_design(
                    chain_number=chain_number,
                    student_id=student["id"],
                    point_id=point["id"],
                    point_index=point_index,
                )
            else:
                baseline_score = _clamp(float(state["score"]))
                endpoint_score = _clamp(
                    baseline_score
                    + (
                        _fraction(f"class-stable:{student_index}:{point['id']}") - 0.5
                    )
                    * 3
                )
            state["score"] = endpoint_score
            chain_id = _id("class-baseline", student["id"], point["id"])
            snapshots.extend(
                [
                    {
                        "id": _id("snapshot", chain_id, "pre"),
                        "course_id": course_id,
                        "user_id": student["id"],
                        "knowledge_point_id": point["id"],
                        "source_event_id": None,
                        "score": baseline_score,
                        "created_at": now - timedelta(days=BASELINE_DAYS_AGO),
                    },
                    {
                        "id": _id("snapshot", chain_id, "post"),
                        "course_id": course_id,
                        "user_id": student["id"],
                        "knowledge_point_id": point["id"],
                        "source_event_id": None,
                        "score": endpoint_score,
                        "created_at": now - timedelta(days=POST_DAYS_AGO),
                    },
                ]
            )
            class_baseline_created += 2

    causal_chains: list[dict[str, Any]] = []
    plan_ids: set[UUID] = set()
    task_ids: set[UUID] = set()
    for point_index, point in enumerate(target_points):
        task, plan = _find_task_for_point(point["id"], planning)
        if task is None or plan is None:
            raise ValueError(f"No plan task is linked to causal point: {point['name']}")
        plan_ids.add(plan["id"])
        task_ids.add(task["id"])
        chunk = _find_chunk_for_point(point, chunks)
        diagnostic_question = diagnostic_question_by_point[point["id"]]
        transfer_question = transfer_question_by_point[point["id"]]
        representative_improved_offsets = {
            offset
            for offset in range(len(target_students))
            if not _chain_design(
                chain_number=point_index * len(target_students) + offset,
                student_id=target_students[offset]["id"],
                point_id=point["id"],
                point_index=point_index,
            )[0]
        }
        representative_improved_offsets = set(
            sorted(representative_improved_offsets)[:6]
        )
        for student_offset, student in enumerate(target_students):
            chain_number = point_index * len(target_students) + student_offset
            chain_id = _id("chain", student["id"], point["id"])
            non_response, baseline_score, post_score, outcome = _chain_design(
                chain_number=chain_number,
                student_id=student["id"],
                point_id=point["id"],
                point_index=point_index,
            )
            post_event_type = (
                LearningEventType.REPEATED_ERROR
                if non_response
                else LearningEventType.RESOLVED
            )
            state = state_by_key[(student["id"], point["id"])]
            state["score"] = post_score
            baseline_time = now - timedelta(days=BASELINE_DAYS_AGO, hours=student_offset % 6)
            intervention_time = now - timedelta(days=7, hours=student_offset % 5)
            post_time = now - timedelta(days=POST_DAYS_AGO, hours=student_offset % 4)
            conversation, chain_messages, chain_citations = _message_rows(
                course_id=course_id,
                student_id=student["id"],
                point=point,
                diagnostic_question=diagnostic_question,
                transfer_question=transfer_question,
                chunk=chunk,
                chain_id=chain_id,
                task=task,
                plan=plan,
                pre_score=baseline_score,
                post_score=post_score,
                correct_post=not non_response,
                baseline_time=baseline_time,
                intervention_time=intervention_time,
                post_time=post_time,
                outcome=outcome,
            )
            conversations.append(conversation)
            messages.extend(chain_messages)
            citations.extend(chain_citations)
            pre_attempt_id = _id("attempt", chain_id, "pre")
            post_attempt_id = _id("attempt", chain_id, "post")
            pre_attempt_time = baseline_time + timedelta(days=1)
            post_attempt_time = post_time - timedelta(hours=2)
            paired_response = {
                "schema": "causal-pre-post-transfer-v1",
                "phase": "paired_causal_verification",
                "causal_chain_id": str(chain_id),
                "cohort_summary": _cohort_summary(),
                "pre_intervention": {
                    "phase": "pre_intervention",
                    "attempt_id": str(pre_attempt_id),
                    "question_item_id": str(diagnostic_question["id"]),
                    "question": diagnostic_question["content"],
                    "selected_option_id": "b",
                    "correct": False,
                    "score": baseline_score,
                    "recorded_at": pre_attempt_time.isoformat(),
                },
                "intervention": {
                    "phase": "intervention_execution",
                    "plan_id": str(plan["id"]),
                    "task_id": str(task["id"]),
                    "week_number": task["week_number"],
                    "task_submission": _task_submission(outcome, intervention_time),
                },
                "post_intervention": {
                    "phase": "post_intervention",
                    "attempt_id": str(post_attempt_id),
                    "question_item_id": str(transfer_question["id"]),
                    "question": transfer_question["content"],
                    "selected_option_id": "a" if not non_response else "b",
                    "correct": not non_response,
                    "score": post_score,
                    "assessment_kind": "delayed_transfer",
                    "hours_after_intervention": 144,
                    "recorded_at": post_attempt_time.isoformat(),
                },
                "delta": round(post_score - baseline_score, 2),
                "outcome": outcome,
                "outcome_reason": (
                    "计划任务完整执行，延迟迁移通过，掌握度提升"
                    if outcome == "improved"
                    else "计划任务完成不足且迁移题未提交，延迟迁移未通过，掌握度未提升"
                ),
            }
            attempts.extend(
                [
                    {
                        "id": pre_attempt_id,
                        "course_id": course_id,
                        "user_id": student["id"],
                        "knowledge_point_id": point["id"],
                        "question_item_id": diagnostic_question["id"],
                        "conversation_id": conversation["id"],
                        "message_id": chain_messages[0]["id"],
                        "attempt_id": f"causal-{chain_id}-pre",
                        "selected_option_id": "b",
                        "correct": False,
                        "response_json": paired_response,
                        "created_at": pre_attempt_time,
                    },
                    {
                        "id": post_attempt_id,
                        "course_id": course_id,
                        "user_id": student["id"],
                        "knowledge_point_id": point["id"],
                        "question_item_id": transfer_question["id"],
                        "conversation_id": conversation["id"],
                        "message_id": chain_messages[3]["id"],
                        "attempt_id": f"causal-{chain_id}-post",
                        "selected_option_id": "a" if not non_response else "b",
                        "correct": not non_response,
                        "response_json": paired_response,
                        "created_at": post_attempt_time,
                    },
                ]
            )
            pre_event = _causal_event(
                course_id=course_id,
                chain_id=chain_id,
                student_id=student["id"],
                point=point,
                conversation_id=conversation["id"],
                message_id=chain_messages[0]["id"],
                event_type=LearningEventType.CONCEPT_CONFUSION,
                phase="baseline_problem",
                evidence=(
                    f"{student['display_name']}在“{point['name']}”的干预前诊断题中答错，"
                    f"基线掌握度 {baseline_score:.1f}，原因为定义、边界输入和预期结果混淆。"
                ),
                created_at=baseline_time,
                task=None,
                plan=None,
                baseline_score=baseline_score,
                post_score=post_score,
                outcome=outcome,
            )
            intervention_event = _causal_event(
                course_id=course_id,
                chain_id=chain_id,
                student_id=student["id"],
                point=point,
                conversation_id=conversation["id"],
                message_id=chain_messages[2]["id"],
                event_type=LearningEventType.HINT_REQUESTED,
                phase="intervention_execution",
                evidence=(
                    f"{student['display_name']}执行计划“{plan['title']}”任务“{task['title']}”："
                    + (
                        "完成 4/4 个步骤并提交专项练习、错误复盘和课程例子核对。"
                        if outcome == "improved"
                        else "仅完成 3/4 个步骤，迁移题未提交。"
                    )
                ),
                created_at=intervention_time,
                task=task,
                plan=plan,
                baseline_score=baseline_score,
                post_score=post_score,
                outcome=outcome,
            )
            check_event = _causal_event(
                course_id=course_id,
                chain_id=chain_id,
                student_id=student["id"],
                point=point,
                conversation_id=conversation["id"],
                message_id=chain_messages[3]["id"],
                event_type=(
                    LearningEventType.QUIZ_CORRECT
                    if not non_response
                    else LearningEventType.QUIZ_WRONG
                ),
                phase="post_check",
                evidence=(
                    f"{student['display_name']}在“{point['name']}”干预后 144 小时延迟迁移题中"
                    + ("答对" if not non_response else "仍答错")
                    + f"，掌握度 {baseline_score:.1f}→{post_score:.1f}"
                    + f"（{post_score - baseline_score:+.1f}）。"
                ),
                created_at=post_time - timedelta(hours=2),
                task=task,
                plan=plan,
                baseline_score=baseline_score,
                post_score=post_score,
                outcome=outcome,
            )
            resolution_time = post_time - timedelta(hours=1)
            resolution_event = _causal_event(
                course_id=course_id,
                chain_id=chain_id,
                student_id=student["id"],
                point=point,
                conversation_id=conversation["id"],
                message_id=chain_messages[3]["id"],
                event_type=post_event_type,
                phase="resolution" if not non_response else "unresolved_after_intervention",
                evidence=(
                    f"{student['display_name']}在“{point['name']}”干预后达到 "
                    f"{post_score:.1f}，较基线提升 {post_score - baseline_score:+.1f}。"
                    if not non_response
                    else (
                        f"{student['display_name']}在“{point['name']}”干预后仍未形成稳定迁移，"
                        "需要继续检查任务完成情况和边界条件。"
                    )
                ),
                created_at=resolution_time,
                task=task,
                plan=plan,
                baseline_score=baseline_score,
                post_score=post_score,
                outcome=outcome,
            )
            events.extend([pre_event, intervention_event, check_event, resolution_event])
            if chain_number % 8 == 0:
                events.append(
                    _causal_event(
                        course_id=course_id,
                        chain_id=chain_id,
                        student_id=student["id"],
                        point=point,
                        conversation_id=conversation["id"],
                        message_id=chain_messages[3]["id"],
                        event_type=LearningEventType.TEACHER_ADJUSTMENT,
                        phase="teacher_follow_up",
                        evidence=(
                            f"教师根据“{point['name']}”前后测差异记录后续辅导要求，"
                            "并保留原始基线与结果证据。"
                        ),
                        created_at=resolution_time + timedelta(minutes=10),
                        task=task,
                        plan=plan,
                        baseline_score=baseline_score,
                        post_score=post_score,
                        outcome=outcome,
                    )
                )
            snapshots.extend(
                _snapshot_rows(
                    course_id=course_id,
                    chain_id=chain_id,
                    student_id=student["id"],
                    point=point,
                    pre_event_id=pre_event["id"],
                    mid_event_id=intervention_event["id"],
                    post_event_id=resolution_event["id"],
                    pre_score=baseline_score,
                    post_score=post_score,
                    now=now,
                )
            )
            if non_response:
                reviewed_at = post_time + timedelta(minutes=40)
            elif student_offset in representative_improved_offsets:
                reviewed_at = post_time + timedelta(minutes=30)
            else:
                reviewed_at = post_time + timedelta(minutes=20)
            flags, versions, history = _causal_review_rows(
                course_id=course_id,
                teacher_id=teacher_id,
                chain_id=chain_id,
                student_id=student["id"],
                point=point,
                message=chain_messages[3],
                citation=chain_citations[1],
                task=task,
                plan=plan,
                diagnostic_question=diagnostic_question,
                transfer_question=transfer_question,
                pre_attempt_id=pre_attempt_id,
                post_attempt_id=post_attempt_id,
                baseline_score=baseline_score,
                post_score=post_score,
                outcome=outcome,
                reviewed_at=reviewed_at,
            )
            reviews["flags"].extend(flags)
            reviews["versions"].extend(versions)
            reviews["history"].extend(history)
            causal_chains.append(
                {
                    "causal_chain_id": str(chain_id),
                    "student_id": str(student["id"]),
                    "knowledge_point_id": str(point["id"]),
                    "knowledge_point_name": point["name"],
                    "baseline_score": baseline_score,
                    "post_score": post_score,
                    "delta": round(post_score - baseline_score, 2),
                    "outcome": outcome,
                    "plan_id": str(plan["id"]),
                    "task_id": str(task["id"]),
                    "pre_snapshot_id": str(_id("snapshot", chain_id, "pre")),
                    "mid_snapshot_id": str(_id("snapshot", chain_id, "mid")),
                    "post_snapshot_id": str(_id("snapshot", chain_id, "post")),
                    "conversation_id": str(conversation["id"]),
                    "pre_attempt_id": str(_id("attempt", chain_id, "pre")),
                    "post_attempt_id": str(_id("attempt", chain_id, "post")),
                    "pre_event_id": str(pre_event["id"]),
                    "intervention_event_id": str(intervention_event["id"]),
                    "post_event_id": str(resolution_event["id"]),
                    "review_flag_id": str(flags[0]["id"]),
                    "diagnostic_question_id": str(diagnostic_question["id"]),
                    "transfer_question_id": str(transfer_question["id"]),
                    "cohort_summary": _cohort_summary(),
                    "outcome_reason": (
                        "计划任务完整执行，延迟迁移通过，掌握度提升"
                        if outcome == "improved"
                        else "任务完成不足且迁移题未提交，延迟迁移未通过"
                    ),
                }
            )

    improved = [chain for chain in causal_chains if chain["outcome"] == "improved"]
    not_improved = [chain for chain in causal_chains if chain["outcome"] == "not_improved"]
    plan_linked_events = [
        event for event in events if event.get("plan_id") is not None and event.get("task_id") is not None
    ]
    return {
        "targetStudentIds": [str(student["id"]) for student in target_students],
        "targetKnowledgePointIds": [str(point["id"]) for point in target_points],
        "targetKnowledgePointNames": list(TARGET_POINT_NAMES),
        "targetStudentCount": len(target_students),
        "targetKnowledgePointCount": len(target_points),
        "causalChainCount": len(causal_chains),
        "classBaselineStudentPointPairs": len(students) * len(target_points),
        "classBaselineSnapshotCount": class_baseline_created,
        "improvedChainCount": len(improved),
        "notImprovedChainCount": len(not_improved),
        "planIds": [str(value) for value in sorted(plan_ids, key=str)],
        "taskIds": [str(value) for value in sorted(task_ids, key=str)],
        "planLinkedEventCount": len(plan_linked_events),
        "sourceCoverage": {
            "measuredKnowledgePointIds": [str(target_points[0]["id"])],
            "conversation": len(target_students) * len(target_points),
            "quickCheckAttempt": len(target_students) * len(target_points) * 2,
            "pairedCausalVerification": len(target_students) * len(target_points),
            "delayedTransferAssessment": len(target_students) * len(target_points),
            "learningEvent": len(target_students) * len(target_points) * 4,
            "reviewFlag": len(target_students) * len(target_points),
            "messageCitation": len(target_students) * len(target_points) * 2,
            "knowledgeChunk": len({str(point["chapter_id"]) for point in target_points}),
            "masterySnapshot": len(target_students) * len(target_points) * 3,
        },
        "cohortSummary": _cohort_summary(),
        "assessmentDesign": {
            "pre": "intervention_diagnostic",
            "post": "delayed_transfer",
            "transferDelayHours": 144,
            "evidenceWindowRecordsPerChain": 2,
        },
        "interventionWindow": {
            "baseline": (now - timedelta(days=BASELINE_DAYS_AGO)).isoformat(),
            "midpoint": (now - timedelta(days=MIDPOINT_DAYS_AGO)).isoformat(),
            "post": (now - timedelta(days=POST_DAYS_AGO)).isoformat(),
        },
        "chains": causal_chains,
    }
