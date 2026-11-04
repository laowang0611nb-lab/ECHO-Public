from datetime import date, datetime
from typing import Literal
from uuid import UUID

from database.models.document import ResourceType
from database.models.resource import (
    ExternalResourceStatus,
    QuestionDifficulty,
    QuestionType,
)
from pydantic import BaseModel, Field, HttpUrl, field_validator, model_validator


class MasteryTrendPoint(BaseModel):
    date: date
    average_mastery: float | None
    affected_students: int
    evidence_count: int
    snapshot_ids: list[UUID] = Field(default_factory=list)
    event_ids: list[UUID] = Field(default_factory=list)


class MasteryTrendResponse(BaseModel):
    knowledge_point_id: UUID | None = None
    student_id: UUID | None = None
    range: "MasteryTrendRange"
    points: list[MasteryTrendPoint]


class MasteryTrendRange(BaseModel):
    start_date: date
    end_date: date
    days: int


class ErrorPattern(BaseModel):
    code: str
    label: str
    description: str
    occurrence_count: int
    affected_students: int
    trend: Literal["up", "stable", "down", "unknown"]
    sample_evidence_ids: list[UUID] = Field(default_factory=list)


class ErrorPatternResponse(BaseModel):
    knowledge_point_id: UUID | None = None
    student_id: UUID | None = None
    window_days: int
    patterns: list[ErrorPattern]


