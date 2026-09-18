from datetime import UTC, datetime
from uuid import UUID

from database.models.course import Course
from database.models.knowledge import KnowledgePoint
from database.models.learning import LearningEvent, StudentKnowledgeState
from database.models.planning import (
    TeachingStrategy,
    TeachingStrategyHistoryAction,
    TeachingStrategyPriority,
    TeachingStrategySource,
    TeachingStrategyStatus,
    TeachingStrategyType,
    TeachingStrategyVersion,
)
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.schemas.planning import (
    CourseReference,
    ExpectedEffect,
    KnowledgePointReference,
    StrategyPlanReference,
    StudentReference,
    TeachingFlowStep,
    TeachingMethodWeight,
    TeachingStrategyActionRequest,
    TeachingStrategyCreateRequest,
    TeachingStrategyDetail,
    TeachingStrategyEvidence,
    TeachingStrategyGenerateRequest,
    TeachingStrategyListItem,
    TeachingStrategyPage,
    TeachingStrategyUpdateRequest,
    TeachingStrategyVersionItem,
)
from app.services.chat_provider import ChatProvider
from app.services.plan_generation import generate_strategy_draft
from app.services.plan_resources import (
    list_course_students,
    load_course_students,
    resolve_resource_references,
    resource_json,
    resource_references_from_json,
)
from app.services.teacher_access import (
    TeacherContentNotFoundError,
    decode_cursor,
    encode_cursor,
    ensure_teacher,
    load_course_knowledge_points,
)


class TeachingStrategyNotFoundError(Exception):
    pass


class TeachingStrategyConflictError(Exception):
    pass


async def list_teaching_strategies(
    session: AsyncSession,
    course_id: UUID,
    requester_id: UUID,
    *,
    status: TeachingStrategyStatus | None,
    strategy_type: TeachingStrategyType | None,
    priority: TeachingStrategyPriority | None,
    cursor: str | None,
    limit: int,
) -> TeachingStrategyPage:
    await ensure_teacher(session, course_id, requester_id)
    filters = [TeachingStrategy.course_id == course_id]
    if status is not None:
        filters.append(TeachingStrategy.status == status)
    if strategy_type is not None:
        filters.append(TeachingStrategy.type == strategy_type)
    if priority is not None:
        filters.append(TeachingStrategy.priority == priority)

    total = int(
        await session.scalar(select(func.count()).select_from(TeachingStrategy).where(*filters))
        or 0
    )
    offset = decode_cursor(cursor)
    strategies = list(
        await session.scalars(
            select(TeachingStrategy)
            .options(
                selectinload(TeachingStrategy.target_knowledge_points),
                selectinload(TeachingStrategy.target_students),
            )
            .where(*filters)
            .order_by(TeachingStrategy.updated_at.desc(), TeachingStrategy.id.desc())
            .offset(offset)
            .limit(limit)
        )
    )
    students = await list_course_students(session, course_id)
    items = [
        _strategy_list_item(strategy, default_student_count=len(students))
        for strategy in strategies
    ]
    next_cursor = encode_cursor(offset + limit) if offset + limit < total else None
    return TeachingStrategyPage(items=items, total=total, next_cursor=next_cursor)


