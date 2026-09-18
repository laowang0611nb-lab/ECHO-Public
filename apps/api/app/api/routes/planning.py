from typing import Annotated
from uuid import UUID

from database.models.learning import LearningEventType
from database.models.planning import (
    ExecutionPlanStatus,
    PlanTaskStatus,
    TeachingStrategyPriority,
    TeachingStrategyStatus,
    TeachingStrategyType,
)
from fastapi import APIRouter, HTTPException, Query, status

from app.api.dependencies import ChatProviderDep, CurrentUser, DBSession
from app.schemas.planning import (
    ExecutionPlanActionRequest,
    ExecutionPlanCreateRequest,
    ExecutionPlanDetail,
    ExecutionPlanPage,
    ExecutionPlanUpdateRequest,
    PlanEffectResponse,
    PlanLearningEventPage,
    PlanTaskItem,
    PlanTaskPage,
    PlanTaskUpdateRequest,
    TeachingStrategyActionRequest,
    TeachingStrategyCreateRequest,
    TeachingStrategyDetail,
    TeachingStrategyGenerateRequest,
    TeachingStrategyPage,
    TeachingStrategyUpdateRequest,
    TeachingStrategyVersionItem,
    WeeklyPlanGenerateRequest,
    WeeklyPlanGenerationResponse,
)
from app.services.chat_provider import ChatConfigurationError, ChatProviderError
from app.services.execution_plan import (
    ExecutionPlanConflictError,
    ExecutionPlanNotFoundError,
    apply_execution_plan_action,
    create_execution_plan,
    generate_weekly_plan,
    get_execution_plan,
    list_execution_plans,
    list_plan_learning_events,
    list_plan_tasks,
    update_execution_plan,
    update_plan_task,
)
from app.services.plan_effects import get_plan_effect, get_strategy_effect
from app.services.plan_generation import PlanGenerationProviderError
from app.services.teacher_access import (
    TeacherContentForbiddenError,
    TeacherContentNotFoundError,
)
from app.services.teaching_strategy import (
    TeachingStrategyConflictError,
    TeachingStrategyNotFoundError,
    apply_teaching_strategy_action,
    create_teaching_strategy,
    generate_teaching_strategy,
    get_teaching_strategy,
    list_teaching_strategies,
    list_teaching_strategy_versions,
    update_teaching_strategy,
)

router = APIRouter(tags=["planning"])


def _translate(exc: Exception) -> HTTPException:
    if isinstance(
        exc,
        TeacherContentNotFoundError | TeachingStrategyNotFoundError | ExecutionPlanNotFoundError,
    ):
        return HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Planning resource not found",
        )
    if isinstance(exc, TeacherContentForbiddenError):
        return HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only course teachers can access planning resources",
        )
    if isinstance(exc, TeachingStrategyConflictError | ExecutionPlanConflictError):
        return HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc) or "Planning resource conflicts with existing state",
        )
    if isinstance(exc, ChatConfigurationError):
        return HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI planning provider is not configured",
        )
    if isinstance(exc, ChatProviderError | PlanGenerationProviderError):
        return HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI planning provider failed",
        )
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail="Planning resource operation conflicts with existing state",
    )


@router.get(
    "/courses/{course_id}/teaching-strategies",
    response_model=TeachingStrategyPage,
)
async def list_teaching_strategies_endpoint(
    course_id: UUID,
    current_user: CurrentUser,
    session: DBSession,
    strategy_status: Annotated[TeachingStrategyStatus | None, Query(alias="status")] = None,
    strategy_type: Annotated[TeachingStrategyType | None, Query(alias="type")] = None,
    priority: Annotated[TeachingStrategyPriority | None, Query()] = None,
    cursor: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
):
    try:
        return await list_teaching_strategies(
            session,
            course_id,
            current_user.id,
            status=strategy_status,
            strategy_type=strategy_type,
            priority=priority,
            cursor=cursor,
            limit=limit,
        )
    except (TeacherContentNotFoundError, TeacherContentForbiddenError) as exc:
        raise _translate(exc) from exc


@router.post(
    "/courses/{course_id}/teaching-strategies/generate",
    response_model=TeachingStrategyDetail,
    status_code=status.HTTP_201_CREATED,
)
async def generate_teaching_strategy_endpoint(
    course_id: UUID,
    payload: TeachingStrategyGenerateRequest,
    current_user: CurrentUser,
    session: DBSession,
    provider: ChatProviderDep,
):
    try:
        return await generate_teaching_strategy(
            session,
            provider,
            course_id,
            current_user.id,
            payload,
        )
    except (
        TeacherContentNotFoundError,
        TeacherContentForbiddenError,
        TeachingStrategyConflictError,
        ChatConfigurationError,
        ChatProviderError,
        PlanGenerationProviderError,
    ) as exc:
        raise _translate(exc) from exc


