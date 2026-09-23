from collections.abc import Iterable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from uuid import UUID

from database.models.analysis import (
    AIAnalysis,
    AIAnalysisEvidence,
    AIAnalysisEvidenceSource,
    AIAnalysisResult,
    AIAnalysisScope,
    AIAnalysisStatus,
    AIAnalysisType,
)
from database.models.chat import Conversation, Message, MessageCitation
from database.models.document import Document, DocumentStatus
from database.models.knowledge import Chapter, KnowledgeChunk, KnowledgePoint
from database.models.learning import (
    LearningEvent,
    MasterySnapshot,
    QuickCheckAttempt,
)
from database.models.planning import (
    TeachingStrategyPriority,
    TeachingStrategyType,
)
from database.models.review import AIReviewFlag
from database.models.user import User
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.schemas.analysis import (
    AIAnalysisCreateRequest,
    AIAnalysisDraft,
    AIAnalysisEvidenceResponse,
    AIAnalysisFactResponse,
    AIAnalysisListItem,
    AIAnalysisPage,
    AIAnalysisReanalyzeRequest,
    AIAnalysisResponse,
    AIAnalysisResultResponse,
    AIAnalysisStrategyRequest,
)
from app.schemas.planning import (
    ExpectedEffect,
    TeachingFlowStep,
    TeachingMethodWeight,
    TeachingStrategyCreateRequest,
)
from app.services.analysis_generation import (
    AIAnalysisProviderError,
    generate_analysis_draft,
)
from app.services.chat_provider import (
    ChatConfigurationError,
    ChatProvider,
    ChatProviderError,
)
from app.services.plan_resources import list_course_students, load_course_students
from app.services.teacher_access import (
    TeacherContentNotFoundError,
    decode_cursor,
    encode_cursor,
    ensure_teacher,
)
from app.services.teaching_strategy import (
    create_teaching_strategy,
    get_teaching_strategy,
)

MINIMUM_EVIDENCE_COUNT = 2
MAX_ANALYSIS_EVIDENCE = 120
MAX_MESSAGE_TEXT = 1000
MAX_SNAPSHOT_TEXT = 800


class AIAnalysisNotFoundError(Exception):
    pass


class AIAnalysisConflictError(Exception):
    pass


@dataclass(frozen=True)
class EvidenceDraft:
    source_type: AIAnalysisEvidenceSource
    source_id: UUID
    student_id: UUID | None
    knowledge_point_id: UUID | None
    label: str
    description: str | None
    snapshot_json: dict[str, object]


async def create_initial_analysis(
    session: AsyncSession,
    provider: ChatProvider,
    course_id: UUID,
    requester_id: UUID,
    payload: AIAnalysisCreateRequest,
) -> AIAnalysisResponse:
    await ensure_teacher(session, course_id, requester_id)
    point = await _load_knowledge_point(session, course_id, payload.knowledge_point_id)
    students = await _resolve_students(session, course_id, payload.scope, payload.student_ids)
    analysis = AIAnalysis(
        course_id=course_id,
        knowledge_point_id=point.id if point is not None else None,
        analysis_type=AIAnalysisType.INITIAL,
        scope=payload.scope,
        student_ids=[str(student.id) for student in students],
        time_range_days=payload.time_range_days,
        focus=_normalize_optional_text(payload.focus),
        status=AIAnalysisStatus.ANALYZING,
        created_by=requester_id,
        started_at=datetime.now(UTC),
    )
    session.add(analysis)
    await session.commit()
    await session.refresh(analysis)
    return await _execute_analysis(
        session,
        provider,
        analysis,
        point,
        students,
        requester_id,
    )


