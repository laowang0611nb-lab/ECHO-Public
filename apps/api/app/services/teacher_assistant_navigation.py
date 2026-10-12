from dataclasses import dataclass
from uuid import UUID

from app.schemas.teacher_assistant import (
    TeacherAssistantNavigationTarget,
    TeacherAssistantSuggestedAction,
)


@dataclass(frozen=True)
class FeatureDefinition:
    key: str
    title: str
    description: str
    aliases: tuple[str, ...]
    target_type: str


@dataclass(frozen=True)
class NavigationLookup:
    matched_keys: list[str]
    summary: str
    actions: list[TeacherAssistantSuggestedAction]


FEATURE_DEFINITIONS: tuple[FeatureDefinition, ...] = (
    FeatureDefinition(
        key="dashboard",
        title="Dashboard",
        description="查看课程概览、活跃学生、互动趋势、掌握度风险和待审核数量。",
        aliases=("dashboard", "首页", "概览", "仪表盘", "总览"),
        target_type="dashboard",
    ),
    FeatureDefinition(
        key="ai_insights",
        title="AI 教学洞察",
        description="查看 AI 二次分析、证据、影响学生和教学建议。",
        aliases=("ai 洞察", "ai教学洞察", "教学洞察", "二次分析", "智能分析"),
        target_type="ai_insights",
    ),
    FeatureDefinition(
        key="students",
        title="学生学情",
        description="查看班级学生列表、掌握分层、学习事件和个人详情。",
        aliases=("学生学情", "学生列表", "学生", "学情", "班级"),
        target_type="students_list",
    ),
    FeatureDefinition(
        key="knowledge",
        title="知识库与知识点",
        description="查看教材、章节、知识点、知识和教材来源证据。",
        aliases=("知识库", "知识点", "教材", "章节", "资源"),
        target_type="knowledge_base",
    ),
    FeatureDefinition(
        key="review",
        title="AI 回答审核",
        description="查看待审核回答、高风险标记、原因和教师处理历史。",
        aliases=("ai 审核", "ai审核", "回答审核", "审核", "待审核", "review"),
        target_type="ai_review",
    ),
    FeatureDefinition(
        key="teaching_strategies",
        title="教学策略",
        description="查看、生成、采纳和执行教学策略。",
        aliases=("教学策略", "策略", "教学方式"),
        target_type="teaching_strategies",
    ),
    FeatureDefinition(
        key="execution_plans",
        title="执行计划",
        description="查看计划、任务、计划学习事件和实施效果。",
        aliases=("执行计划", "计划效果", "计划任务", "计划"),
        target_type="execution_plans",
    ),
    FeatureDefinition(
        key="courses",
        title="课程管理",
        description="查看课程列表、课程设置和课程详情。",
        aliases=("课程管理", "课程列表", "课程详情", "课程"),
        target_type="courses",
    ),
)


def _action(
    *,
    course_id: UUID,
    action_id: str,
    label: str,
    reason: str,
    target_type: str,
) -> TeacherAssistantSuggestedAction:
    return TeacherAssistantSuggestedAction(
        id=action_id,
        label=label,
        reason=reason,
        target=TeacherAssistantNavigationTarget(
            type=target_type,  # type: ignore[arg-type]
            course_id=course_id,
        ),
    )


def lookup_feature_navigation(
    course_id: UUID,
    query: str,
    *,
    limit: int = 4,
) -> NavigationLookup:
    normalized = query.casefold()
    matched: list[FeatureDefinition] = []
    for feature in FEATURE_DEFINITIONS:
        if any(alias.casefold() in normalized for alias in feature.aliases):
            matched.append(feature)
        if len(matched) >= limit:
            break

    if not matched:
        return NavigationLookup(matched_keys=[], summary="", actions=[])

    actions = [
        _action(
            course_id=course_id,
            action_id=f"navigate-{feature.key}",
            label=f"打开{feature.title}",
            reason=feature.description,
            target_type=feature.target_type,
        )
        for feature in matched
    ]
    summary = "\n".join(f"- {feature.title}：{feature.description}" for feature in matched)
    return NavigationLookup(
        matched_keys=[feature.key for feature in matched],
        summary=summary,
        actions=actions,
    )


def is_navigation_query(query: str) -> bool:
    normalized = query.casefold()
    navigation_markers = (
        "在哪",
        "哪里",
        "怎么打开",
        "如何打开",
        "怎么进入",
        "如何进入",
        "入口",
        "页面",
        "功能",
        "带我去",
        "打开",
        "查看页面",
        "导航",
    )
    return any(marker in normalized for marker in navigation_markers)