@router.post(
    "/courses/{course_id}/teaching-strategies",
    response_model=TeachingStrategyDetail,
    status_code=status.HTTP_201_CREATED,
)
async def create_teaching_strategy_endpoint(
    course_id: UUID,
    payload: TeachingStrategyCreateRequest,
    current_user: CurrentUser,
    session: DBSession,
):
    try:
        return await create_teaching_strategy(
            session,
            course_id,
            current_user.id,
            payload,
        )
    except (
        TeacherContentNotFoundError,
        TeacherContentForbiddenError,
        TeachingStrategyConflictError,
    ) as exc:
        raise _translate(exc) from exc


@router.get(
    "/teaching-strategies/{strategy_id}",
    response_model=TeachingStrategyDetail,
)
async def get_teaching_strategy_endpoint(
    strategy_id: UUID,
    current_user: CurrentUser,
    session: DBSession,
):
    try:
        return await get_teaching_strategy(session, strategy_id, current_user.id)
    except (
        TeacherContentNotFoundError,
        TeacherContentForbiddenError,
        TeachingStrategyNotFoundError,
    ) as exc:
        raise _translate(exc) from exc


@router.patch(
    "/teaching-strategies/{strategy_id}",
    response_model=TeachingStrategyDetail,
)
async def update_teaching_strategy_endpoint(
    strategy_id: UUID,
    payload: TeachingStrategyUpdateRequest,
    current_user: CurrentUser,
    session: DBSession,
):
    try:
        return await update_teaching_strategy(
            session,
            strategy_id,
            current_user.id,
            payload,
        )
    except (
        TeacherContentNotFoundError,
        TeacherContentForbiddenError,
        TeachingStrategyNotFoundError,
        TeachingStrategyConflictError,
    ) as exc:
        raise _translate(exc) from exc


@router.post(
    "/teaching-strategies/{strategy_id}/actions",
    response_model=TeachingStrategyDetail,
)
async def act_on_teaching_strategy_endpoint(
    strategy_id: UUID,
    payload: TeachingStrategyActionRequest,
    current_user: CurrentUser,
    session: DBSession,
):
    try:
        return await apply_teaching_strategy_action(
            session,
            strategy_id,
            current_user.id,
            payload,
        )
    except (
        TeacherContentNotFoundError,
        TeacherContentForbiddenError,
        TeachingStrategyNotFoundError,
        TeachingStrategyConflictError,
    ) as exc:
        raise _translate(exc) from exc


@router.get(
    "/teaching-strategies/{strategy_id}/versions",
    response_model=list[TeachingStrategyVersionItem],
)
async def list_teaching_strategy_versions_endpoint(
    strategy_id: UUID,
    current_user: CurrentUser,
    session: DBSession,
):
    try:
        return await list_teaching_strategy_versions(
            session,
            strategy_id,
            current_user.id,
        )
    except (
        TeacherContentNotFoundError,
        TeacherContentForbiddenError,
        TeachingStrategyNotFoundError,
    ) as exc:
        raise _translate(exc) from exc


@router.get(
    "/teaching-strategies/{strategy_id}/effect",
    response_model=PlanEffectResponse,
)
async def get_teaching_strategy_effect_endpoint(
    strategy_id: UUID,
    current_user: CurrentUser,
    session: DBSession,
):
    try:
        return await get_strategy_effect(session, strategy_id, current_user.id)
    except (
        TeacherContentNotFoundError,
        TeacherContentForbiddenError,
        TeachingStrategyNotFoundError,
    ) as exc:
        raise _translate(exc) from exc


@router.get(
    "/courses/{course_id}/execution-plans",
    response_model=ExecutionPlanPage,
)
async def list_execution_plans_endpoint(
    course_id: UUID,
    current_user: CurrentUser,
    session: DBSession,
    strategy_id: Annotated[UUID | None, Query(alias="strategyId")] = None,
    plan_status: Annotated[ExecutionPlanStatus | None, Query(alias="status")] = None,
    cursor: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
):
    try:
        return await list_execution_plans(
            session,
            course_id,
            current_user.id,
            strategy_id=strategy_id,
            status=plan_status,
            cursor=cursor,
            limit=limit,
        )
    except (TeacherContentNotFoundError, TeacherContentForbiddenError) as exc:
        raise _translate(exc) from exc


@router.post(
    "/courses/{course_id}/execution-plans",
    response_model=ExecutionPlanDetail,
    status_code=status.HTTP_201_CREATED,
)
async def create_execution_plan_endpoint(
    course_id: UUID,
    payload: ExecutionPlanCreateRequest,
    current_user: CurrentUser,
    session: DBSession,
):
    try:
        return await create_execution_plan(session, course_id, current_user.id, payload)
    except (
        TeacherContentNotFoundError,
        TeacherContentForbiddenError,
        TeachingStrategyNotFoundError,
        TeachingStrategyConflictError,
        ExecutionPlanConflictError,
    ) as exc:
        raise _translate(exc) from exc


@router.get(
    "/execution-plans/{plan_id}",
    response_model=ExecutionPlanDetail,
)
async def get_execution_plan_endpoint(
    plan_id: UUID,
    current_user: CurrentUser,
    session: DBSession,
):
    try:
        return await get_execution_plan(session, plan_id, current_user.id)
    except (
        TeacherContentNotFoundError,
        TeacherContentForbiddenError,
        ExecutionPlanNotFoundError,
    ) as exc:
        raise _translate(exc) from exc


