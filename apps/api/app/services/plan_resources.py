from uuid import UUID

from database.models.course import CourseMember
from database.models.document import Document
from database.models.knowledge import Chapter, KnowledgePoint
from database.models.resource import ExternalResource, QuestionItem
from database.models.user import User, UserRole
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.planning import ResourceReference
from app.services.teacher_access import TeacherContentNotFoundError


async def list_course_students(
    session: AsyncSession,
    course_id: UUID,
) -> list[User]:
    students = list(
        await session.scalars(
            select(User)
            .join(CourseMember, CourseMember.user_id == User.id)
            .where(
                CourseMember.course_id == course_id,
                CourseMember.role == UserRole.STUDENT,
            )
            .order_by(User.display_name, User.id)
        )
    )
    return students


async def load_course_students(
    session: AsyncSession,
    course_id: UUID,
    student_ids: list[UUID],
) -> list[User]:
    unique_ids = list(dict.fromkeys(student_ids))
    if not unique_ids:
        return []
    students = list(
        await session.scalars(
            select(User)
            .join(CourseMember, CourseMember.user_id == User.id)
            .where(
                User.id.in_(unique_ids),
                CourseMember.course_id == course_id,
                CourseMember.role == UserRole.STUDENT,
            )
        )
    )
    by_id = {student.id: student for student in students}
    if len(by_id) != len(unique_ids):
        raise TeacherContentNotFoundError
    return [by_id[student_id] for student_id in unique_ids]


async def resolve_resource_references(
    session: AsyncSession,
    course_id: UUID,
    resource_ids: list[UUID],
) -> list[ResourceReference]:
    unique_ids = list(dict.fromkeys(resource_ids))
    if not unique_ids:
        return []

    references: dict[UUID, ResourceReference] = {}

    documents = list(
        await session.scalars(
            select(Document).where(
                Document.id.in_(unique_ids),
                Document.course_id == course_id,
                Document.trashed_at.is_(None),
            )
        )
    )
    for document in documents:
        references[document.id] = ResourceReference(
            id=document.id,
            title=document.display_name or document.original_name,
            resource_type=document.resource_type.value,
        )

    chapters = list(
        await session.scalars(
            select(Chapter)
            .join(Document, Document.id == Chapter.document_id)
            .where(
                Chapter.id.in_(unique_ids),
                Chapter.course_id == course_id,
                Chapter.trashed_at.is_(None),
                Document.trashed_at.is_(None),
            )
        )
    )
    for chapter in chapters:
        references[chapter.id] = ResourceReference(
            id=chapter.id,
            title=chapter.title,
            resource_type="chapter",
        )

    points = list(
        await session.scalars(
            select(KnowledgePoint)
            .join(Chapter, Chapter.id == KnowledgePoint.chapter_id)
            .join(Document, Document.id == Chapter.document_id)
            .where(
                KnowledgePoint.id.in_(unique_ids),
                KnowledgePoint.course_id == course_id,
                KnowledgePoint.trashed_at.is_(None),
                Chapter.trashed_at.is_(None),
                Document.trashed_at.is_(None),
            )
        )
    )
    for point in points:
        references[point.id] = ResourceReference(
            id=point.id,
            title=point.name,
            resource_type="knowledge_point",
        )

    question_items = list(
        await session.scalars(
            select(QuestionItem).where(
                QuestionItem.id.in_(unique_ids),
                QuestionItem.course_id == course_id,
                QuestionItem.trashed_at.is_(None),
            )
        )
    )
    for item in question_items:
        references[item.id] = ResourceReference(
            id=item.id,
            title=item.title,
            resource_type="question_bank",
        )

    external_resources = list(
        await session.scalars(
            select(ExternalResource).where(
                ExternalResource.id.in_(unique_ids),
                ExternalResource.course_id == course_id,
                ExternalResource.trashed_at.is_(None),
            )
        )
    )
    for resource in external_resources:
        references[resource.id] = ResourceReference(
            id=resource.id,
            title=resource.title,
            resource_type="external_link",
        )

    if len(references) != len(unique_ids):
        raise TeacherContentNotFoundError
    return [references[resource_id] for resource_id in unique_ids]


def resource_references_from_json(values: list[dict[str, object]]) -> list[ResourceReference]:
    return [ResourceReference.model_validate(value) for value in values]


def resource_json(values: list[ResourceReference]) -> list[dict[str, object]]:
    return [value.model_dump(mode="json") for value in values]
