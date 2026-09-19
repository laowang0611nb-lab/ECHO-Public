from datetime import UTC, datetime, time
from uuid import UUID, uuid4

from database.models.course import Course
from database.models.knowledge import KnowledgePoint
from database.models.learning import LearningEvent, LearningEventType
from database.models.planning import (
    ExecutionPlan,
    ExecutionPlanGeneration,
    ExecutionPlanGenerationStatus,
    ExecutionPlanStatus,
    ExecutionPlanWeek,
    PlanTargetScope,
    PlanTask,
    PlanTaskStatus,
    TeachingStrategy,
    TeachingStrategyStatus,
)
from database.models.user import User
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.schemas.planning import (
    CourseReference,
    ExecutionPlanActionRequest,
    ExecutionPlanCreateRequest,
    ExecutionPlanDetail,
    ExecutionPlanListItem,
    ExecutionPlanPage,
    ExecutionPlanUpdateRequest,
    ExecutionPlanWeekItem,
    KnowledgePointReference,
    PlanLearningEventItem,
    PlanLearningEventPage,
    PlanProgress,
    PlanStrategyReference,
    PlanTaskCompletion,
    PlanTaskItem,
    PlanTaskPage,
    PlanTaskUpdateRequest,
    StudentReference,
    WeeklyPlanGenerateRequest,
    WeeklyPlanGenerationDraft,
    WeeklyPlanGenerationResponse,
)
from app.services.chat_provider import ChatProvider
from app.services.plan_generation import generate_weekly_plan_draft
from app.services.plan_resources import (
    list_course_students,
    load_course_students,
    normalize_plan_action,
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
from app.services.teaching_strategy import (
    TeachingStrategyConflictError,
    TeachingStrategyNotFoundError,
    link_strategy_to_plan,
    set_strategy_status_from_plan,
)


class ExecutionPlanNotFoundError(Exception):
    pass


class ExecutionPlanConflictError(Exception):
    pass


async def list_execution_plans(
    session: AsyncSession,
    course_id: UUID,
    requester_id: UUID,
    *,
    strategy_id: UUID | None,
    status: ExecutionPlanStatus | None,
    cursor: str | None,
    limit: int,
) -> ExecutionPlanPage:
    await ensure_teacher(session, course_id, requester_id)
    filters = [ExecutionPlan.course_id == course_id]
    if strategy_id is not None:
        filters.append(ExecutionPlan.strategy_id == strategy_id)
    if status is not None:
        filters.append(ExecutionPlan.status == status)
    total = int(
        await session.scalar(select(func.count()).select_from(ExecutionPlan).where(*filters)) or 0
    )
    offset = decode_cursor(cursor)
    plans = list(
        await session.scalars(
            select(ExecutionPlan)
            .options(
                selectinload(ExecutionPlan.strategy),
                selectinload(ExecutionPlan.target_students),
                selectinload(ExecutionPlan.knowledge_points),
            )
            .where(*filters)
            .order_by(ExecutionPlan.updated_at.desc(), ExecutionPlan.id.desc())
            .offset(offset)
            .limit(limit)
        )
    )
    items = [await _plan_list_item(session, plan) for plan in plans]
    next_cursor = encode_cursor(offset + limit) if offset + limit < total else None
    return ExecutionPlanPage(items=items, total=total, next_cursor=next_cursor)


async def create_execution_plan(
    session: AsyncSession,
    course_id: UUID,
    requester_id: UUID,
    payload: ExecutionPlanCreateRequest,
) -> ExecutionPlanDetail:
    await ensure_teacher(session, course_id, requester_id)
    strategy = await session.scalar(
        select(TeachingStrategy)
        .options(
            selectinload(TeachingStrategy.target_knowledge_points),
            selectinload(TeachingStrategy.target_students),
        )
        .where(
            TeachingStrategy.id == payload.strategy_id,
            TeachingStrategy.course_id == course_id,
        )
    )
    if strategy is None:
        raise TeachingStrategyNotFoundError
    if strategy.status not in {
        TeachingStrategyStatus.ACCEPTED,
        TeachingStrategyStatus.PLANNED,
        TeachingStrategyStatus.ACTIVE,
        TeachingStrategyStatus.PAUSED,
    }:
        raise TeachingStrategyConflictError("Teaching strategy must be accepted before planning")

    students = await load_course_students(
        session,
        course_id,
        payload.target_student_ids,
    )
    if payload.target_scope == PlanTargetScope.WHOLE_CLASS:
        students = []
    points = await load_course_knowledge_points(
        session,
        course_id,
        payload.knowledge_point_ids,
    )
    resources = await resolve_resource_references(
        session,
        course_id,
        payload.resource_ids,
    )

    plan = ExecutionPlan(
        course_id=course_id,
        strategy_id=strategy.id,
        title=payload.title,
        description=payload.description,
        status=ExecutionPlanStatus.ACTIVE if payload.publish else ExecutionPlanStatus.DRAFT,
        start_date=payload.start_date,
        end_date=payload.end_date,
        target_scope=payload.target_scope,
        actions=[action.value for action in payload.actions],
        plan_parameters=payload.plan_parameters,
        evaluation_metrics=payload.evaluation_metrics,
        resources_json=resource_json(resources),
        teacher_note=payload.teacher_note,
        created_by=requester_id,
        updated_by=requester_id,
    )
    plan.target_students = students
    plan.knowledge_points = points
    session.add(plan)
    await session.flush()
    await link_strategy_to_plan(
        session,
        strategy,
        requester_id,
        published=payload.publish,
    )
    await session.commit()
    return await get_execution_plan(session, plan.id, requester_id)


async def get_execution_plan(
    session: AsyncSession,
    plan_id: UUID,
    requester_id: UUID,
) -> ExecutionPlanDetail:
    plan = await _load_plan(session, plan_id)
    if plan is None:
        raise ExecutionPlanNotFoundError
    await ensure_teacher(session, plan.course_id, requester_id)
    return await _plan_detail(session, plan, requester_id)


async def update_execution_plan(
    session: AsyncSession,
    plan_id: UUID,
    requester_id: UUID,
    payload: ExecutionPlanUpdateRequest,
) -> ExecutionPlanDetail:
    plan = await _load_plan(session, plan_id)
    if plan is None:
        raise ExecutionPlanNotFoundError
    await ensure_teacher(session, plan.course_id, requester_id)
    if plan.status in {ExecutionPlanStatus.COMPLETED, ExecutionPlanStatus.CANCELLED}:
        raise ExecutionPlanConflictError("Completed or cancelled plans cannot be edited")

    if payload.title is not None:
        plan.title = payload.title
    if payload.description is not None:
        plan.description = payload.description
    if payload.start_date is not None:
        plan.start_date = payload.start_date
    if payload.end_date is not None:
        plan.end_date = payload.end_date
    if payload.target_scope is not None:
        plan.target_scope = payload.target_scope
    if payload.plan_parameters is not None:
        plan.plan_parameters = payload.plan_parameters
    if payload.evaluation_metrics is not None:
        plan.evaluation_metrics = payload.evaluation_metrics
    if payload.teacher_note is not None:
        plan.teacher_note = payload.teacher_note
    if payload.actions is not None:
        plan.actions = [action.value for action in payload.actions]
    if payload.target_student_ids is not None:
        plan.target_students = await load_course_students(
            session,
            plan.course_id,
            payload.target_student_ids,
        )
        if plan.target_scope == PlanTargetScope.WHOLE_CLASS:
            plan.target_students = []
    elif plan.target_scope == PlanTargetScope.WHOLE_CLASS:
        plan.target_students = []
    if payload.knowledge_point_ids is not None:
        plan.knowledge_points = await load_course_knowledge_points(
            session,
            plan.course_id,
            payload.knowledge_point_ids,
        )
    if plan.target_scope == PlanTargetScope.WHOLE_CLASS:
        plan.target_students = []
    elif not plan.target_students:
        raise ExecutionPlanConflictError("target_student_ids are required for group plans")
    if payload.resource_ids is not None:
        resources = await resolve_resource_references(
            session,
            plan.course_id,
            payload.resource_ids,
        )
        plan.resources_json = resource_json(resources)
    if plan.end_date < plan.start_date:
        raise ExecutionPlanConflictError("Plan end_date must not be before start_date")
    plan.updated_by = requester_id
    await session.commit()
    return await get_execution_plan(session, plan.id, requester_id)


async def apply_execution_plan_action(
    session: AsyncSession,
    plan_id: UUID,
    requester_id: UUID,
    payload: ExecutionPlanActionRequest,
) -> ExecutionPlanDetail:
    plan = await _load_plan(session, plan_id)
    if plan is None:
        raise ExecutionPlanNotFoundError
    await ensure_teacher(session, plan.course_id, requester_id)
    action = payload.action
    if action == "publish":
        if plan.status not in {ExecutionPlanStatus.DRAFT, ExecutionPlanStatus.READY}:
            raise ExecutionPlanConflictError("Only draft plans can be published")
        if not plan.tasks:
            raise ExecutionPlanConflictError(
                "Generate at least one weekly plan task before publishing"
            )
        plan.status = ExecutionPlanStatus.ACTIVE
        await link_strategy_to_plan(session, plan.strategy, requester_id, published=True)
    elif action == "pause":
        if plan.status != ExecutionPlanStatus.ACTIVE:
            raise ExecutionPlanConflictError("Only active plans can be paused")
        plan.status = ExecutionPlanStatus.PAUSED
        await set_strategy_status_from_plan(
            session,
            plan.strategy,
            requester_id,
            TeachingStrategyStatus.PAUSED,
        )
    elif action == "resume":
        if plan.status != ExecutionPlanStatus.PAUSED:
            raise ExecutionPlanConflictError("Only paused plans can be resumed")
        plan.status = ExecutionPlanStatus.ACTIVE
        await set_strategy_status_from_plan(
            session,
            plan.strategy,
            requester_id,
            TeachingStrategyStatus.ACTIVE,
        )
    elif action == "complete":
        if plan.status not in {ExecutionPlanStatus.ACTIVE, ExecutionPlanStatus.PAUSED}:
            raise ExecutionPlanConflictError("Only active or paused plans can be completed")
        plan.status = ExecutionPlanStatus.COMPLETED
        await set_strategy_status_from_plan(
            session,
            plan.strategy,
            requester_id,
            TeachingStrategyStatus.COMPLETED,
        )
    else:
        if plan.status in {ExecutionPlanStatus.COMPLETED, ExecutionPlanStatus.CANCELLED}:
            raise ExecutionPlanConflictError("Completed or cancelled plans cannot be cancelled")
        plan.status = ExecutionPlanStatus.CANCELLED
    plan.updated_by = requester_id
    await session.commit()
    return await get_execution_plan(session, plan.id, requester_id)


async def generate_weekly_plan(
    session: AsyncSession,
    provider: ChatProvider,
    plan_id: UUID,
    requester_id: UUID,
    payload: WeeklyPlanGenerateRequest,
) -> WeeklyPlanGenerationResponse:
    plan = await _load_plan(session, plan_id)
    if plan is None:
        raise ExecutionPlanNotFoundError
    await ensure_teacher(session, plan.course_id, requester_id)
    if plan.status not in {ExecutionPlanStatus.DRAFT, ExecutionPlanStatus.READY}:
        raise ExecutionPlanConflictError("Weekly plans can only be regenerated for draft plans")

    if not payload.regenerate:
        existing = await session.scalar(
            select(ExecutionPlanGeneration)
            .where(
                ExecutionPlanGeneration.plan_id == plan.id,
                ExecutionPlanGeneration.status == ExecutionPlanGenerationStatus.COMPLETED,
            )
            .order_by(ExecutionPlanGeneration.created_at.desc())
            .limit(1)
        )
        if existing is not None:
            return WeeklyPlanGenerationResponse.model_validate(existing.response_json)

    context = {
        "course_id": str(plan.course_id),
        "plan_id": str(plan.id),
        "title": plan.title,
        "description": plan.description,
        "start_date": plan.start_date.isoformat(),
        "end_date": plan.end_date.isoformat(),
        "target_scope": plan.target_scope.value,
        "target_student_ids": [str(student.id) for student in plan.target_students],
        "knowledge_point_ids": [str(point.id) for point in plan.knowledge_points],
        "resource_ids": [str(resource["id"]) for resource in plan.resources_json],
        "actions": plan.actions,
        "plan_parameters": plan.plan_parameters,
        "evaluation_metrics": plan.evaluation_metrics,
        "teacher_note": payload.teacher_note,
    }
    draft = await generate_weekly_plan_draft(provider, context)
    await _validate_generated_weeks(session, plan, draft)

    generation_id = uuid4()
    generation = ExecutionPlanGeneration(
        id=generation_id,
        plan_id=plan.id,
        status=ExecutionPlanGenerationStatus.COMPLETED,
        request_json=payload.model_dump(mode="json"),
        response_json={},
        created_by=requester_id,
        completed_at=datetime.now(UTC),
    )
    session.add(generation)
    await _cancel_existing_generated_tasks(session, plan)
    weeks: list[ExecutionPlanWeekItem] = []
    for week_draft in draft.weeks:
        week = await _upsert_week(session, plan, week_draft)
        week.knowledge_point_ids = [str(value) for value in week_draft.knowledge_point_ids]
        week.resources_json = [
            value.model_dump(mode="json")
            for value in await resolve_resource_references(
                session,
                plan.course_id,
                week_draft.resource_ids,
            )
        ]
        tasks: list[PlanTaskItem] = []
        for task_index, task_draft in enumerate(week_draft.tasks):
            due_at = task_draft.due_at or datetime.combine(
                week_draft.end_date,
                time.max,
                tzinfo=UTC,
            )
            task_points = await load_course_knowledge_points(
                session,
                plan.course_id,
                task_draft.knowledge_point_ids,
            )
            task_students = await _load_generated_task_students(
                session,
                plan,
                task_draft.target_student_ids,
            )
            task_resources = await resolve_resource_references(
                session,
                plan.course_id,
                task_draft.resource_ids,
            )
            task = PlanTask(
                plan_id=plan.id,
                week=week,
                week_number=week_draft.week_number,
                order_index=task_index,
                title=task_draft.title,
                description=task_draft.description,
                type=task_draft.type,
                status=PlanTaskStatus.NOT_STARTED,
                due_at=due_at,
                resources_json=resource_json(task_resources),
                created_by=requester_id,
            )
            task.knowledge_points = task_points
            task.target_students = task_students
            session.add(task)
            await session.flush()
            tasks.append(await _task_item(session, task, plan))
        weeks.append(
            ExecutionPlanWeekItem(
                id=week.id,
                week_number=week.week_number,
                start_date=week.start_date,
                end_date=week.end_date,
                content=week.content,
                knowledge_point_ids=[UUID(value) for value in week.knowledge_point_ids],
                resources=resource_references_from_json(week.resources_json),
                tasks=tasks,
            )
        )
    response = WeeklyPlanGenerationResponse(
        status="draft",
        generation_id=generation_id,
        weeks=weeks,
        recommendations=[
            {"id": item.id or uuid4(), "content": item.content, "status": "pending"}
            for item in draft.recommendations
        ],
    )
    generation.response_json = response.model_dump(mode="json")
    await session.commit()
    return response


async def list_plan_tasks(
    session: AsyncSession,
    plan_id: UUID,
    requester_id: UUID,
    *,
    status: PlanTaskStatus | None,
    week: int | None,
    cursor: str | None,
    limit: int,
) -> PlanTaskPage:
    plan = await _load_plan(session, plan_id)
    if plan is None:
        raise ExecutionPlanNotFoundError
    await ensure_teacher(session, plan.course_id, requester_id)
    await _refresh_overdue_tasks(session, plan.id)
    filters = [PlanTask.plan_id == plan.id]
    if status is not None:
        filters.append(PlanTask.status == status)
    if week is not None:
        filters.append(PlanTask.week_number == week)
    total = int(
        await session.scalar(select(func.count()).select_from(PlanTask).where(*filters)) or 0
    )
    offset = decode_cursor(cursor)
    tasks = list(
        await session.scalars(
            select(PlanTask)
            .options(
                selectinload(PlanTask.knowledge_points),
                selectinload(PlanTask.target_students),
            )
            .where(*filters)
            .order_by(PlanTask.week_number, PlanTask.order_index, PlanTask.id)
            .offset(offset)
            .limit(limit)
        )
    )
    items = [await _task_item(session, task, plan) for task in tasks]
    next_cursor = encode_cursor(offset + limit) if offset + limit < total else None
    return PlanTaskPage(items=items, total=total, next_cursor=next_cursor)


async def update_plan_task(
    session: AsyncSession,
    task_id: UUID,
    requester_id: UUID,
    payload: PlanTaskUpdateRequest,
) -> PlanTaskItem:
    task = await session.scalar(
        select(PlanTask)
        .options(
            selectinload(PlanTask.plan).selectinload(ExecutionPlan.target_students),
            selectinload(PlanTask.knowledge_points),
            selectinload(PlanTask.target_students),
        )
        .where(PlanTask.id == task_id)
    )
    if task is None:
        raise ExecutionPlanNotFoundError
    plan = task.plan
    await ensure_teacher(session, plan.course_id, requester_id)
    if "title" in payload.model_fields_set and payload.title is not None:
        task.title = payload.title
    if "description" in payload.model_fields_set:
        task.description = payload.description or ""
    if "type" in payload.model_fields_set and payload.type is not None:
        task.type = payload.type
    if "status" in payload.model_fields_set and payload.status is not None:
        task.status = payload.status
    if "due_at" in payload.model_fields_set:
        task.due_at = payload.due_at
    if payload.knowledge_point_ids is not None:
        task.knowledge_points = await load_course_knowledge_points(
            session,
            plan.course_id,
            payload.knowledge_point_ids,
        )
    if payload.resource_ids is not None:
        task.resources_json = resource_json(
            await resolve_resource_references(
                session,
                plan.course_id,
                payload.resource_ids,
            )
        )
    if payload.target_student_ids is not None:
        task.target_students = await load_course_students(
            session,
            plan.course_id,
            payload.target_student_ids,
        )
    await session.commit()
    loaded = await session.scalar(
        select(PlanTask)
        .options(
            selectinload(PlanTask.plan).selectinload(ExecutionPlan.target_students),
            selectinload(PlanTask.knowledge_points),
            selectinload(PlanTask.target_students),
        )
        .where(PlanTask.id == task.id)
    )
    if loaded is None:
        raise ExecutionPlanNotFoundError
    return await _task_item(session, loaded, loaded.plan)


async def list_plan_learning_events(
    session: AsyncSession,
    plan_id: UUID,
    requester_id: UUID,
    *,
    student_id: UUID | None,
    task_id: UUID | None,
    knowledge_point_id: UUID | None,
    event_type: LearningEventType | None,
    cursor: str | None,
    limit: int,
) -> PlanLearningEventPage:
    plan = await _load_plan(session, plan_id)
    if plan is None:
        raise ExecutionPlanNotFoundError
    await ensure_teacher(session, plan.course_id, requester_id)
    filters = [LearningEvent.plan_id == plan.id]
    if student_id is not None:
        filters.append(LearningEvent.user_id == student_id)
    if task_id is not None:
        filters.append(LearningEvent.task_id == task_id)
    if knowledge_point_id is not None:
        filters.append(LearningEvent.knowledge_point_id == knowledge_point_id)
    if event_type is not None:
        filters.append(LearningEvent.event_type == event_type)
    total = int(
        await session.scalar(select(func.count()).select_from(LearningEvent).where(*filters)) or 0
    )
    offset = decode_cursor(cursor)
    rows = await session.execute(
        select(LearningEvent, User, KnowledgePoint, PlanTask)
        .join(User, User.id == LearningEvent.user_id)
        .outerjoin(
            KnowledgePoint,
            KnowledgePoint.id == LearningEvent.knowledge_point_id,
        )
        .outerjoin(PlanTask, PlanTask.id == LearningEvent.task_id)
        .where(*filters)
        .order_by(LearningEvent.created_at.desc(), LearningEvent.id.desc())
        .offset(offset)
        .limit(limit)
    )
    items = [
        _learning_event_item(event, student, point, task)
        for event, student, point, task in rows.all()
    ]
    next_cursor = encode_cursor(offset + limit) if offset + limit < total else None
    return PlanLearningEventPage(items=items, total=total, next_cursor=next_cursor)


async def _load_plan(
    session: AsyncSession,
    plan_id: UUID,
) -> ExecutionPlan | None:
    return await session.scalar(
        select(ExecutionPlan)
        .options(
            selectinload(ExecutionPlan.strategy).selectinload(
                TeachingStrategy.target_knowledge_points
            ),
            selectinload(ExecutionPlan.strategy).selectinload(TeachingStrategy.target_students),
            selectinload(ExecutionPlan.target_students),
            selectinload(ExecutionPlan.knowledge_points),
            selectinload(ExecutionPlan.weeks)
            .selectinload(ExecutionPlanWeek.tasks)
            .selectinload(PlanTask.knowledge_points),
            selectinload(ExecutionPlan.weeks)
            .selectinload(ExecutionPlanWeek.tasks)
            .selectinload(PlanTask.target_students),
            selectinload(ExecutionPlan.tasks).selectinload(PlanTask.knowledge_points),
            selectinload(ExecutionPlan.tasks).selectinload(PlanTask.target_students),
        )
        .execution_options(populate_existing=True)
        .where(ExecutionPlan.id == plan_id)
    )


async def _plan_detail(
    session: AsyncSession,
    plan: ExecutionPlan,
    requester_id: UUID,
) -> ExecutionPlanDetail:
    course = await session.get(Course, plan.course_id)
    if course is None:
        raise TeacherContentNotFoundError
    target_students = plan.target_students or await list_course_students(session, plan.course_id)
    tasks = [await _task_item(session, task, plan) for task in plan.tasks]
    task_by_week: dict[int, list[PlanTaskItem]] = {}
    for task in tasks:
        task_by_week.setdefault(task.week_number, []).append(task)
    weeks = [
        ExecutionPlanWeekItem(
            id=week.id,
            week_number=week.week_number,
            start_date=week.start_date,
            end_date=week.end_date,
            content=week.content,
            knowledge_point_ids=[UUID(value) for value in week.knowledge_point_ids],
            resources=resource_references_from_json(week.resources_json),
            tasks=task_by_week.get(week.week_number, []),
        )
        for week in plan.weeks
    ]
    recent_events = await list_plan_learning_events(
        session,
        plan.id,
        requester_id=requester_id,
        student_id=None,
        task_id=None,
        knowledge_point_id=None,
        event_type=None,
        cursor=None,
        limit=5,
    )
    return ExecutionPlanDetail(
        id=plan.id,
        course=CourseReference(id=course.id, name=course.name),
        strategy=PlanStrategyReference(
            id=plan.strategy.id,
            title=plan.strategy.title,
            version=plan.strategy.version,
        ),
        title=plan.title,
        description=plan.description,
        status=plan.status,
        start_date=plan.start_date,
        end_date=plan.end_date,
        target_scope=plan.target_scope,
        target_students=_student_references(target_students),
        knowledge_points=_point_references(plan.knowledge_points),
        resources=resource_references_from_json(plan.resources_json),
        actions=[normalize_plan_action(value) for value in plan.actions],
        plan_parameters=plan.plan_parameters,
        evaluation_metrics=plan.evaluation_metrics,
        teacher_note=plan.teacher_note,
        progress=_progress(plan, tasks),
        weekly_plans=weeks,
        tasks=tasks,
        recent_learning_events=recent_events.items,
        effect_summary=None,
        created_at=plan.created_at,
        updated_at=plan.updated_at,
    )


async def _plan_list_item(
    session: AsyncSession,
    plan: ExecutionPlan,
) -> ExecutionPlanListItem:
    tasks = await session.scalars(
        select(PlanTask)
        .options(
            selectinload(PlanTask.knowledge_points),
            selectinload(PlanTask.target_students),
        )
        .where(PlanTask.plan_id == plan.id)
    )
    task_items = [await _task_item(session, task, plan) for task in tasks]
    return ExecutionPlanListItem(
        id=plan.id,
        course_id=plan.course_id,
        strategy=PlanStrategyReference(
            id=plan.strategy.id,
            title=plan.strategy.title,
            version=plan.strategy.version,
        ),
        title=plan.title,
        description=plan.description,
        status=plan.status,
        start_date=plan.start_date,
        end_date=plan.end_date,
        target_scope=plan.target_scope,
        target_student_count=(
            len(plan.target_students) or len(await list_course_students(session, plan.course_id))
        ),
        knowledge_point_count=len(plan.knowledge_points),
        task_count=len(task_items),
        progress=_progress(plan, task_items),
        updated_at=plan.updated_at,
    )


async def _task_item(
    session: AsyncSession,
    task: PlanTask,
    plan: ExecutionPlan | None = None,
) -> PlanTaskItem:
    course_id = plan.course_id if plan is not None else task.plan.course_id
    target_students = task.target_students or await list_course_students(
        session,
        course_id,
    )
    total = len(target_students)
    completed = int(
        await session.scalar(
            select(func.count(func.distinct(LearningEvent.user_id))).where(
                LearningEvent.task_id == task.id,
                LearningEvent.event_type.in_(
                    [
                        LearningEventType.QUIZ_CORRECT,
                        LearningEventType.RESOLVED,
                        LearningEventType.TEACHER_ADJUSTMENT,
                    ]
                ),
            )
        )
        or 0
    )
    if task.status == PlanTaskStatus.COMPLETED:
        completed = total
    return PlanTaskItem(
        id=task.id,
        plan_id=task.plan_id,
        week_number=task.week_number,
        title=task.title,
        description=task.description,
        type=task.type,
        status=task.status,
        due_at=task.due_at,
        knowledge_point_ids=[point.id for point in task.knowledge_points],
        resource_ids=[UUID(str(value["id"])) for value in task.resources_json if value.get("id")],
        resources=resource_references_from_json(task.resources_json),
        target_student_ids=[student.id for student in target_students],
        completion=PlanTaskCompletion(
            completed=min(completed, total),
            total=total,
        ),
    )


def _progress(plan: ExecutionPlan, tasks: list[PlanTaskItem]) -> PlanProgress:
    active_tasks = [task for task in tasks if task.status != PlanTaskStatus.CANCELLED]
    completed = sum(
        1
        for task in active_tasks
        if task.status == PlanTaskStatus.COMPLETED
        or (task.completion.total > 0 and task.completion.completed >= task.completion.total)
    )
    overdue = sum(1 for task in active_tasks if task.status == PlanTaskStatus.OVERDUE)
    total = len(active_tasks)
    today = datetime.now(UTC).date()
    current_week = None
    if today >= plan.start_date:
        current_week = min(
            max(1, (today - plan.start_date).days // 7 + 1),
            max(1, (plan.end_date - plan.start_date).days // 7 + 1),
        )
    return PlanProgress(
        percentage=round(completed * 100 / total) if total else 0,
        completed_tasks=completed,
        total_tasks=total,
        overdue_tasks=overdue,
        current_week=current_week,
    )


def _learning_event_item(
    event: LearningEvent,
    student: User,
    point: KnowledgePoint | None,
    task: PlanTask | None,
) -> PlanLearningEventItem:
    return PlanLearningEventItem(
        id=event.id,
        course_id=event.course_id,
        plan_id=event.plan_id or UUID(int=0),
        task_id=event.task_id,
        week_number=event.week_number or (task.week_number if task else None),
        student=StudentReference(id=student.id, display_name=student.display_name),
        knowledge_point=(KnowledgePointReference(id=point.id, name=point.name) if point else None),
        event_type=event.event_type,
        result=event.result,
        weight=event.weight,
        evidence=event.evidence,
        metadata_json=event.metadata_json,
        created_at=event.created_at,
    )


def _student_references(students) -> list[StudentReference]:
    return [
        StudentReference(id=student.id, display_name=student.display_name) for student in students
    ]


def _point_references(points) -> list[KnowledgePointReference]:
    return [KnowledgePointReference(id=point.id, name=point.name) for point in points]


async def _validate_generated_weeks(
    session: AsyncSession,
    plan: ExecutionPlan,
    draft: WeeklyPlanGenerationDraft,
) -> None:
    allowed_point_ids = {point.id for point in plan.knowledge_points}
    allowed_student_ids = {student.id for student in plan.target_students}
    for week in draft.weeks:
        if week.start_date < plan.start_date or week.end_date > plan.end_date:
            raise ExecutionPlanConflictError("Generated week falls outside the plan date range")
        for point_id in week.knowledge_point_ids:
            if allowed_point_ids and point_id not in allowed_point_ids:
                raise ExecutionPlanConflictError(
                    "Generated week references an outside knowledge point"
                )
        for task in week.tasks:
            for point_id in task.knowledge_point_ids:
                if allowed_point_ids and point_id not in allowed_point_ids:
                    raise ExecutionPlanConflictError(
                        "Generated task references an outside knowledge point"
                    )
            if plan.target_scope != PlanTargetScope.WHOLE_CLASS:
                for student_id in task.target_student_ids:
                    if student_id not in allowed_student_ids:
                        raise ExecutionPlanConflictError(
                            "Generated task references an outside target student"
                        )


async def _cancel_existing_generated_tasks(
    session: AsyncSession,
    plan: ExecutionPlan,
) -> None:
    await session.execute(
        update(PlanTask)
        .where(
            PlanTask.plan_id == plan.id,
            PlanTask.status != PlanTaskStatus.CANCELLED,
        )
        .values(status=PlanTaskStatus.CANCELLED)
        .execution_options(synchronize_session=False)
    )


async def _upsert_week(
    session: AsyncSession,
    plan: ExecutionPlan,
    draft,
) -> ExecutionPlanWeek:
    week = next(
        (item for item in plan.weeks if item.week_number == draft.week_number),
        None,
    )
    if week is None:
        week = ExecutionPlanWeek(
            plan_id=plan.id,
            week_number=draft.week_number,
            start_date=draft.start_date,
            end_date=draft.end_date,
            content=draft.content,
            knowledge_point_ids=[],
            resources_json=[],
        )
        session.add(week)
        await session.flush()
    else:
        week.start_date = draft.start_date
        week.end_date = draft.end_date
        week.content = draft.content
    return week


async def _load_generated_task_students(
    session: AsyncSession,
    plan: ExecutionPlan,
    student_ids: list[UUID],
) -> list:
    if student_ids:
        students = await load_course_students(session, plan.course_id, student_ids)
    elif plan.target_students:
        students = plan.target_students
    else:
        students = await list_course_students(session, plan.course_id)
    return students


async def _refresh_overdue_tasks(session: AsyncSession, plan_id: UUID) -> None:
    await session.execute(
        update(PlanTask)
        .where(
            PlanTask.plan_id == plan_id,
            PlanTask.due_at.is_not(None),
            PlanTask.due_at < datetime.now(UTC),
            PlanTask.status.in_([PlanTaskStatus.NOT_STARTED, PlanTaskStatus.IN_PROGRESS]),
        )
        .values(status=PlanTaskStatus.OVERDUE)
        .execution_options(synchronize_session=False)
    )
