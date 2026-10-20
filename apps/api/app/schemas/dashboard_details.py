from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

from app.schemas.course import CourseMemberResponse
from app.schemas.learning import MasteryStateResponse


class ChapterAnalyticsResponse(BaseModel):
    chapter_id: UUID
    title: str
    order_index: int
    knowledge_point_count: int
    active_learner_count: int
    average_mastery: float | None


class StudentMasteryBrief(BaseModel):
    student_id: UUID
    display_name: str
    score: float


class KnowledgePointAnalyticsResponse(BaseModel):
    knowledge_point_id: UUID
    name: str
    chapter_id: UUID
    chapter_title: str
    average_mastery: float | None
    affected_students: int
    students: list[StudentMasteryBrief]


class LearningEvidenceResponse(BaseModel):
    event_id: UUID
    knowledge_point_id: UUID | None
    knowledge_point_name: str | None
    event_type: str
    evidence: str | None
    created_at: datetime


class StudentLearningDetailResponse(BaseModel):
    student_id: UUID
    display_name: str
    average_mastery: float | None
    mastery_states: list[MasteryStateResponse]
    recent_evidence: list[LearningEvidenceResponse]


class StudentWeakKnowledgePointResponse(BaseModel):
    knowledge_point_id: UUID
    name: str
    score: float


class StudentAnalyticsItemResponse(BaseModel):
    member: CourseMemberResponse
    average_mastery: float | None
    mastery_states: list[MasteryStateResponse]
    recent_evidence: list[LearningEvidenceResponse]
    weak_knowledge_points: list[StudentWeakKnowledgePointResponse]
    learning_event_count: int
    active_days_7: int
    last_active_at: datetime | None
    conversation_count: int


class StudentAnalyticsSummaryResponse(BaseModel):
    student_count: int
    average_mastery: float | None
    active_student_count: int
    attention_student_count: int
    students_with_evidence: int


class CourseStudentAnalyticsResponse(BaseModel):
    course_id: UUID
    generated_at: datetime
    items: list[StudentAnalyticsItemResponse]
    summary: StudentAnalyticsSummaryResponse
    chapter_analytics: list[ChapterAnalyticsResponse]
