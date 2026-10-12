from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class KnowledgeGraphEmbedSessionResponse(BaseModel):
    ticket: str
    expires_in_seconds: int


class KnowledgeGraphEmbedExchangeRequest(BaseModel):
    ticket: str = Field(min_length=32, max_length=512)
    course_id: UUID = Field(alias="courseId")

    model_config = ConfigDict(populate_by_name=True)


class KnowledgeGraphEmbedAccessTokenResponse(BaseModel):
    access_token: str
    token_type: Literal["Bearer"] = "Bearer"
    expires_in_seconds: int
    course_id: UUID