class QuestionItemCreate(BaseModel):
    knowledge_point_ids: list[UUID] = Field(default_factory=list, max_length=20)
    type: QuestionType
    difficulty: QuestionDifficulty = QuestionDifficulty.MEDIUM
    title: str = Field(min_length=1, max_length=255)
    content: str = Field(min_length=1, max_length=20000)
    answer: str | None = Field(default=None, max_length=20000)
    explanation: str | None = Field(default=None, max_length=20000)
    source_document_id: UUID | None = None
    source_page: int | None = Field(default=None, gt=0)
    metadata_json: dict[str, object] = Field(default_factory=dict)

    @field_validator("title")
    @classmethod
    def normalize_title(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("title must not be blank")
        return normalized

    @field_validator("knowledge_point_ids")
    @classmethod
    def unique_knowledge_points(cls, values: list[UUID]) -> list[UUID]:
        return list(dict.fromkeys(values))


class QuestionItemUpdate(BaseModel):
    knowledge_point_ids: list[UUID] | None = Field(default=None, max_length=20)
    type: QuestionType | None = None
    difficulty: QuestionDifficulty | None = None
    title: str | None = Field(default=None, min_length=1, max_length=255)
    content: str | None = Field(default=None, min_length=1, max_length=20000)
    answer: str | None = Field(default=None, max_length=20000)
    explanation: str | None = Field(default=None, max_length=20000)
    source_document_id: UUID | None = None
    source_page: int | None = Field(default=None, gt=0)
    metadata_json: dict[str, object] | None = None

    @model_validator(mode="after")
    def require_change(self) -> "QuestionItemUpdate":
        if not self.model_fields_set:
            raise ValueError("at least one question item field must be provided")
        for field in ("type", "difficulty", "title", "content", "metadata_json"):
            if field in self.model_fields_set and getattr(self, field) is None:
                raise ValueError(f"{field} must not be null")
        return self


class QuestionItemResponse(BaseModel):
    id: UUID
    course_id: UUID
    knowledge_point_ids: list[UUID] = Field(default_factory=list)
    type: QuestionType
    difficulty: QuestionDifficulty
    title: str
    content: str
    answer: str | None
    explanation: str | None
    source_document_id: UUID | None
    source_page: int | None
    metadata_json: dict[str, object]
    created_at: datetime
    updated_at: datetime


class QuestionItemPage(BaseModel):
    items: list[QuestionItemResponse]
    total: int
    next_cursor: str | None


class ExternalResourceCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    url: HttpUrl
    provider: str | None = Field(default=None, max_length=120)
    description: str | None = Field(default=None, max_length=5000)
    knowledge_point_ids: list[UUID] = Field(default_factory=list, max_length=20)
    metadata_json: dict[str, object] = Field(default_factory=dict)

    @field_validator("title")
    @classmethod
    def normalize_title(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("title must not be blank")
        return normalized


class ExternalResourceUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    url: HttpUrl | None = None
    provider: str | None = Field(default=None, max_length=120)
    description: str | None = Field(default=None, max_length=5000)
    knowledge_point_ids: list[UUID] | None = Field(default=None, max_length=20)
    check_status: ExternalResourceStatus | None = None
    metadata_json: dict[str, object] | None = None

    @model_validator(mode="after")
    def require_change(self) -> "ExternalResourceUpdate":
        if not self.model_fields_set:
            raise ValueError("at least one external resource field must be provided")
        for field in (
            "title",
            "url",
            "knowledge_point_ids",
            "check_status",
            "metadata_json",
        ):
            if field in self.model_fields_set and getattr(self, field) is None:
                raise ValueError(f"{field} must not be null")
        return self


class ExternalResourceResponse(BaseModel):
    id: UUID
    course_id: UUID
    title: str
    url: str
    provider: str | None
    description: str | None
    knowledge_point_ids: list[UUID] = Field(default_factory=list)
    check_status: ExternalResourceStatus
    last_verified_at: datetime | None
    metadata_json: dict[str, object]
    created_at: datetime
    updated_at: datetime


class ExternalResourcePage(BaseModel):
    items: list[ExternalResourceResponse]
    total: int
    next_cursor: str | None


ResourceItemType = Literal[
    "document",
    "chapter",
    "knowledge_point",
    "question_item",
    "external_resource",
]


class ResourceListItem(BaseModel):
    id: UUID
    course_id: UUID
    item_type: ResourceItemType
    title: str
    resource_type: ResourceType | str | None = None
    trashed_at: datetime | None
    created_at: datetime
    updated_at: datetime


class ResourceListPage(BaseModel):
    items: list[ResourceListItem]
    total: int
    next_cursor: str | None


class PermanentDeleteResponse(BaseModel):
    id: UUID
    item_type: ResourceItemType
    affected_reference_count: int
    deleted: bool


class KnowledgeGraphNode(BaseModel):
    id: UUID
    type: Literal["course", "chapter", "knowledge_point", "resource"]
    label: str
    parent_id: UUID | None
    metadata: dict[str, object] = Field(default_factory=dict)


class KnowledgeGraphEdge(BaseModel):
    id: str
    source: UUID
    target: UUID
    type: Literal["contains", "prerequisite", "related", "assessed_by", "sourced_from"]
    weight: float = 1.0
    evidence_count: int = 0


class KnowledgeGraphResponse(BaseModel):
    nodes: list[KnowledgeGraphNode]
    edges: list[KnowledgeGraphEdge]
    scope: Literal[
        "overview",
        "document",
        "chapter",
        "point",
        "full",
    ] = "full"
    focus_id: UUID | None = None
    total_nodes: int = 0
    returned_nodes: int = 0
    has_more: bool = False
    truncated: bool = False


class DocumentIndexStatusResponse(BaseModel):
    document_id: UUID
    status: str
    pages_total: int
    pages_parsed: int
    chunks_total: int
    chunks_embedded: int
    last_indexed_at: datetime | None
    error: str | None


class DocumentCitationItem(BaseModel):
    id: UUID
    message_id: UUID
    conversation_id: UUID
    student_id: UUID
    citation_index: int
    document_id: UUID | None
    chunk_id: UUID | None
    page_start: int
    page_end: int
    quote: str
    created_at: datetime


class DocumentCitationPage(BaseModel):
    items: list[DocumentCitationItem]
    total: int
    next_cursor: str | None


class DocumentPageBlock(BaseModel):
    chunk_id: UUID
    text: str
    bbox: list[float] | None = None


class DocumentPageEvidenceResponse(BaseModel):
    page_number: int
    width: int | None
    height: int | None
    text: str
    blocks: list[DocumentPageBlock]