async def generate_teaching_strategy(
    session: AsyncSession,
    provider: ChatProvider,
    course_id: UUID,
    requester_id: UUID,
    payload: TeachingStrategyGenerateRequest,
) -> TeachingStrategyDetail:
    await ensure_teacher(session, course_id, requester_id)
    course = await session.get(Course, course_id)
    if course is None:
        raise TeacherContentNotFoundError

    points = await _load_generation_points(session, course_id, payload.knowledge_point_ids)
    students = await _load_generation_students(session, course_id, payload.student_ids)
    context = {
        "course": {"id": str(course.id), "name": course.name},
        "knowledge_points": [{"id": str(point.id), "name": point.name} for point in points],
        "students": [
            {"id": str(student.id), "display_name": student.display_name}
            for student in students[:50]
        ],
        "insight_ids": payload.insight_ids,
        "time_range_days": payload.time_range_days,
        "generated_at": datetime.now(UTC).isoformat(),
    }
    draft = await generate_strategy_draft(provider, context)

    strategy = TeachingStrategy(
        course_id=course_id,
        title=draft.title,
        description=draft.description,
        type=draft.type,
        priority=draft.priority,
        status=TeachingStrategyStatus.SUGGESTED,
        source=TeachingStrategySource.AI_GENERATED,
        version=1,
        goals=draft.goals,
        teaching_methods=[item.model_dump(mode="json") for item in draft.teaching_methods],
        teaching_flow=[item.model_dump(mode="json") for item in draft.teaching_flow],
        personalization_rules=draft.personalization_rules,
        ai_rules=draft.ai_rules,
        expected_effect=draft.expected_effect.model_dump(mode="json"),
        generated_context=context,
        resources_json=[],
        created_by=requester_id,
        updated_by=requester_id,
    )
    strategy.target_knowledge_points = points
    strategy.target_students = students if payload.student_ids else []
    session.add(strategy)
    await session.flush()
    _record_strategy_version(
        session,
        strategy,
        TeachingStrategyHistoryAction.GENERATED,
        requester_id,
        _strategy_snapshot(strategy),
        increment=False,
    )
    await session.commit()
    return await get_teaching_strategy(session, strategy.id, requester_id)


async def create_teaching_strategy(
    session: AsyncSession,
    course_id: UUID,
    requester_id: UUID,
    payload: TeachingStrategyCreateRequest,
) -> TeachingStrategyDetail:
    await ensure_teacher(session, course_id, requester_id)
    points = await load_course_knowledge_points(
        session,
        course_id,
        payload.target_knowledge_point_ids,
    )
    students = await load_course_students(session, course_id, payload.target_student_ids)
    resources = await resolve_resource_references(session, course_id, payload.resource_ids)
    strategy = TeachingStrategy(
        course_id=course_id,
        title=payload.title,
        description=payload.description,
        type=payload.type,
        priority=payload.priority,
        status=TeachingStrategyStatus.SUGGESTED,
        source=TeachingStrategySource.TEACHER_CREATED,
        version=1,
        goals=payload.goals,
        teaching_methods=[item.model_dump(mode="json") for item in payload.teaching_methods],
        teaching_flow=[item.model_dump(mode="json") for item in payload.teaching_flow],
        personalization_rules=payload.personalization_rules,
        ai_rules=payload.ai_rules,
        expected_effect=payload.expected_effect.model_dump(mode="json"),
        generated_context={},
        resources_json=resource_json(resources),
        created_by=requester_id,
        updated_by=requester_id,
    )
    strategy.target_knowledge_points = points
    strategy.target_students = students
    session.add(strategy)
    await session.flush()
    _record_strategy_version(
        session,
        strategy,
        TeachingStrategyHistoryAction.CREATED,
        requester_id,
        _strategy_snapshot(strategy),
        increment=False,
    )
    await session.commit()
    return await get_teaching_strategy(session, strategy.id, requester_id)


async def get_teaching_strategy(
    session: AsyncSession,
    strategy_id: UUID,
    requester_id: UUID,
) -> TeachingStrategyDetail:
    strategy = await _load_strategy(session, strategy_id)
    if strategy is None:
        raise TeachingStrategyNotFoundError
    await ensure_teacher(session, strategy.course_id, requester_id)
    return await _strategy_detail(session, strategy)


