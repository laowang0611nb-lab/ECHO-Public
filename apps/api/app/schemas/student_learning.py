from datetime import date, datetime
from typing import Literal
from uuid import UUID

from database.models.learning import LearningEventType
from pydantic import BaseModel, Field

from app.schemas.quick_check import QuickCheckBlock


class StudentLearningEventItem(BaseModel):
    id: UUID
    course_id: UUID
    student_id: UUID
    knowledge_point_id: UUID | None
    knowledge_point_name: str | None
    conversation_id: UUID | None
    message_id: UUID | None
    plan_id: UUID | None
    task_id: UUID | None
    week_number: int | None
    event_type: LearningEventType
    result: Literal["correct", "wrong", "completed", "unresolved"]
    weight: float
    evidence: str | None
    metadata_json: dict[str, object]
    mastery_before: float | None
    mastery_after: float | None
    created_at: datetime


class StudentLearningEventPage(BaseModel):
    items: list[StudentLearningEventItem]
    total: int
    next_cursor: str | None


class ChapterProgressItem(BaseModel):
    chapter_id: UUID
    title: str
    order_index: int
    status: Literal["not_started", "in_progress", "completed"]
    progress_percent: int = Field(ge=0, le=100)
    knowledge_point_count: int
    started_knowledge_point_count: int
    mastered_knowledge_point_count: int
    average_mastery: float | None
    last_learning_at: datetime | None
    completion_basis: str


class StudentCourseProgressResponse(BaseModel):
    course_id: UUID
    student_id: UUID
    current_chapter_id: UUID | None
    current_knowledge_point_id: UUID | None
    last_learning_at: datetime | None
    overall_progress_percent: int = Field(ge=0, le=100)
    chapters: list[ChapterProgressItem]


class WrongQuestionSummary(BaseModel):
    question_id: UUID
    title: str
    prompt: str
    question_type: str
    difficulty: str
    chapter_id: UUID | None
    chapter_title: str | None
    knowledge_point_id: UUID | None
    knowledge_point_name: str | None
    wrong_count: int = Field(ge=1)
    latest_wrong_at: datetime
    mastery: float | None
    review_status: Literal["unresolved", "resolved"]


class WrongQuestionPage(BaseModel):
    items: list[WrongQuestionSummary]
    total: int
    next_cursor: str | None


class WrongQuestionDetail(BaseModel):
    question: WrongQuestionSummary
    options: list[dict[str, str]]
    correct_option_id: str | None
    explanation: str | None
    selected_option_id: str | None
    latest_attempt_id: str | None
    source_document_id: UUID | None
    source_page: int | None


class KnowledgePointQuickCheckSet(BaseModel):
    course_id: UUID
    knowledge_point_id: UUID
    knowledge_point_name: str
    purpose: Literal["consolidation"]
    requested_count: int = Field(ge=1, le=5)
    items: list[QuickCheckBlock]
    insufficient_questions: bool


class StudentResourceItem(BaseModel):
    id: UUID
    title: str
    resource_type: str
    status: str
    summary: str | None
    chapter_title: str | None
    mime_type: str | None
    page_count: int | None
    external_url: str | None
    available: bool
    updated_at: datetime


class StudentResourcePage(BaseModel):
    items: list[StudentResourceItem]
    total: int


class StudentTeacherSummary(BaseModel):
    user_id: UUID
    display_name: str
    avatar_url: str | None


class StudentTeacherListResponse(BaseModel):
    course_id: UUID
    teachers: list[StudentTeacherSummary]


class StudentPlanTaskItem(BaseModel):
    id: UUID
    plan_id: UUID
    plan_title: str
    week_number: int
    title: str
    description: str
    task_type: str
    status: str
    due_at: datetime | None
    knowledge_point_ids: list[UUID]
    resources: list[dict[str, object]]
    completed_at: datetime | None
    completion_evidence: str | None


class StudentPlanTaskPage(BaseModel):
    items: list[StudentPlanTaskItem]
    total: int


class StudentConversationSummary(BaseModel):
    id: UUID
    title: str | None
    created_at: datetime
    updated_at: datetime
    matching_message_count: int
    latest_matching_message_id: UUID
    latest_matching_at: datetime


class StudentConversationPage(BaseModel):
    items: list[StudentConversationSummary]
    total: int


class KnowledgePointSourceItem(BaseModel):
    document_id: UUID
    document_name: str
    chapter_id: UUID
    chapter_title: str
    chunk_id: UUID
    page_start: int
    page_end: int
    quote: str


class KnowledgePointSourcePage(BaseModel):
    knowledge_point_id: UUID
    knowledge_point_name: str
    items: list[KnowledgePointSourceItem]
    total: int


class MisconceptionEvidence(BaseModel):
    knowledge_point_id: UUID
    label: str
    description: str
    occurrence_count: int
    affected_student_count: int
    sample_event_ids: list[UUID]
    insufficient_evidence: bool
    window_start: date
    window_end: date