async def reanalyze(
    session: AsyncSession,
    provider: ChatProvider,
    course_id: UUID,
    analysis_id: UUID,
    requester_id: UUID,
    payload: AIAnalysisReanalyzeRequest,
) -> AIAnalysisResponse:
    await ensure_teacher(session, course_id, requester_id)
    previous = await _load_analysis(session, course_id, analysis_id)
    if previous.status != AIAnalysisStatus.COMPLETED or previous.result is None:
        raise AIAnalysisConflictError("Only completed analyses can be reanalyzed")
    if previous.analysis_type == AIAnalysisType.SECONDARY:
        raise AIAnalysisConflictError("A secondary analysis cannot be reanalyzed recursively")

    point = await _load_knowledge_point(session, course_id, previous.knowledge_point_id)
    previous_student_ids = _uuid_list(previous.student_ids)
    students = await _resolve_students(session, course_id, previous.scope, previous_student_ids)
    analysis = AIAnalysis(
        course_id=course_id,
        knowledge_point_id=point.id if point is not None else None,
        previous_analysis_id=previous.id,
        analysis_type=AIAnalysisType.SECONDARY,
        scope=previous.scope,
        student_ids=[str(student.id) for student in students],
        time_range_days=payload.time_range_days or previous.time_range_days,
        focus=_normalize_optional_text(payload.focus) or previous.focus,
        status=AIAnalysisStatus.ANALYZING,
        created_by=requester_id,
        started_at=datetime.now(UTC),
    )
    session.add(analysis)
    await session.commit()
    await session.refresh(analysis)
    return await _execute_analysis(
        session,
        provider,
        analysis,
        point,
        students,
        requester_id,
        previous=previous,
    )


async def get_analysis(
    session: AsyncSession,
    course_id: UUID,
    analysis_id: UUID,
    requester_id: UUID,
) -> AIAnalysisResponse:
    await ensure_teacher(session, course_id, requester_id)
    analysis = await _load_analysis(session, course_id, analysis_id)
    return _analysis_response(analysis)


async def get_analysis_result(
    session: AsyncSession,
    course_id: UUID,
    analysis_id: UUID,
    requester_id: UUID,
) -> AIAnalysisResultResponse:
    analysis = await get_analysis(session, course_id, analysis_id, requester_id)
    if analysis.result is None:
        raise AIAnalysisNotFoundError
    return analysis.result


async def list_analyses(
    session: AsyncSession,
    course_id: UUID,
    requester_id: UUID,
    *,
    cursor: str | None,
    limit: int,
    knowledge_point_id: UUID | None = None,
) -> AIAnalysisPage:
    await ensure_teacher(session, course_id, requester_id)
    filters = [AIAnalysis.course_id == course_id]
    if knowledge_point_id is not None:
        filters.append(AIAnalysis.knowledge_point_id == knowledge_point_id)
    total = int(
        await session.scalar(select(func.count()).select_from(AIAnalysis).where(*filters)) or 0
    )
    offset = decode_cursor(cursor)
    analyses = list(
        await session.scalars(
            select(AIAnalysis)
            .options(
                selectinload(AIAnalysis.result),
                selectinload(AIAnalysis.evidence),
            )
            .where(*filters)
            .order_by(AIAnalysis.created_at.desc(), AIAnalysis.id.desc())
            .offset(offset)
            .limit(limit)
        )
    )
    return AIAnalysisPage(
        items=[_analysis_list_item(item) for item in analyses],
        total=total,
        next_cursor=encode_cursor(offset + limit) if offset + limit < total else None,
    )


