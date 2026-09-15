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