async def update_teaching_strategy(
    session: AsyncSession,
    strategy_id: UUID,
    requester_id: UUID,
    payload: TeachingStrategyUpdateRequest,
) -> TeachingStrategyDetail:
    strategy = await _load_strategy(session, strategy_id)
    if strategy is None:
        raise TeachingStrategyNotFoundError
    await ensure_teacher(session, strategy.course_id, requester_id)

    if payload.title is not None:
        strategy.title = payload.title
    if payload.description is not None:
        strategy.description = payload.description
    if payload.type is not None:
        strategy.type = payload.type
    if payload.priority is not None:
        strategy.priority = payload.priority
    if payload.goals is not None:
        strategy.goals = payload.goals
    if payload.teaching_methods is not None:
        strategy.teaching_methods = [
            item.model_dump(mode="json") for item in payload.teaching_methods
        ]
    if payload.teaching_flow is not None:
        strategy.teaching_flow = [item.model_dump(mode="json") for item in payload.teaching_flow]
    if payload.personalization_rules is not None:
        strategy.personalization_rules = payload.personalization_rules
    if payload.ai_rules is not None:
        strategy.ai_rules = payload.ai_rules
    if payload.expected_effect is not None:
        strategy.expected_effect = payload.expected_effect.model_dump(mode="json")
    if payload.target_knowledge_point_ids is not None:
        strategy.target_knowledge_points = await load_course_knowledge_points(
            session,
            strategy.course_id,
            payload.target_knowledge_point_ids,
        )
    if payload.target_student_ids is not None:
        strategy.target_students = await load_course_students(
            session,
            strategy.course_id,
            payload.target_student_ids,
        )
    if payload.resource_ids is not None:
        resources = await resolve_resource_references(
            session,
            strategy.course_id,
            payload.resource_ids,
        )
        strategy.resources_json = resource_json(resources)
    strategy.updated_by = requester_id
    _record_strategy_version(
        session,
        strategy,
        TeachingStrategyHistoryAction.UPDATED,
        requester_id,
        _strategy_snapshot(strategy),
    )
    await session.commit()
    return await get_teaching_strategy(session, strategy.id, requester_id)


async def apply_teaching_strategy_action(
    session: AsyncSession,
    strategy_id: UUID,
    requester_id: UUID,
    payload: TeachingStrategyActionRequest,
) -> TeachingStrategyDetail:
    strategy = await _load_strategy(session, strategy_id)
    if strategy is None:
        raise TeachingStrategyNotFoundError
    await ensure_teacher(session, strategy.course_id, requester_id)
    action = TeachingStrategyHistoryAction(payload.action)
    _apply_strategy_status(strategy, action)
    strategy.updated_by = requester_id
    _record_strategy_version(
        session,
        strategy,
        action,
        requester_id,
        _strategy_snapshot(strategy),
    )
    await session.commit()
    return await get_teaching_strategy(session, strategy.id, requester_id)


async def list_teaching_strategy_versions(
    session: AsyncSession,
    strategy_id: UUID,
    requester_id: UUID,
) -> list[TeachingStrategyVersionItem]:
    strategy = await _load_strategy(session, strategy_id)
    if strategy is None:
        raise TeachingStrategyNotFoundError
    await ensure_teacher(session, strategy.course_id, requester_id)
    return [_version_item(version) for version in strategy.versions]


async def link_strategy_to_plan(
    session: AsyncSession,
    strategy: TeachingStrategy,
    requester_id: UUID,
    *,
    published: bool,
) -> None:
    action = (
        TeachingStrategyHistoryAction.PLAN_PUBLISHED
        if published
        else TeachingStrategyHistoryAction.PLAN_CREATED
    )
    if published:
        strategy.status = TeachingStrategyStatus.ACTIVE
    elif strategy.status == TeachingStrategyStatus.ACCEPTED:
        strategy.status = TeachingStrategyStatus.PLANNED
    strategy.updated_by = requester_id
    _record_strategy_version(
        session,
        strategy,
        action,
        requester_id,
        _strategy_snapshot(strategy),
    )


async def set_strategy_status_from_plan(
    session: AsyncSession,
    strategy: TeachingStrategy,
    requester_id: UUID,
    status: TeachingStrategyStatus,
) -> None:
    if strategy.status == status:
        return
    action_by_status = {
        TeachingStrategyStatus.PAUSED: TeachingStrategyHistoryAction.PAUSE,
        TeachingStrategyStatus.ACTIVE: TeachingStrategyHistoryAction.RESUME,
        TeachingStrategyStatus.COMPLETED: TeachingStrategyHistoryAction.COMPLETE,
    }
    action = action_by_status.get(status)
    if action is None:
        raise TeachingStrategyConflictError("Unsupported strategy status transition")
    strategy.status = status
    strategy.updated_by = requester_id
    _record_strategy_version(
        session,
        strategy,
        action,
        requester_id,
        _strategy_snapshot(strategy),
    )


