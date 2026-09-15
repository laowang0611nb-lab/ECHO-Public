from uuid import UUID

from pydantic import BaseModel


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
    average_mastery: float | None
    high_risk_knowledge_points: list[HighRiskKnowledgePoint]
