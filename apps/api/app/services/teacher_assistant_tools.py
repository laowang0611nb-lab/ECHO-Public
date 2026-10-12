from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from uuid import UUID

from database.models.chat import Conversation, Message, MessageRole
from database.models.course import CourseMember
from database.models.document import Document
from database.models.knowledge import Chapter, KnowledgePoint
from database.models.learning import LearningEvent, StudentKnowledgeState
from database.models.user import User, UserRole, UserStatus
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.schemas.dashboard_details import KnowledgePointAnalyticsResponse
from app.schemas.planning import TeachingStrategyPage
from app.schemas.teacher_assistant import (
    TeacherAssistantNavigationTarget,
    TeacherAssistantSuggestedAction,
)
from app.services.dashboard import get_teacher_dashboard_overview
from app.services.dashboard_details import (
    get_knowledge_point_analytics,
    get_student_learning_detail,
)
from app.services.knowledge_analytics import (
    get_student_error_patterns,
    get_student_mastery_trend,
)
from app.services.plan_effects import get_plan_effect, get_strategy_effect
from app.services.review_workflow import get_review_summary
from app.services.teacher_access import ensure_student_member, ensure_teacher
from app.services.teaching_strategy import list_teaching_strategies


@dataclass
class ToolResult:
    name: str
    summary: str
    facts: list[str] = field(default_factory=list)
    data: dict[str, object] = field(default_factory=dict)
    actions: list[TeacherAssistantSuggestedAction] = field(default_factory=list)
    insufficient_evidence: bool = False


def _action(
    *,
    course_id: UUID,
    action_id: str,
    label: str,
    reason: str,
    target_type: str,
    student_id: UUID | None = None,
    conversation_id: UUID | None = None,
    knowledge_point_id: UUID | None = None,
    review_flag_id: UUID | None = None,
    strategy_id: UUID | None = None,
    plan_id: UUID | None = None,
) -> TeacherAssistantSuggestedAction:
    return TeacherAssistantSuggestedAction(
        id=action_id,
        label=label,
        reason=reason,
        target=TeacherAssistantNavigationTarget(
            type=target_type,  # type: ignore[arg-type]
            course_id=course_id,
            student_id=student_id,
            conversation_id=conversation_id,
            knowledge_point_id=knowledge_point_id,
            review_flag_id=review_flag_id,
            strategy_id=strategy_id,
            plan_id=plan_id,
        ),
    )


def _truncate(value: str | None, limit: int = 240) -> str | None:
    if value is None:
        return None
    normalized = " ".join(value.split())
    if len(normalized) <= limit:
        return normalized
    return f"{normalized[: limit - 1]}…"


async def get_course_overview_tool(
    session: AsyncSession,
    course_id: UUID,
    teacher_id: UUID,
) -> ToolResult:
    overview = await get_teacher_dashboard_overview(session, course_id, teacher_id)
    stats = overview.stats
    facts = [
        f"课程学生数 {stats.student_count}。",
        f"最近 7 天活跃学生 {stats.active_student_count}。",
        f"最近 7 天学习互动 {stats.weekly_interaction_count} 次。",
        f"待审核 AI 回答 {stats.pending_review_count} 条。",
        f"需要关注的知识点 {stats.attention_knowledge_point_count} 个。",
    ]
    if stats.average_mastery is not None:
        facts.append(f"课程平均掌握度 {stats.average_mastery:.2f}。")
    else:
        facts.append("当前没有足够的掌握度状态形成课程平均值。")

    actions: list[TeacherAssistantSuggestedAction] = [
        _action(
            course_id=course_id,
            action_id="dashboard-overview",
            label="打开 Dashboard",
            reason="查看课程概览、趋势和教师行动区。",
            target_type="dashboard",
        )
    ]
    for point in overview.learning_difficulties[:3]:
        facts.append(
            f"薄弱知识点“{point.name}”平均掌握度 {point.average_score:.2f}，"
            f"低于 60 分的学生 {point.affected_students} 人。"
        )
        actions.append(
            _action(
                course_id=course_id,
                action_id=f"knowledge-point-{point.knowledge_point_id}",
                label=f"查看知识点：{point.name}",
                reason="查看该知识点的掌握分布和薄弱学生。",
                target_type="knowledge_point_detail",
                knowledge_point_id=point.knowledge_point_id,
            )
        )
    return ToolResult(
        name="get_course_overview",
        summary="课程近 7 天概览和薄弱知识点",
        facts=facts,
        data=overview.model_dump(mode="json"),
        actions=actions,
        insufficient_evidence=stats.student_count == 0,
    )