async def _load_strategy(
    session: AsyncSession,
    strategy_id: UUID,
) -> TeachingStrategy | None:
    return await session.scalar(
        select(TeachingStrategy)
        .options(
            selectinload(TeachingStrategy.target_knowledge_points),
            selectinload(TeachingStrategy.target_students),
            selectinload(TeachingStrategy.versions),
            selectinload(TeachingStrategy.plans),
        )
        .execution_options(populate_existing=True)
        .where(TeachingStrategy.id == strategy_id)
    )


async def _strategy_detail(
    session: AsyncSession,
    strategy: TeachingStrategy,
) -> TeachingStrategyDetail:
    course = await session.get(Course, strategy.course_id)
    if course is None:
        raise TeacherContentNotFoundError
    target_students = strategy.target_students or await list_course_students(
        session,
        strategy.course_id,
    )
    plan_ids = [plan.id for plan in strategy.plans]
    learning_event_count = 0
    if plan_ids:
        learning_event_count = int(
            await session.scalar(
                select(func.count())
                .select_from(LearningEvent)
                .where(LearningEvent.plan_id.in_(plan_ids))
            )
            or 0
        )
    return TeachingStrategyDetail(
        id=strategy.id,
        course=CourseReference(id=course.id, name=course.name),
        title=strategy.title,
        description=strategy.description,
        type=strategy.type,
        priority=strategy.priority,
        status=strategy.status,
        source=strategy.source,
        version=strategy.version,
        goals=strategy.goals,
        teaching_methods=[
            TeachingMethodWeight.model_validate(value) for value in strategy.teaching_methods
        ],
        teaching_flow=[TeachingFlowStep.model_validate(value) for value in strategy.teaching_flow],
        personalization_rules=strategy.personalization_rules,
        ai_rules=strategy.ai_rules,
        target_knowledge_points=_point_references(strategy.target_knowledge_points),
        target_students=_student_references(target_students),
        resources=resource_references_from_json(strategy.resources_json),
        expected_effect=ExpectedEffect.model_validate(strategy.expected_effect),
        generated_context=strategy.generated_context,
        evidence=TeachingStrategyEvidence(
            learning_event_count=learning_event_count,
            knowledge_point_count=len(strategy.target_knowledge_points),
            student_count=len(target_students),
        ),
        linked_plans=[
            StrategyPlanReference(
                id=plan.id,
                title=plan.title,
                status=plan.status,
            )
            for plan in strategy.plans
        ],
        change_history=[_version_item(version) for version in strategy.versions],
        created_at=strategy.created_at,
        updated_at=strategy.updated_at,
    )


def _strategy_list_item(
    strategy: TeachingStrategy,
    *,
    default_student_count: int,
) -> TeachingStrategyListItem:
    return TeachingStrategyListItem(
        id=strategy.id,
        course_id=strategy.course_id,
        title=strategy.title,
        description=strategy.description,
        type=strategy.type,
        priority=strategy.priority,
        status=strategy.status,
        source=strategy.source,
        target_knowledge_points=_point_references(strategy.target_knowledge_points),
        target_student_count=(
            len(strategy.target_students) if strategy.target_students else default_student_count
        ),
        expected_effect=ExpectedEffect.model_validate(strategy.expected_effect),
        updated_at=strategy.updated_at,
    )


def _version_item(version: TeachingStrategyVersion) -> TeachingStrategyVersionItem:
    return TeachingStrategyVersionItem(
        id=version.id,
        strategy_id=version.strategy_id,
        version=version.version,
        action=version.action,
        status=TeachingStrategyStatus(version.snapshot_json.get("status")),
        snapshot=version.snapshot_json,
        changed_by=version.changed_by,
        created_at=version.created_at,
    )


def _point_references(points: list[KnowledgePoint]) -> list[KnowledgePointReference]:
    return [KnowledgePointReference(id=point.id, name=point.name) for point in points]


def _student_references(students) -> list[StudentReference]:
    return [
        StudentReference(id=student.id, display_name=student.display_name) for student in students
    ]