async def create_strategy_from_analysis(
    session: AsyncSession,
    course_id: UUID,
    analysis_id: UUID,
    requester_id: UUID,
    payload: AIAnalysisStrategyRequest,
):
    analysis = await _load_analysis(session, course_id, analysis_id)
    await ensure_teacher(session, course_id, requester_id)
    if analysis.result is None:
        raise AIAnalysisConflictError("Analysis result is not available")
    if analysis.result.insufficient_evidence:
        raise AIAnalysisConflictError("Insufficient evidence cannot create a teaching strategy")
    if analysis.result.strategy_id is not None:
        return await get_teaching_strategy(session, analysis.result.strategy_id, requester_id)

    result = analysis.result
    recommendation = result.recommendation.strip()
    if not recommendation:
        raise AIAnalysisConflictError("Analysis recommendation is empty")
    target_student_ids = (
        _uuid_list(analysis.student_ids) if analysis.scope != AIAnalysisScope.WHOLE_CLASS else []
    )
    strategy = await create_teaching_strategy(
        session,
        course_id,
        requester_id,
        TeachingStrategyCreateRequest(
            title=payload.title or "AI二次分析教学建议",
            description=payload.description or recommendation,
            type=payload.type or TeachingStrategyType.CONTENT_ADJUSTMENT,
            priority=payload.priority or TeachingStrategyPriority.MEDIUM,
            goals=[result.conclusion],
            teaching_methods=[TeachingMethodWeight(name="基于证据的针对性支持", weight=1.0)],
            teaching_flow=[
                TeachingFlowStep(
                    order=1,
                    title="实施二次分析建议",
                    description=recommendation,
                )
            ],
            personalization_rules=[
                str(fact.get("fact", "")) for fact in result.facts if fact.get("fact")
            ][:20],
            ai_rules=["保持结论与证据可追溯；教师确认后再采纳或发布。"],
            target_knowledge_point_ids=(
                [analysis.knowledge_point_id] if analysis.knowledge_point_id is not None else []
            ),
            target_student_ids=target_student_ids,
            expected_effect=ExpectedEffect(
                summary="效果需由后续计划执行与学习事件评估验证。",
                impact=None,
                metrics=[],
            ),
        ),
    )
    result.strategy_id = strategy.id
    await session.commit()
    return strategy


async def _execute_analysis(
    session: AsyncSession,
    provider: ChatProvider,
    analysis: AIAnalysis,
    point: KnowledgePoint | None,
    students: list[User],
    requester_id: UUID,
    *,
    previous: AIAnalysis | None = None,
) -> AIAnalysisResponse:
    evidence_drafts = await _collect_evidence(
        session,
        analysis,
        point,
        students,
        previous=previous,
    )
    session.add_all(
        [
            AIAnalysisEvidence(
                analysis_id=analysis.id,
                source_type=draft.source_type,
                source_id=draft.source_id,
                student_id=draft.student_id,
                knowledge_point_id=draft.knowledge_point_id,
                label=draft.label,
                description=draft.description,
                snapshot_json=draft.snapshot_json,
            )
            for draft in evidence_drafts
        ]
    )
    await session.commit()
    stored_evidence = list(
        await session.scalars(
            select(AIAnalysisEvidence)
            .where(AIAnalysisEvidence.analysis_id == analysis.id)
            .order_by(AIAnalysisEvidence.created_at, AIAnalysisEvidence.id)
        )
    )

    if len(stored_evidence) < MINIMUM_EVIDENCE_COUNT:
        draft = _insufficient_draft()
        return await _save_result(
            session,
            analysis.id,
            stored_evidence,
            draft,
            provider,
            requester_id,
        )

    context = _analysis_context(analysis, point, students, stored_evidence, previous)
    try:
        draft = await generate_analysis_draft(provider, context)
    except (ChatConfigurationError, ChatProviderError, AIAnalysisProviderError) as exc:
        await _mark_failed(session, analysis.id, exc)
        raise

    return await _save_result(
        session,
        analysis.id,
        stored_evidence,
        draft,
        provider,
        requester_id,
    )