async def list_course_students_tool(
    session: AsyncSession,
    course_id: UUID,
    teacher_id: UUID,
    *,
    limit: int | None = None,
) -> ToolResult:
    await ensure_teacher(session, course_id, teacher_id)
    max_rows = min(limit or settings.teacher_assistant_max_students, 100)
    student_rows = (
        await session.execute(
            select(User.id, User.display_name)
            .join(CourseMember, CourseMember.user_id == User.id)
            .where(
                CourseMember.course_id == course_id,
                CourseMember.role == UserRole.STUDENT,
                User.status == UserStatus.ACTIVE,
            )
            .order_by(User.display_name, User.id)
            .limit(max_rows)
        )
    ).all()
    student_ids = [student_id for student_id, _ in student_rows]
    if not student_ids:
        return ToolResult(
            name="list_course_students",
            summary="当前课程没有可读取的学生成员",
            facts=["当前课程没有学生成员，无法生成学生关注名单。"],
            actions=[
                _action(
                    course_id=course_id,
                    action_id="students-list",
                    label="打开学生学情",
                    reason="查看当前课程学生列表。",
                    target_type="students_list",
                )
            ],
            insufficient_evidence=True,
        )

    mastery_rows = (
        await session.execute(
            select(
                StudentKnowledgeState.user_id,
                func.avg(StudentKnowledgeState.score).label("average_score"),
            )
            .join(
                KnowledgePoint,
                KnowledgePoint.id == StudentKnowledgeState.knowledge_point_id,
            )
            .join(Chapter, Chapter.id == KnowledgePoint.chapter_id)
            .join(Document, Document.id == Chapter.document_id)
            .where(
                StudentKnowledgeState.course_id == course_id,
                StudentKnowledgeState.user_id.in_(student_ids),
                KnowledgePoint.trashed_at.is_(None),
                Chapter.trashed_at.is_(None),
                Document.trashed_at.is_(None),
            )
            .group_by(StudentKnowledgeState.user_id)
        )
    ).all()
    mastery_by_student = {student_id: round(float(score), 2) for student_id, score in mastery_rows}
    since = datetime.now(UTC) - timedelta(days=7)
    event_rows = (
        await session.execute(
            select(
                LearningEvent.user_id,
                func.count(LearningEvent.id),
                func.max(LearningEvent.created_at),
            )
            .where(
                LearningEvent.course_id == course_id,
                LearningEvent.user_id.in_(student_ids),
                LearningEvent.created_at >= since,
            )
            .group_by(LearningEvent.user_id)
        )
    ).all()
    event_by_student = {
        student_id: (int(count), last_at) for student_id, count, last_at in event_rows
    }
    students = [
        {
            "student_id": str(student_id),
            "display_name": display_name,
            "average_mastery": mastery_by_student.get(student_id),
            "active_events_7d": event_by_student.get(student_id, (0, None))[0],
            "last_learning_at": (
                event_by_student[student_id][1].isoformat()
                if student_id in event_by_student and event_by_student[student_id][1]
                else None
            ),
        }
        for student_id, display_name in student_rows
    ]
    attention = [
        student
        for student in students
        if student["average_mastery"] is not None and float(student["average_mastery"]) < 60
    ]
    facts = [f"当前课程读取到 {len(students)} 名学生。"]
    if attention:
        facts.append(f"平均掌握度低于 60 的学生 {len(attention)} 人。")
        for student in sorted(
            attention,
            key=lambda item: (
                float(item["average_mastery"]),
                str(item["display_name"]),
            ),
        )[:5]:
            facts.append(
                f"{student['display_name']}平均掌握度 {student['average_mastery']:.2f}，"
                f"最近 7 天学习事件 {student['active_events_7d']} 条。"
            )
    inactive = [student for student in students if student["active_events_7d"] == 0]
    if inactive:
        facts.append(f"最近 7 天没有学习事件的学生 {len(inactive)} 人。")
    actions = [
        _action(
            course_id=course_id,
            action_id="students-list",
            label="打开学生学情",
            reason="查看完整学生列表和个体详情。",
            target_type="students_list",
        )
    ]
    return ToolResult(
        name="list_course_students",
        summary="课程学生掌握度和近期活跃摘要",
        facts=facts,
        data={"students": students, "total": len(students)},
        actions=actions,
        insufficient_evidence=not students,
    )


