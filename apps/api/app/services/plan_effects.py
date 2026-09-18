from datetime import UTC, datetime, time, timedelta
from uuid import UUID

from database.models.learning import (
    LearningEvent,
    LearningEventType,
    MasterySnapshot,
)
from database.models.planning import (
    ExecutionPlan,
    PlanTask,
)
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.schemas.planning import (
    PlanEffectMetric,
    PlanEffectResponse,
    PlanTaskEffectiveness,
)
from app.services.execution_plan import (
    ExecutionPlanNotFoundError,
    _load_plan,
)
from app.services.plan_resources import list_course_students
from app.services.teacher_access import ensure_teacher
from app.services.teaching_strategy import (
    TeachingStrategyNotFoundError,
    _load_strategy,
)


async def get_plan_effect(
    session: AsyncSession,
    plan_id: UUID,
    requester_id: UUID,
) -> PlanEffectResponse:
    plan = await _load_plan(session, plan_id)
    if plan is None:
        raise ExecutionPlanNotFoundError
    await ensure_teacher(session, plan.course_id, requester_id)
    return await _build_effect(session, [plan], strategy_id=plan.strategy_id, plan_id=plan.id)


async def get_strategy_effect(
    session: AsyncSession,
    strategy_id: UUID,
    requester_id: UUID,
) -> PlanEffectResponse:
    strategy = await _load_strategy(session, strategy_id)
    if strategy is None:
        raise TeachingStrategyNotFoundError
    await ensure_teacher(session, strategy.course_id, requester_id)
    plans = list(
        await session.scalars(
            select(ExecutionPlan)
            .options(
                selectinload(ExecutionPlan.target_students),
                selectinload(ExecutionPlan.knowledge_points),
                selectinload(ExecutionPlan.tasks).selectinload(PlanTask.knowledge_points),
                selectinload(ExecutionPlan.tasks).selectinload(PlanTask.target_students),
            )
            .where(ExecutionPlan.strategy_id == strategy.id)
            .order_by(ExecutionPlan.start_date, ExecutionPlan.id)
        )
    )
    return await _build_effect(
        session,
        plans,
        strategy_id=strategy.id,
        plan_id=None,
    )


async def _build_effect(
    session: AsyncSession,
    plans: list[ExecutionPlan],
    *,
    strategy_id: UUID,
    plan_id: UUID | None,
) -> PlanEffectResponse:
    if not plans:
        now = datetime.now(UTC)
        return PlanEffectResponse(
            plan_id=plan_id,
            strategy_id=strategy_id,
            period={
                "start": now - timedelta(days=28),
                "end": now,
            },
            metrics=[
                PlanEffectMetric(
                    metric="mastery_change",
                    label="目标学生平均掌握度",
                    before=None,
                    after=None,
                    delta=None,
                    sample_size=0,
                    source="mastery_snapshot",
                )
            ],
            task_effectiveness=[],
            remaining_issues=["暂无可评估的执行计划或学习证据。"],
            facts=["当前没有足够的已关联计划与掌握快照形成观察结论。"],
            ai_explanation=None,
            insufficient_evidence=True,
        )

    course_ids = {plan.course_id for plan in plans}
    start_date = min(plan.start_date for plan in plans)
    end_date = max(plan.end_date for plan in plans)
    start = datetime.combine(start_date, time.min, tzinfo=UTC)
    end = datetime.combine(end_date + timedelta(days=1), time.min, tzinfo=UTC)

    student_ids: set[UUID] = set()
    point_ids: set[UUID] = set()
    for plan in plans:
        plan_students = plan.target_students
        if not plan_students:
            plan_students = await list_course_students(session, plan.course_id)
        student_ids.update(student.id for student in plan_students)
        point_ids.update(point.id for point in plan.knowledge_points)

    snapshots = []
    if student_ids and point_ids:
        snapshots = list(
            await session.scalars(
                select(MasterySnapshot)
                .where(
                    MasterySnapshot.course_id.in_(course_ids),
                    MasterySnapshot.user_id.in_(student_ids),
                    MasterySnapshot.knowledge_point_id.in_(point_ids),
                    MasterySnapshot.created_at < end,
                )
                .order_by(MasterySnapshot.created_at, MasterySnapshot.id)
            )
        )

    before, after, delta, sample_size = _mastery_change(snapshots, start, end)
    plan_ids = [plan.id for plan in plans]
    event_count = int(
        await session.scalar(
            select(func.count())
            .select_from(LearningEvent)
            .where(LearningEvent.plan_id.in_(plan_ids))
        )
        or 0
    )
    task_effectiveness = await _task_effectiveness(session, plans, start, end)
    task_rate = (
        sum(item.completion_rate for item in task_effectiveness) / len(task_effectiveness)
        if task_effectiveness
        else None
    )
    insufficient = sample_size < 2 or event_count == 0
    facts: list[str] = []
    if sample_size:
        facts.append(
            f"观察期内目标学生平均掌握度从 {before:.2f} 变为 {after:.2f}，观察变化 {delta:+.2f}。"
        )
    else:
        facts.append("观察期内没有足够的成对掌握快照计算变化。")
    facts.append(f"观察期内关联 LearningEvent {event_count} 条。")
    if task_rate is not None:
        facts.append(f"计划任务平均完成率为 {task_rate:.0%}。")

    remaining_issues: list[str] = []
    if sample_size < 2:
        remaining_issues.append("掌握度样本不足，当前只能描述有限观察。")
    if event_count == 0:
        remaining_issues.append("尚无带 planId 的 LearningEvent，无法评估任务执行情况。")
    if task_rate is not None and task_rate < 0.6:
        remaining_issues.append("部分任务完成率偏低，建议教师检查执行障碍。")

    return PlanEffectResponse(
        plan_id=plan_id,
        strategy_id=strategy_id,
        period={"start": start, "end": end},
        metrics=[
            PlanEffectMetric(
                metric="mastery_change",
                label="目标学生平均掌握度",
                before=before,
                after=after,
                delta=delta,
                sample_size=sample_size,
                source="mastery_snapshot",
            ),
            PlanEffectMetric(
                metric="task_completion_rate",
                label="任务平均完成率",
                before=None,
                after=task_rate,
                delta=task_rate,
                sample_size=len(task_effectiveness),
                source="plan_task",
            ),
        ],
        task_effectiveness=task_effectiveness,
        remaining_issues=remaining_issues,
        facts=facts,
        ai_explanation=None,
        insufficient_evidence=insufficient,
    )