async def _save_result(
    session: AsyncSession,
    analysis_id: UUID,
    evidence: list[AIAnalysisEvidence],
    draft: AIAnalysisDraft,
    provider: ChatProvider,
    requester_id: UUID,
) -> AIAnalysisResponse:
    analysis = await session.get(AIAnalysis, analysis_id)
    if analysis is None:
        raise AIAnalysisNotFoundError

    valid_evidence = {str(item.id): item for item in evidence}
    allowed_students = {str(value) for value in analysis.student_ids}
    facts: list[dict[str, object]] = []
    fact_evidence_ids: set[str] = set()
    for fact in draft.facts:
        valid_ids = [
            str(evidence_id)
            for evidence_id in fact.evidence_ids
            if str(evidence_id) in valid_evidence
        ]
        if not valid_ids:
            continue
        fact_evidence_ids.update(valid_ids)
        facts.append({"fact": fact.fact, "evidence_ids": valid_ids})

    affected_students = [
        str(student_id)
        for student_id in draft.affected_student_ids
        if str(student_id) in allowed_students
    ]
    insufficient = draft.insufficient_evidence or not facts
    if insufficient:
        conclusion = "现有证据不足，暂不能形成可靠的二次分析结论。"
        root_cause = "当前证据只支持局部观察，尚不足以确认完整的因果链。"
        recommendation = "建议补充课堂观察、Quick Check、学生对话或教师修正证据后重新分析。"
    else:
        conclusion = draft.conclusion
        root_cause = draft.root_cause
        recommendation = draft.recommendation

    result = AIAnalysisResult(
        analysis_id=analysis.id,
        conclusion=conclusion,
        root_cause=root_cause,
        recommendation=recommendation,
        affected_student_ids=affected_students,
        facts=facts,
        evidence_summary=[
            {
                "evidence_id": str(item.id),
                "source_type": item.source_type.value,
                "source_id": str(item.source_id),
                "student_id": str(item.student_id) if item.student_id else None,
                "label": item.label,
            }
            for item in evidence
        ],
        recommendation_payload={
            "source": "ai_secondary_analysis",
            "analysis_id": str(analysis.id),
            "root_cause": root_cause,
            "recommendation": recommendation,
            "requires_teacher_review": True,
            "evidence_ids": sorted(fact_evidence_ids),
        },
        insufficient_evidence=insufficient,
        model_name=getattr(provider, "model", None),
        generated_at=datetime.now(UTC),
    )
    session.add(result)
    analysis.status = AIAnalysisStatus.COMPLETED
    analysis.completed_at = datetime.now(UTC)
    analysis.error_message = None
    await session.commit()
    return await get_analysis(session, analysis.course_id, analysis.id, requester_id)


async def _mark_failed(
    session: AsyncSession,
    analysis_id: UUID,
    error: Exception,
) -> None:
    await session.rollback()
    analysis = await session.get(AIAnalysis, analysis_id)
    if analysis is None:
        return
    analysis.status = AIAnalysisStatus.FAILED
    analysis.error_message = str(error)[:2000]
    analysis.completed_at = datetime.now(UTC)
    await session.commit()


async def _load_knowledge_point(
    session: AsyncSession,
    course_id: UUID,
    knowledge_point_id: UUID | None,
) -> KnowledgePoint | None:
    if knowledge_point_id is None:
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
        )
    )
    if point is None:
        raise TeacherContentNotFoundError
    return point


async def _resolve_students(
    session: AsyncSession,
    course_id: UUID,
    scope: AIAnalysisScope,
    student_ids: list[UUID],
) -> list[User]:
    if scope == AIAnalysisScope.WHOLE_CLASS:
        return await list_course_students(session, course_id)
    return await load_course_students(session, course_id, student_ids)


async def _load_analysis(
    session: AsyncSession,
    course_id: UUID,
    analysis_id: UUID,
) -> AIAnalysis:
    analysis = await session.scalar(
        select(AIAnalysis)
        .options(
            selectinload(AIAnalysis.result),
            selectinload(AIAnalysis.evidence),
        )
        .where(AIAnalysis.id == analysis_id, AIAnalysis.course_id == course_id)
    )
    if analysis is None:
        raise AIAnalysisNotFoundError
    return analysis