async def get_student_learning_snapshot_tool(
    session: AsyncSession,
    course_id: UUID,
    teacher_id: UUID,
    student_id: UUID,
) -> ToolResult:
    detail = await get_student_learning_detail(
        session,
        course_id,
        student_id,
        teacher_id,
    )
    point_ids = [state.knowledge_point_id for state in detail.mastery_states]
    point_names: dict[UUID, str] = {}
    if point_ids:
        rows = (
            await session.execute(
                select(KnowledgePoint.id, KnowledgePoint.name).where(
                    KnowledgePoint.id.in_(point_ids)
                )
            )
        ).all()
        point_names = {point_id: name for point_id, name in rows}
    lowest = sorted(detail.mastery_states, key=lambda state: state.score)[:5]
    recent = detail.recent_evidence[:10]
    facts = [f"学生 {detail.display_name} 的平均掌握度为 {detail.average_mastery}。"]
    for state in lowest:
        facts.append(
            f"知识点“{point_names.get(state.knowledge_point_id, str(state.knowledge_point_id))}”"
            f"当前掌握度 {state.score:.2f}。"
        )
    for event in recent:
        evidence = _truncate(event.evidence, 180)
        facts.append(
            f"最近学习事件 {event.event_type}，知识点"
            f"“{event.knowledge_point_name or '未定位'}”"
            f"{f'，证据：{evidence}' if evidence else ''}。"
        )
    latest_conversation_id = await session.scalar(
        select(LearningEvent.conversation_id)
        .where(
            LearningEvent.course_id == course_id,
            LearningEvent.user_id == student_id,
            LearningEvent.conversation_id.is_not(None),
        )
        .order_by(LearningEvent.created_at.desc(), LearningEvent.id.desc())
        .limit(1)
    )
    actions = [
        _action(
            course_id=course_id,
            action_id=f"student-{student_id}",
            label=f"查看{detail.display_name}的学情详情",
            reason="查看掌握状态和学习事件证据。",
            target_type="student_detail",
            student_id=student_id,
        )
    ]
    if latest_conversation_id is not None:
        actions.append(
            _action(
                course_id=course_id,
                action_id=f"student-conversation-{latest_conversation_id}",
                label="查看最近学生对话",
                reason="回到学生完整对话证据。",
                target_type="student_conversation",
                student_id=student_id,
                conversation_id=latest_conversation_id,
            )
        )
    return ToolResult(
        name="get_student_learning_snapshot",
        summary=f"{detail.display_name} 的近期学习快照",
        facts=facts,
        data=detail.model_dump(mode="json"),
        actions=actions,
        insufficient_evidence=not detail.mastery_states and not recent,
    )


async def get_student_mastery_trend_tool(
    session: AsyncSession,
    course_id: UUID,
    teacher_id: UUID,
    student_id: UUID,
    *,
    days: int,
) -> ToolResult:
    trend = await get_student_mastery_trend(
        session,
        course_id,
        student_id,
        teacher_id,
        days=days,
    )
    points = trend.points
    facts = [f"掌握度趋势窗口为最近 {days} 天。"]
    if points:
        facts.append(
            f"窗口内最早观察日平均掌握度 {points[0].average_mastery:.2f}，"
            f"最近观察日平均掌握度 {points[-1].average_mastery:.2f}。"
        )
        for point in points[-7:]:
            facts.append(
                f"{point.date.isoformat()} 平均掌握度 {point.average_mastery:.2f}，"
                f"涉及学生 {point.affected_students} 人。"
            )
    else:
        facts.append("该窗口内没有掌握度快照，不能确认趋势方向。")
    return ToolResult(
        name="get_student_mastery_trend",
        summary="学生长期掌握趋势",
        facts=facts,
        data=trend.model_dump(mode="json"),
        actions=[
            _action(
                course_id=course_id,
                action_id=f"student-{student_id}",
                label="查看学生详情",
                reason="查看完整掌握状态和趋势证据。",
                target_type="student_detail",
                student_id=student_id,
            )
        ],
        insufficient_evidence=len(points) < 2,
    )