def _mastery_change(
    snapshots: list[MasterySnapshot],
    start: datetime,
    end: datetime,
) -> tuple[float | None, float | None, float | None, int]:
    grouped: dict[tuple[UUID, UUID], list[MasterySnapshot]] = {}
    for snapshot in snapshots:
        grouped.setdefault((snapshot.user_id, snapshot.knowledge_point_id), []).append(snapshot)
    before_values: list[float] = []
    after_values: list[float] = []
    for values in grouped.values():
        before_candidates = [
            snapshot for snapshot in values if _as_utc(snapshot.created_at) <= start
        ]
        after_candidates = [
            snapshot for snapshot in values if start < _as_utc(snapshot.created_at) <= end
        ]
        if not before_candidates or not after_candidates:
            continue
        before_values.append(before_candidates[-1].score)
        after_values.append(after_candidates[-1].score)
    if not before_values:
        return None, None, None, 0
    before = sum(before_values) / len(before_values)
    after = sum(after_values) / len(after_values)
    return round(before, 2), round(after, 2), round(after - before, 2), len(before_values)


async def _task_effectiveness(
    session: AsyncSession,
    plans: list[ExecutionPlan],
    start: datetime,
    end: datetime,
) -> list[PlanTaskEffectiveness]:
    if not plans:
        return []
    tasks = list(
        await session.scalars(
            select(PlanTask)
            .options(
                selectinload(PlanTask.target_students),
                selectinload(PlanTask.knowledge_points),
            )
            .where(PlanTask.plan_id.in_([plan.id for plan in plans]))
            .order_by(PlanTask.week_number, PlanTask.order_index)
        )
    )
    results: list[PlanTaskEffectiveness] = []
    for task in tasks:
        target_students = task.target_students
        if not target_students:
            plan = next(plan for plan in plans if plan.id == task.plan_id)
            target_students = plan.target_students or await list_course_students(
                session,
                plan.course_id,
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
        rate = round(min(completed, total) / total, 2) if total else 0.0
        task_points = task.knowledge_points
        if not task_points:
            plan = next(plan for plan in plans if plan.id == task.plan_id)
            task_points = plan.knowledge_points
        observed_change = None
        if target_students and task_points:
            task_snapshots = list(
                await session.scalars(
                    select(MasterySnapshot).where(
                        MasterySnapshot.user_id.in_([student.id for student in target_students]),
                        MasterySnapshot.knowledge_point_id.in_([point.id for point in task_points]),
                        MasterySnapshot.created_at < end,
                    )
                )
            )
            _, _, observed_change, _ = _mastery_change(task_snapshots, start, end)
        event_count = int(
            await session.scalar(
                select(func.count())
                .select_from(LearningEvent)
                .where(LearningEvent.task_id == task.id)
            )
            or 0
        )
        results.append(
            PlanTaskEffectiveness(
                task_id=task.id,
                title=task.title,
                completion_rate=rate,
                event_count=event_count,
                observed_change=observed_change,
            )
        )
    return results


def _as_utc(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=UTC)