async def _collect_evidence(
    session: AsyncSession,
    analysis: AIAnalysis,
    point: KnowledgePoint | None,
    students: list[User],
    *,
    previous: AIAnalysis | None,
) -> list[EvidenceDraft]:
    if not students:
        return []
    student_ids = [student.id for student in students]
    start = datetime.now(UTC) - timedelta(days=analysis.time_range_days)
    point_id = point.id if point is not None else None
    evidence: list[EvidenceDraft] = []
    seen: set[tuple[str, str, str]] = set()

    def add(draft: EvidenceDraft) -> None:
        key = (
            draft.source_type.value,
            str(draft.source_id),
            str(draft.student_id) if draft.student_id else "",
        )
        if key in seen or len(evidence) >= MAX_ANALYSIS_EVIDENCE:
            return
        seen.add(key)
        evidence.append(draft)

    if previous is not None and previous.result is not None:
        previous_result = previous.result
        add(
            EvidenceDraft(
                source_type=AIAnalysisEvidenceSource.INITIAL_ANALYSIS,
                source_id=previous.id,
                student_id=None,
                knowledge_point_id=previous.knowledge_point_id,
                label="初次分析结果",
                description=previous_result.conclusion,
                snapshot_json={
                    "conclusion": previous_result.conclusion,
                    "root_cause": previous_result.root_cause,
                    "recommendation": previous_result.recommendation,
                    "insufficient_evidence": previous_result.insufficient_evidence,
                    "facts": previous_result.facts,
                },
            )
        )

    event_query = (
        select(LearningEvent)
        .where(
            LearningEvent.course_id == analysis.course_id,
            LearningEvent.user_id.in_(student_ids),
            LearningEvent.created_at >= start,
        )
        .order_by(LearningEvent.created_at.desc(), LearningEvent.id.desc())
        .limit(200)
    )
    if point_id is not None:
        event_query = event_query.where(LearningEvent.knowledge_point_id == point_id)
    for event in await session.scalars(event_query):
        add(
            EvidenceDraft(
                source_type=AIAnalysisEvidenceSource.LEARNING_EVENT,
                source_id=event.id,
                student_id=event.user_id,
                knowledge_point_id=event.knowledge_point_id,
                label=f"学习事件：{event.event_type.value}",
                description=event.evidence,
                snapshot_json={
                    "event_type": event.event_type.value,
                    "weight": event.weight,
                    "evidence": _truncate(event.evidence, MAX_SNAPSHOT_TEXT),
                    "metadata": event.metadata_json,
                    "created_at": _iso(event.created_at),
                },
            )
        )

    snapshot_query = (
        select(MasterySnapshot)
        .where(
            MasterySnapshot.course_id == analysis.course_id,
            MasterySnapshot.user_id.in_(student_ids),
            MasterySnapshot.created_at >= start,
        )
        .order_by(MasterySnapshot.created_at.desc(), MasterySnapshot.id.desc())
        .limit(200)
    )
    if point_id is not None:
        snapshot_query = snapshot_query.where(MasterySnapshot.knowledge_point_id == point_id)
    for snapshot in await session.scalars(snapshot_query):
        add(
            EvidenceDraft(
                source_type=AIAnalysisEvidenceSource.MASTERY_SNAPSHOT,
                source_id=snapshot.id,
                student_id=snapshot.user_id,
                knowledge_point_id=snapshot.knowledge_point_id,
                label="掌握度快照",
                description=f"掌握度 {snapshot.score:.1f}",
                snapshot_json={
                    "score": snapshot.score,
                    "source_event_id": (
                        str(snapshot.source_event_id) if snapshot.source_event_id else None
                    ),
                    "created_at": _iso(snapshot.created_at),
                },
            )
        )

    attempt_query = (
        select(QuickCheckAttempt)
        .where(
            QuickCheckAttempt.course_id == analysis.course_id,
            QuickCheckAttempt.user_id.in_(student_ids),
            QuickCheckAttempt.created_at >= start,
        )
        .order_by(QuickCheckAttempt.created_at.desc(), QuickCheckAttempt.id.desc())
        .limit(200)
    )
    if point_id is not None:
        attempt_query = attempt_query.where(QuickCheckAttempt.knowledge_point_id == point_id)
    for attempt in await session.scalars(attempt_query):
        add(
            EvidenceDraft(
                source_type=AIAnalysisEvidenceSource.QUICK_CHECK_ATTEMPT,
                source_id=attempt.id,
                student_id=attempt.user_id,
                knowledge_point_id=attempt.knowledge_point_id,
                label="Quick Check 尝试",
                description="答对" if attempt.correct else "答错",
                snapshot_json={
                    "question_item_id": str(attempt.question_item_id),
                    "selected_option_id": attempt.selected_option_id,
                    "correct": attempt.correct,
                    "response": attempt.response_json,
                    "created_at": _iso(attempt.created_at),
                },
            )
        )

    if point_id is not None:
        message_query = (
            select(Message, Conversation)
            .join(Conversation, Conversation.id == Message.conversation_id)
            .join(LearningEvent, LearningEvent.message_id == Message.id)
            .where(
                Conversation.course_id == analysis.course_id,
                Conversation.user_id.in_(student_ids),
                LearningEvent.knowledge_point_id == point_id,
                Message.created_at >= start,
            )
            .distinct()
            .order_by(Message.created_at.desc(), Message.id.desc())
            .limit(50)
        )
    else:
        message_query = (
            select(Message, Conversation)
            .join(Conversation, Conversation.id == Message.conversation_id)
            .where(
                Conversation.course_id == analysis.course_id,
                Conversation.user_id.in_(student_ids),
                Message.created_at >= start,
            )
            .order_by(Message.created_at.desc(), Message.id.desc())
            .limit(50)
        )
    for message, conversation in await session.execute(message_query):
        add(
            EvidenceDraft(
                source_type=AIAnalysisEvidenceSource.CONVERSATION_MESSAGE,
                source_id=message.id,
                student_id=conversation.user_id,
                knowledge_point_id=point_id,
                label=f"对话消息：{message.role.value}",
                description=_truncate(message.content, MAX_MESSAGE_TEXT),
                snapshot_json={
                    "conversation_id": str(conversation.id),
                    "role": message.role.value,
                    "content": _truncate(message.content, MAX_MESSAGE_TEXT),
                    "created_at": _iso(message.created_at),
                },
            )
        )

    review_query = (
        select(AIReviewFlag)
        .where(
            AIReviewFlag.course_id == analysis.course_id,
            AIReviewFlag.student_id.in_(student_ids),
            AIReviewFlag.created_at >= start,
        )
        .order_by(AIReviewFlag.created_at.desc(), AIReviewFlag.id.desc())
        .limit(100)
    )
    if point_id is not None:
        review_query = review_query.join(
            LearningEvent,
            LearningEvent.message_id == AIReviewFlag.message_id,
        ).where(LearningEvent.knowledge_point_id == point_id)
    for flag in await session.scalars(review_query):
        add(
            EvidenceDraft(
                source_type=AIAnalysisEvidenceSource.REVIEW_FLAG,
                source_id=flag.id,
                student_id=flag.student_id,
                knowledge_point_id=point_id,
                label=f"AI审核：{flag.reason.value}",
                description=flag.details.get("summary") if flag.details else None,
                snapshot_json={
                    "reason": flag.reason.value,
                    "severity": flag.severity.value,
                    "status": flag.status.value,
                    "details": flag.details,
                    "teacher_note": flag.teacher_note,
                    "created_at": _iso(flag.created_at),
                },
            )
        )

    citation_query = (
        select(MessageCitation, Message, Conversation)
        .join(Message, Message.id == MessageCitation.message_id)
        .join(Conversation, Conversation.id == Message.conversation_id)
        .where(
            Conversation.course_id == analysis.course_id,
            Conversation.user_id.in_(student_ids),
            MessageCitation.created_at >= start,
        )
        .order_by(MessageCitation.created_at.desc(), MessageCitation.id.desc())
        .limit(100)
    )
    if point_id is not None:
        citation_query = citation_query.join(
            LearningEvent,
            LearningEvent.message_id == Message.id,
        ).where(LearningEvent.knowledge_point_id == point_id)
    for citation, _, conversation in await session.execute(citation_query):
        add(
            EvidenceDraft(
                source_type=AIAnalysisEvidenceSource.MESSAGE_CITATION,
                source_id=citation.id,
                student_id=conversation.user_id,
                knowledge_point_id=point_id,
                label="回答引用来源",
                description=citation.quote,
                snapshot_json={
                    "message_id": str(citation.message_id),
                    "document_id": str(citation.document_id) if citation.document_id else None,
                    "chunk_id": str(citation.chunk_id) if citation.chunk_id else None,
                    "page_start": citation.page_start,
                    "page_end": citation.page_end,
                    "document_name": citation.document_name,
                    "chapter_title": citation.chapter_title,
                    "quote": _truncate(citation.quote, MAX_SNAPSHOT_TEXT),
                    "created_at": _iso(citation.created_at),
                },
            )
        )

    chunk_query = (
        select(KnowledgeChunk)
        .join(Document, Document.id == KnowledgeChunk.document_id)
        .where(
            KnowledgeChunk.course_id == analysis.course_id,
            Document.status == DocumentStatus.READY,
            Document.trashed_at.is_(None),
        )
        .order_by(KnowledgeChunk.created_at.desc(), KnowledgeChunk.id.desc())
        .limit(20)
    )
    if point is not None:
        chunk_query = chunk_query.where(KnowledgeChunk.chapter_id == point.chapter_id)
    for chunk in await session.scalars(chunk_query):
        add(
            EvidenceDraft(
                source_type=AIAnalysisEvidenceSource.KNOWLEDGE_CHUNK,
                source_id=chunk.id,
                student_id=None,
                knowledge_point_id=point_id,
                label="课程资料片段",
                description=_truncate(chunk.content, MAX_SNAPSHOT_TEXT),
                snapshot_json={
                    "document_id": str(chunk.document_id),
                    "page_start": chunk.page_start,
                    "page_end": chunk.page_end,
                    "content": _truncate(chunk.content, MAX_SNAPSHOT_TEXT),
                    "created_at": _iso(chunk.created_at),
                },
            )
        )

    return evidence


