from datetime import datetime
from typing import Literal
from uuid import UUID

from database.models.learning import LearningEventType
from pydantic import BaseModel, ConfigDict, Field


class LearningEventCreate(BaseModel):
    student_id: UUID
    knowledge_point_id: UUID | None = None
    conversation_id: UUID | None = None
    message_id: UUID | None = None
    plan_id: UUID | None = None
    task_id: UUID | None = None
    week_number: int | None = Field(default=None, ge=1)
    event_type: LearningEventType
    weight: float = Field(default=1.0, gt=0, le=10)
    evidence: str | None = Field(default=None, max_length=2000)
    metadata_json: dict[str, object] = Field(default_factory=dict)


class LearningEventResponse(BaseModel):
    id: UUID
    course_id: UUID
    user_id: UUID
    knowledge_point_id: UUID | None
    plan_id: UUID | None
    task_id: UUID | None
    week_number: int | None
    event_type: LearningEventType
    weight: float
    evidence: str | None
    result: Literal["correct", "wrong", "completed", "unresolved"]
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class MasteryStateResponse(BaseModel):
    id: UUID
    course_id: UUID
    user_id: UUID
    knowledge_point_id: UUID
    score: float
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