async def get_student_error_patterns_tool(
    session: AsyncSession,
    course_id: UUID,
    teacher_id: UUID,
    student_id: UUID,
    *,
    days: int,
) -> ToolResult:
    report = await get_student_error_patterns(
        session,
        course_id,
        student_id,
        teacher_id,
        days=days,
    )
    facts = [f"错误画像窗口为最近 {days} 天。"]
    for pattern in report.patterns[:8]:
        facts.append(
            f"错误模式“{pattern.label}”出现 {pattern.occurrence_count} 次，"
            f"涉及学生 {pattern.affected_students} 人，趋势 {pattern.trend}。"
        )
    if not report.patterns:
        facts.append("窗口内没有可聚类的错误或困惑事件。")
    return ToolResult(
        name="get_student_error_patterns",
        summary="学生错误与困惑聚类",
        facts=facts,
        data=report.model_dump(mode="json"),
        actions=[
            _action(
                course_id=course_id,
                action_id=f"student-{student_id}",
                label="查看学生详情",
                reason="回到学生的最近错误证据。",
                target_type="student_detail",
                student_id=student_id,
            )
        ],
        insufficient_evidence=not report.patterns,
    )


async def get_knowledge_point_analytics_tool(
    session: AsyncSession,
    course_id: UUID,
    teacher_id: UUID,
    knowledge_point_id: UUID,
) -> ToolResult:
    analytics: KnowledgePointAnalyticsResponse = await get_knowledge_point_analytics(
        session,
        course_id,
        knowledge_point_id,
        teacher_id,
    )
    facts = [f"知识点“{analytics.name}”位于章节“{analytics.chapter_title}”。"]
    if analytics.average_mastery is not None:
        facts.append(f"当前平均掌握度 {analytics.average_mastery:.2f}。")
    facts.append(f"低于 60 分的学生 {analytics.affected_students} 人。")
    weakest = analytics.students[:10]
    for student in weakest:
        facts.append(f"{student.display_name}当前掌握度 {student.score:.2f}。")
    actions = [
        _action(
            course_id=course_id,
            action_id=f"knowledge-point-{knowledge_point_id}",
            label=f"查看知识点：{analytics.name}",
            reason="查看知识点掌握分布和教材来源。",
            target_type="knowledge_point_detail",
            knowledge_point_id=knowledge_point_id,
        )
    ]
    for student in analytics.students[:3]:
        actions.append(
            _action(
                course_id=course_id,
                action_id=f"student-{student.student_id}",
                label=f"查看{student.display_name}",
                reason="查看该学生在知识点的学习证据。",
                target_type="student_detail",
                student_id=student.student_id,
            )
        )
    return ToolResult(
        name="get_knowledge_point_analytics",
        summary=f"知识点“{analytics.name}”的掌握分布",
        facts=facts,
        data=analytics.model_dump(mode="json"),
        actions=actions,
        insufficient_evidence=analytics.average_mastery is None,
    )