def _analysis_context(
    analysis: AIAnalysis,
    point: KnowledgePoint | None,
    students: list[User],
    evidence: list[AIAnalysisEvidence],
    previous: AIAnalysis | None,
) -> dict[str, object]:
    return {
        "analysis": {
            "id": str(analysis.id),
            "type": analysis.analysis_type.value,
            "scope": analysis.scope.value,
            "time_range_days": analysis.time_range_days,
            "focus": analysis.focus,
            "knowledge_point": (
                {"id": str(point.id), "name": point.name} if point is not None else None
            ),
        },
        "students": [
            {"id": str(student.id), "display_name": student.display_name}
            for student in students[:200]
        ],
        "previous_analysis": (
            {
                "id": str(previous.id),
                "result": (previous.result.recommendation if previous.result is not None else None),
            }
            if previous is not None
            else None
        ),
        "evidence": [
            {
                "evidence_id": str(item.id),
                "source_type": item.source_type.value,
                "source_id": str(item.source_id),
                "student_id": str(item.student_id) if item.student_id else None,
                "knowledge_point_id": (
                    str(item.knowledge_point_id) if item.knowledge_point_id else None
                ),
                "label": item.label,
                "description": item.description,
                "snapshot": item.snapshot_json,
            }
            for item in evidence[:MAX_ANALYSIS_EVIDENCE]
        ],
    }