@router.patch(
    "/execution-plans/{plan_id}",
    response_model=ExecutionPlanDetail,
)
async def update_execution_plan_endpoint(
    plan_id: UUID,
    payload: ExecutionPlanUpdateRequest,
    current_user: CurrentUser,
    session: DBSession,
):
    try:
        return await update_execution_plan(
            session,
            plan_id,
            current_user.id,
            payload,
        )
    except (
        TeacherContentNotFoundError,
        TeacherContentForbiddenError,
        ExecutionPlanNotFoundError,
        ExecutionPlanConflictError,
    ) as exc:
        raise _translate(exc) from exc


@router.post(
    "/execution-plans/{plan_id}/actions",
    response_model=ExecutionPlanDetail,
)
async def act_on_execution_plan_endpoint(
    plan_id: UUID,
    payload: ExecutionPlanActionRequest,
    current_user: CurrentUser,
    session: DBSession,
):
    try:
        return await apply_execution_plan_action(
            session,
            plan_id,
            current_user.id,
            payload,
        )
    except (
        TeacherContentNotFoundError,
        TeacherContentForbiddenError,
        ExecutionPlanNotFoundError,
        ExecutionPlanConflictError,
    ) as exc:
        raise _translate(exc) from exc


@router.post(
    "/execution-plans/{plan_id}/generate-weekly-plan",
    response_model=WeeklyPlanGenerationResponse,
)
async def generate_weekly_plan_endpoint(
    plan_id: UUID,
    payload: WeeklyPlanGenerateRequest,
    current_user: CurrentUser,
    session: DBSession,
    provider: ChatProviderDep,
):
    try:
        return await generate_weekly_plan(
            session,
            provider,
            plan_id,
            current_user.id,
            payload,
        )
    except (
        TeacherContentNotFoundError,
        TeacherContentForbiddenError,
        ExecutionPlanNotFoundError,
        ExecutionPlanConflictError,
        ChatConfigurationError,
        ChatProviderError,
        PlanGenerationProviderError,
    ) as exc:
        raise _translate(exc) from exc


@router.get(
    "/execution-plans/{plan_id}/tasks",
    response_model=PlanTaskPage,
)
async def list_plan_tasks_endpoint(
    plan_id: UUID,
    current_user: CurrentUser,
    session: DBSession,
    task_status: Annotated[PlanTaskStatus | None, Query(alias="status")] = None,
    week: Annotated[int | None, Query(ge=1)] = None,
    cursor: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
):
    try:
        return await list_plan_tasks(
            session,
            plan_id,
            current_user.id,
            status=task_status,
            week=week,
            cursor=cursor,
            limit=limit,
        )
    except (
        TeacherContentNotFoundError,
        TeacherContentForbiddenError,
        ExecutionPlanNotFoundError,
    ) as exc:
        raise _translate(exc) from exc


@router.patch(
    "/plan-tasks/{task_id}",
    response_model=PlanTaskItem,
)
async def update_plan_task_endpoint(
    task_id: UUID,
    payload: PlanTaskUpdateRequest,
    current_user: CurrentUser,
    session: DBSession,
):
    try:
        return await update_plan_task(session, task_id, current_user.id, payload)
    except (
        TeacherContentNotFoundError,
        TeacherContentForbiddenError,
        ExecutionPlanNotFoundError,
        ExecutionPlanConflictError,
    ) as exc:
        raise _translate(exc) from exc


@router.get(
    "/execution-plans/{plan_id}/learning-events",
    response_model=PlanLearningEventPage,
)
async def list_plan_learning_events_endpoint(
    plan_id: UUID,
    current_user: CurrentUser,
    session: DBSession,
    student_id: Annotated[UUID | None, Query(alias="studentId")] = None,
    task_id: Annotated[UUID | None, Query(alias="taskId")] = None,
    knowledge_point_id: Annotated[UUID | None, Query(alias="knowledgePointId")] = None,
    event_type: Annotated[LearningEventType | None, Query(alias="eventType")] = None,
    cursor: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
):
    try:
        return await list_plan_learning_events(
            session,
            plan_id,
            current_user.id,
            student_id=student_id,
            task_id=task_id,
            knowledge_point_id=knowledge_point_id,
            event_type=event_type,
            cursor=cursor,
            limit=limit,
        )
    except (
        TeacherContentNotFoundError,
        TeacherContentForbiddenError,
        ExecutionPlanNotFoundError,
    ) as exc:
        raise _translate(exc) from exc


@router.get(
    "/execution-plans/{plan_id}/effect",
    response_model=PlanEffectResponse,
)
async def get_execution_plan_effect_endpoint(
    plan_id: UUID,
    current_user: CurrentUser,
    session: DBSession,
):
    try:
        return await get_plan_effect(session, plan_id, current_user.id)
    except (
        TeacherContentNotFoundError,
        TeacherContentForbiddenError,
        ExecutionPlanNotFoundError,
    ) as exc:
        raise _translate(exc) from exc
