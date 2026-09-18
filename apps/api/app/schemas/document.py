from datetime import datetime
from uuid import UUID

from database.models.document import DocumentStatus, ResourceType
from pydantic import BaseModel, ConfigDict


class DocumentResponse(BaseModel):
    id: UUID
    course_id: UUID
    uploaded_by: UUID
    original_name: str
    content_type: str
    size_bytes: int
    status: DocumentStatus
    resource_type: ResourceType
    page_count: int | None
    trashed_at: datetime | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