def _analysis_response(analysis: AIAnalysis) -> AIAnalysisResponse:
    return AIAnalysisResponse(
        id=analysis.id,
        course_id=analysis.course_id,
        knowledge_point_id=analysis.knowledge_point_id,
        previous_analysis_id=analysis.previous_analysis_id,
        analysis_type=analysis.analysis_type,
        scope=analysis.scope,
        student_ids=_uuid_list(analysis.student_ids),
        time_range_days=analysis.time_range_days,
        focus=analysis.focus,
        status=analysis.status,
        error_message=analysis.error_message,
        created_at=analysis.created_at,
        started_at=analysis.started_at,
        completed_at=analysis.completed_at,
        updated_at=analysis.updated_at,
        result=_result_response(analysis.result) if analysis.result is not None else None,
        evidence=[_evidence_response(item) for item in analysis.evidence],
    )


def _result_response(result: AIAnalysisResult) -> AIAnalysisResultResponse:
    return AIAnalysisResultResponse(
        conclusion=result.conclusion,
        root_cause=result.root_cause,
        recommendation=result.recommendation,
        affected_student_ids=_uuid_list(result.affected_student_ids),
        facts=[
            AIAnalysisFactResponse(
                fact=str(fact.get("fact", "")),
                evidence_ids=_uuid_list(fact.get("evidence_ids", [])),
            )
            for fact in result.facts
            if fact.get("fact")
        ],
        evidence_summary=result.evidence_summary,
        recommendation_payload=result.recommendation_payload,
        insufficient_evidence=result.insufficient_evidence,
        model_name=result.model_name,
        strategy_id=result.strategy_id,
        generated_at=result.generated_at,
    )


