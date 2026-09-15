from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class KnowledgePointDraft(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=2000)

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("knowledge point name must not be blank")
        return normalized


class ChapterDraft(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    summary: str | None = Field(default=None, max_length=2000)
    knowledge_points: list[KnowledgePointDraft] = Field(default_factory=list)

    @field_validator("title")
    @classmethod
    def normalize_title(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("chapter title must not be blank")
        return normalized

    @model_validator(mode="after")
    def deduplicate_knowledge_points(self) -> "ChapterDraft":
        unique_points: list[KnowledgePointDraft] = []
        seen_names: set[str] = set()
        for point in self.knowledge_points:
            key = point.name.casefold()
            if key in seen_names:
                continue
            seen_names.add(key)
            unique_points.append(point)
        self.knowledge_points = unique_points
        return self


class ChapterCreate(BaseModel):
    title: str = Field(min_length=1, max_length=255)
    summary: str | None = Field(default=None, max_length=2000)
    order_index: int | None = Field(default=None, ge=0)

    @field_validator("title")
    @classmethod
    def normalize_title(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("chapter title must not be blank")
        return normalized


class ChapterUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    summary: str | None = Field(default=None, max_length=2000)
    order_index: int | None = Field(default=None, ge=0)

    @field_validator("title")
    @classmethod
    def normalize_title(cls, value: str | None) -> str | None:
        if value is None:
            raise ValueError("chapter title must not be null")
        normalized = value.strip()
        if not normalized:
            raise ValueError("chapter title must not be blank")
        return normalized

    @model_validator(mode="after")
    def require_change(self) -> "ChapterUpdate":
        if not self.model_fields_set:
            raise ValueError("at least one chapter field must be provided")
        if "order_index" in self.model_fields_set and self.order_index is None:
            raise ValueError("order_index must not be null")
        return self


class KnowledgePointCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=2000)
    order_index: int | None = Field(default=None, ge=0)

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("knowledge point name must not be blank")
        return normalized


class KnowledgePointUpdate(BaseModel):
    chapter_id: UUID | None = None
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=2000)
    order_index: int | None = Field(default=None, ge=0)

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str | None) -> str | None:
        if value is None:
            raise ValueError("knowledge point name must not be null")
        normalized = value.strip()
        if not normalized:
            raise ValueError("knowledge point name must not be blank")
        return normalized

    @model_validator(mode="after")
    def require_change(self) -> "KnowledgePointUpdate":
        if not self.model_fields_set:
            raise ValueError("at least one knowledge point field must be provided")
        if "chapter_id" in self.model_fields_set and self.chapter_id is None:
            raise ValueError("chapter_id must not be null")
        if "order_index" in self.model_fields_set and self.order_index is None:
            raise ValueError("order_index must not be null")
        return self


class KnowledgePointResponse(KnowledgePointDraft):
    id: UUID
    course_id: UUID
    chapter_id: UUID
    order_index: int

    model_config = ConfigDict(from_attributes=True)


class ChapterResponse(ChapterDraft):
    id: UUID
    course_id: UUID
    document_id: UUID
    order_index: int
    knowledge_points: list[KnowledgePointResponse]

    model_config = ConfigDict(from_attributes=True)
