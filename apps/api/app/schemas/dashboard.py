from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel

from app.schemas.dashboard_details import ChapterAnalyticsResponse


class HighRiskKnowledgePoint(BaseModel):
    knowledge_point_id: UUID
    name: str
    average_score: float
    affected_students: int


class CourseDashboardResponse(BaseModel):
    course_id: UUID
    student_count: int
    active_student_count: int
    question_count_7d: int
    total_learning_events: int
    pending_review_count: int
    average_mastery: float | None
    high_risk_knowledge_points: list[HighRiskKnowledgePoint]


class DashboardOverviewStats(BaseModel):
    student_count: int
    active_student_count: int
    weekly_interaction_count: int
    average_mastery: float | None
    attention_knowledge_point_count: int
    pending_review_count: int


class DashboardTrendPoint(BaseModel):
    date: date
    interaction_count: int
    active_student_count: int


class DashboardInsight(BaseModel):
    risk_level: Literal["low", "medium", "high"]
    summary: str
    generated_at: datetime


class DashboardLearningDifficulty(BaseModel):
    knowledge_point_id: UUID
    name: str
    average_score: float
    affected_students: int


class DashboardTeacherAction(BaseModel):
    action_type: Literal[
        "review_flags",
        "support_knowledge_point",
        "encourage_inactive_students",
    ]
    priority: Literal["low", "medium", "high"]
    target_id: UUID | None


class TeacherDashboardOverviewResponse(BaseModel):
    course_id: UUID
    stats: DashboardOverviewStats
    trend: list[DashboardTrendPoint]
    insight: DashboardInsight
    chapter_mastery: list[ChapterAnalyticsResponse]
    learning_difficulties: list[DashboardLearningDifficulty]
    teacher_actions: list[DashboardTeacherAction]