async def get_course_question_summary_tool(
    session: AsyncSession,
    course_id: UUID,
    teacher_id: UUID,
    *,
    days: int,
) -> ToolResult:
    await ensure_teacher(session, course_id, teacher_id)
    since = datetime.now(UTC) - timedelta(days=days)
    rows = (
        await session.execute(
            select(
                Message.id,
                Message.conversation_id,
                Message.content,
                Message.created_at,
                User.id,
                User.display_name,
            )
            .join(Conversation, Conversation.id == Message.conversation_id)
            .join(User, User.id == Conversation.user_id)
            .join(
                CourseMember,
                and_(
                    CourseMember.course_id == Conversation.course_id,
                    CourseMember.user_id == User.id,
                ),
            )
            .where(
                Conversation.course_id == course_id,
                CourseMember.course_id == course_id,
                CourseMember.role == UserRole.STUDENT,
                Message.role == MessageRole.USER,
                Message.created_at >= since,
            )
            .order_by(Message.created_at.desc(), Message.id.desc())
            .limit(settings.teacher_assistant_max_question_messages)
        )
    ).all()
    question_rows = [row for row in rows if str(row.content).strip()]
    facts = [f"最近 {days} 天读取到学生提问消息 {len(question_rows)} 条。"]
    per_student: dict[UUID, int] = {}
    student_names: dict[UUID, str] = {}
    actions: list[TeacherAssistantSuggestedAction] = []
    seen_actions: set[tuple[UUID, UUID]] = set()
    for (
        message_id,
        conversation_id,
        content,
        created_at,
        student_id,
        display_name,
    ) in question_rows[:12]:
        per_student[student_id] = per_student.get(student_id, 0) + 1
        student_names[student_id] = display_name
        facts.append(
            f"{display_name}在 {created_at.date().isoformat()} 提出问题："
            f"{_truncate(str(content), 160)}"
        )
        key = (student_id, conversation_id)
        if len(actions) < 3 and key not in seen_actions:
            seen_actions.add(key)
            actions.append(
                _action(
                    course_id=course_id,
                    action_id=f"student-conversation-{conversation_id}",
                    label=f"查看{display_name}的对话",
                    reason=f"转到消息 {message_id} 附近的完整对话证据。",
                    target_type="student_conversation",
                    student_id=student_id,
                    conversation_id=conversation_id,
                )
            )
    if per_student:
        top = sorted(per_student.items(), key=lambda item: (-item[1], str(item[0])))[:5]
        for student_id, count in top:
            student_name = student_names.get(student_id, str(student_id))
            facts.append(f"学生 {student_name} 在窗口内提问 {count} 条。")
    if not question_rows:
        facts.append("窗口内没有可读取的学生提问，不能生成问题主题总结。")
    return ToolResult(
        name="get_course_question_summary",
        summary="课程学生近期提问摘要",
        facts=facts,
        data={
            "total": len(question_rows),
            "students": [str(student_id) for student_id in per_student],
        },
        actions=actions,
        insufficient_evidence=not question_rows,
    )


async def get_course_review_summary_tool(
    session: AsyncSession,
    course_id: UUID,
    teacher_id: UUID,
) -> ToolResult:
    summary = await get_review_summary(session, course_id, teacher_id)
    facts = [
        f"待审核回答 {summary.pending} 条。",
        f"待复审回答 {summary.pending_rereview} 条。",
        f"高风险审核标记 {summary.high_risk} 条。",
        f"生成中的回答 {summary.generating} 条。",
        f"重新生成失败 {summary.regeneration_failed} 条。",
    ]
    for reason, count in summary.reasons.items():
        facts.append(f"审核原因 {reason.value} 的数量为 {count} 条。")
    return ToolResult(
        name="get_review_summary",
        summary="课程审核队列摘要",
        facts=facts,
        data=summary.model_dump(mode="json"),
        actions=[
            _action(
                course_id=course_id,
                action_id="ai-review",
                label="打开 AI 审核",
                reason="查看审核队列和教师处理证据。",
                target_type="ai_review",
            )
        ],
        insufficient_evidence=summary.pending == 0 and summary.high_risk == 0,
    )