def _strategy_snapshot(strategy: TeachingStrategy) -> dict[str, object]:
    return {
        "id": str(strategy.id),
        "course_id": str(strategy.course_id),
        "title": strategy.title,
        "description": strategy.description,
        "type": strategy.type.value,
        "priority": strategy.priority.value,
        "status": strategy.status.value,
        "source": strategy.source.value,
        "version": strategy.version,
        "goals": strategy.goals,
        "teaching_methods": strategy.teaching_methods,
        "teaching_flow": strategy.teaching_flow,
        "personalization_rules": strategy.personalization_rules,
        "ai_rules": strategy.ai_rules,
        "target_knowledge_point_ids": [str(point.id) for point in strategy.target_knowledge_points],
        "target_student_ids": [str(student.id) for student in strategy.target_students],
        "resources": strategy.resources_json,
        "expected_effect": strategy.expected_effect,
        "generated_context": strategy.generated_context,
    }


def _record_strategy_version(
    session: AsyncSession,
    strategy: TeachingStrategy,
    action: TeachingStrategyHistoryAction,
    changed_by: UUID,
    snapshot: dict[str, object],
    *,
    increment: bool = True,
) -> None:
    if increment:
        strategy.version += 1
    snapshot = {**snapshot, "version": strategy.version}
    session.add(
        TeachingStrategyVersion(
            strategy_id=strategy.id,
            version=strategy.version,
            action=action,
            snapshot_json=snapshot,
            changed_by=changed_by,
        )
    )


def _apply_strategy_status(
    strategy: TeachingStrategy,
    action: TeachingStrategyHistoryAction,
) -> None:
    allowed: dict[TeachingStrategyHistoryAction, set[TeachingStrategyStatus]] = {
        TeachingStrategyHistoryAction.ACCEPT: {TeachingStrategyStatus.SUGGESTED},
        TeachingStrategyHistoryAction.DISMISS: {
            TeachingStrategyStatus.SUGGESTED,
            TeachingStrategyStatus.ACCEPTED,
            TeachingStrategyStatus.PLANNED,
            TeachingStrategyStatus.PAUSED,
        },
        TeachingStrategyHistoryAction.ACTIVATE: {
            TeachingStrategyStatus.ACCEPTED,
            TeachingStrategyStatus.PLANNED,
        },
        TeachingStrategyHistoryAction.PAUSE: {TeachingStrategyStatus.ACTIVE},
        TeachingStrategyHistoryAction.RESUME: {TeachingStrategyStatus.PAUSED},
        TeachingStrategyHistoryAction.COMPLETE: {
            TeachingStrategyStatus.ACTIVE,
            TeachingStrategyStatus.PAUSED,
            TeachingStrategyStatus.PLANNED,
        },
    }
    if strategy.status not in allowed[action]:
        raise TeachingStrategyConflictError(
            f"Strategy action {action.value} is not allowed from {strategy.status.value}"
        )
    strategy.status = {
        TeachingStrategyHistoryAction.ACCEPT: TeachingStrategyStatus.ACCEPTED,
        TeachingStrategyHistoryAction.DISMISS: TeachingStrategyStatus.DISMISSED,
        TeachingStrategyHistoryAction.ACTIVATE: TeachingStrategyStatus.ACTIVE,
        TeachingStrategyHistoryAction.PAUSE: TeachingStrategyStatus.PAUSED,
        TeachingStrategyHistoryAction.RESUME: TeachingStrategyStatus.ACTIVE,
        TeachingStrategyHistoryAction.COMPLETE: TeachingStrategyStatus.COMPLETED,
    }[action]


async def _load_generation_points(
    session: AsyncSession,
    course_id: UUID,
    point_ids: list[UUID],
) -> list[KnowledgePoint]:
    if point_ids:
        return await load_course_knowledge_points(session, course_id, point_ids)
    points = list(
        await session.scalars(
            select(KnowledgePoint)
            .outerjoin(
                StudentKnowledgeState,
                StudentKnowledgeState.knowledge_point_id == KnowledgePoint.id,
            )
            .where(
                KnowledgePoint.course_id == course_id,
                KnowledgePoint.trashed_at.is_(None),
            )
            .group_by(KnowledgePoint.id)
            .order_by(func.avg(StudentKnowledgeState.score).asc().nulls_last())
            .limit(5)
        )
    )
    return points


async def _load_generation_students(
    session: AsyncSession,
    course_id: UUID,
    student_ids: list[UUID],
) -> list:
    if student_ids:
        return await load_course_students(session, course_id, student_ids)
    return await list_course_students(session, course_id)
