from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

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