async def get_strategy_effect_tool(
    session: AsyncSession,
    course_id: UUID,
    teacher_id: UUID,
    strategy_id: UUID,
) -> ToolResult:
    effect = await get_strategy_effect(session, strategy_id, teacher_id)
    facts = effect.facts or ["当前策略没有足够的观察证据。"]
    metrics = [
        f"{metric.label}：{metric.before} -> {metric.after}，变化 {metric.delta}"
        for metric in effect.metrics
    ]
    return ToolResult(
        name="get_teaching_strategy_effect",
        summary="教学策略观察效果",
        facts=[*facts, *metrics],
        data=effect.model_dump(mode="json"),
        actions=[
            _action(
                course_id=course_id,
                action_id=f"teaching-strategy-{strategy_id}",
                label="查看教学策略",
                reason="查看策略详情、版本和效果。",
                target_type="teaching_strategy",
                strategy_id=strategy_id,
            )
        ],
        insufficient_evidence=effect.insufficient_evidence,
    )


async def get_plan_effect_tool(
    session: AsyncSession,
    course_id: UUID,
    teacher_id: UUID,
    plan_id: UUID,
) -> ToolResult:
    effect = await get_plan_effect(session, plan_id, teacher_id)
    facts = effect.facts or ["当前计划没有足够的观察证据。"]
    for metric in effect.metrics:
        facts.append(f"{metric.label}：{metric.before} -> {metric.after}，变化 {metric.delta}")
    return ToolResult(
        name="get_execution_plan_effect",
        summary="执行计划观察效果",
        facts=facts,
        data=effect.model_dump(mode="json"),
        actions=[
            _action(
                course_id=course_id,
                action_id=f"execution-plan-{plan_id}",
                label="查看执行计划",
                reason="查看计划任务、事件和效果。",
                target_type="execution_plan",
                plan_id=plan_id,
            )
        ],
        insufficient_evidence=effect.insufficient_evidence,
    )


async def list_teaching_strategies_tool(
    session: AsyncSession,
    course_id: UUID,
    teacher_id: UUID,
) -> ToolResult:
    page: TeachingStrategyPage = await list_teaching_strategies(
        session,
        course_id,
        teacher_id,
        status=None,
        strategy_type=None,
        priority=None,
        cursor=None,
        limit=5,
    )
    facts = [f"当前课程读取到 {page.total} 条教学策略，以下展示最近 5 条。"]
    actions = [
        _action(
            course_id=course_id,
            action_id="teaching-strategies",
            label="打开教学策略",
            reason="查看策略列表和状态。",
            target_type="teaching_strategies",
        )
    ]
    for item in page.items:
        facts.append(
            f"策略“{item.title}”，状态 {item.status.value}，优先级 {item.priority.value}。"
        )
        actions.append(
            _action(
                course_id=course_id,
                action_id=f"teaching-strategy-{item.id}",
                label=f"查看策略：{item.title}",
                reason="查看策略详情和版本。",
                target_type="teaching_strategy",
                strategy_id=item.id,
            )
        )
    return ToolResult(
        name="list_teaching_strategies",
        summary="课程教学策略列表",
        facts=facts,
        data=page.model_dump(mode="json"),
        actions=actions,
        insufficient_evidence=page.total == 0,
    )


async def find_active_knowledge_point(
    session: AsyncSession,
    course_id: UUID,
    query: str,
    *,
    explicit_id: UUID | None = None,
) -> tuple[UUID | None, str | None, list[tuple[UUID, str]]]:
    rows = (
        await session.execute(
            select(KnowledgePoint.id, KnowledgePoint.name)
            .join(Chapter, Chapter.id == KnowledgePoint.chapter_id)
            .join(Document, Document.id == Chapter.document_id)
            .where(
                KnowledgePoint.course_id == course_id,
                KnowledgePoint.trashed_at.is_(None),
                Chapter.trashed_at.is_(None),
                Document.trashed_at.is_(None),
            )
            .order_by(KnowledgePoint.name, KnowledgePoint.id)
        )
    ).all()
    if explicit_id is not None:
        for point_id, name in rows:
            if point_id == explicit_id:
                return point_id, name, []
        return None, None, rows

    normalized = query.casefold()
    matches = [(point_id, name) for point_id, name in rows if name.casefold() in normalized]
    if len(matches) == 1:
        return matches[0][0], matches[0][1], []
    return None, None, matches


async def ensure_student_tool_access(
    session: AsyncSession,
    course_id: UUID,
    student_id: UUID,
) -> None:
    await ensure_student_member(session, course_id, student_id)
