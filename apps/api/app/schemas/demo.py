from datetime import datetime

from pydantic import BaseModel


class DemoDatasetStatus(BaseModel):
    available: bool
    seeded: bool
    isolated: bool
    namespace: str
    dataset_tag: str = "demo"
    course_id: str | None
    course_name: str | None
    course_code: str | None
    student_count: int
    knowledge_point_count: int
    learning_event_count: int
    review_count: int
    strategy_count: int
    plan_count: int
    strategy_id: str | None
    student_id: str | None
    plan_id: str | None
    plan_task_id: str | None
    review_id: str | None
    message_id: str | None
    conversation_id: str | None
    knowledge_point_id: str | None
    resource_id: str | None
    checked_at: datetime