def _evidence_response(evidence: AIAnalysisEvidence) -> AIAnalysisEvidenceResponse:
    return AIAnalysisEvidenceResponse(
        id=evidence.id,
        source_type=evidence.source_type,
        source_id=evidence.source_id,
        student_id=evidence.student_id,
        knowledge_point_id=evidence.knowledge_point_id,
        label=evidence.label,
        description=evidence.description,
        snapshot=evidence.snapshot_json,
        created_at=evidence.created_at,
    )


def _analysis_list_item(analysis: AIAnalysis) -> AIAnalysisListItem:
    result = analysis.result
    return AIAnalysisListItem(
        id=analysis.id,
        course_id=analysis.course_id,
        knowledge_point_id=analysis.knowledge_point_id,
        analysis_type=analysis.analysis_type,
        scope=analysis.scope,
        status=analysis.status,
        student_count=len(_uuid_list(analysis.student_ids)),
        evidence_count=len(analysis.evidence),
        insufficient_evidence=bool(result and result.insufficient_evidence),
        conclusion=result.conclusion if result is not None else None,
        recommendation=result.recommendation if result is not None else None,
        created_at=analysis.created_at,
        completed_at=analysis.completed_at,
    )


def _insufficient_draft() -> AIAnalysisDraft:
    return AIAnalysisDraft(
        conclusion="现有证据不足，暂不能形成可靠的二次分析结论。",
        root_cause="当前窗口内可追溯的学习证据不足，无法确认完整原因。",
        recommendation="建议补充课堂观察、Quick Check、学生对话或教师修正证据后重新分析。",
        affected_student_ids=[],
        facts=[],
        insufficient_evidence=True,
    )


def _normalize_optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    return normalized or None


def _uuid_list(values: Iterable[object]) -> list[UUID]:
    result: list[UUID] = []
    for value in values:
        try:
            result.append(value if isinstance(value, UUID) else UUID(str(value)))
        except (TypeError, ValueError):
            continue
    return result


def _truncate(value: str | None, limit: int) -> str | None:
    if value is None:
        return None
    if len(value) <= limit:
        return value
    return value[:limit] + "…"


def _iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=UTC)
    return value.astimezone(UTC).isoformat()
