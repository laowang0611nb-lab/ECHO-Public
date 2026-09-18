from datetime import datetime
from uuid import UUID

from database.models.document import DocumentStatus
from pydantic import BaseModel, ConfigDict


class DocumentResponse(BaseModel):
    id: UUID
    course_id: UUID
    uploaded_by: UUID
    original_name: str
    content_type: str
    size_bytes: int
    status: DocumentStatus
    page_count: int | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
