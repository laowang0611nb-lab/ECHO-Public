from datetime import UTC, datetime
from uuid import UUID

from database.models.resource import (
    ExternalResource,
    ExternalResourceStatus,
    external_resource_knowledge_points,
)
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.teacher_resources import (
    ExternalResourceCreate,
    ExternalResourcePage,
    ExternalResourceResponse,
    ExternalResourceUpdate,
)
from app.services.teacher_access import (
    TeacherContentNotFoundError,
    decode_cursor,
    encode_cursor,
    ensure_teacher,
    load_course_knowledge_points,
)


def _external_response(resource: ExternalResource) -> ExternalResourceResponse:
    return ExternalResourceResponse(
        id=resource.id,
        course_id=resource.course_id,
        title=resource.title,
        url=resource.url,
        provider=resource.provider,
        description=resource.description,
        knowledge_point_ids=sorted(
            {point.id for point in resource.knowledge_points},
            key=str,
        ),
        check_status=resource.check_status,
        last_verified_at=resource.last_verified_at,
        metadata_json=resource.metadata_json,
        created_at=resource.created_at,
        updated_at=resource.updated_at,
    )


async def _load_external_resource(
    session: AsyncSession,
    course_id: UUID,
    resource_id: UUID,
) -> ExternalResource | None:
    resource = await session.scalar(
        select(ExternalResource).where(
            ExternalResource.id == resource_id,
            ExternalResource.course_id == course_id,
            ExternalResource.trashed_at.is_(None),
        )
    )
    if resource is not None:
        await session.refresh(resource, attribute_names=["knowledge_points"])
    return resource


async def create_external_resource(
    session: AsyncSession,
    course_id: UUID,
    requester_id: UUID,
    payload: ExternalResourceCreate,
) -> ExternalResourceResponse:
    await ensure_teacher(session, course_id, requester_id)
    points = await load_course_knowledge_points(
        session,
        course_id,
        payload.knowledge_point_ids,
    )
    resource = ExternalResource(
        course_id=course_id,
        title=payload.title,
        url=str(payload.url),
        provider=payload.provider,
        description=payload.description,
        metadata_json=payload.metadata_json,
        created_by=requester_id,
    )
    resource.knowledge_points = points
    session.add(resource)
    await session.commit()
    loaded = await _load_external_resource(session, course_id, resource.id)
    if loaded is None:
        raise TeacherContentNotFoundError
    return _external_response(loaded)


async def get_external_resource(
    session: AsyncSession,
    course_id: UUID,
    resource_id: UUID,
    requester_id: UUID,
) -> ExternalResourceResponse:
    await ensure_teacher(session, course_id, requester_id)
    resource = await _load_external_resource(session, course_id, resource_id)
    if resource is None:
        raise TeacherContentNotFoundError
    return _external_response(resource)


async def list_external_resources(
    session: AsyncSession,
    course_id: UUID,
    requester_id: UUID,
    *,
    knowledge_point_id: UUID | None,
    status: ExternalResourceStatus | None,
    cursor: str | None,
    limit: int,
) -> ExternalResourcePage:
    await ensure_teacher(session, course_id, requester_id)
    statement = select(ExternalResource).where(
        ExternalResource.course_id == course_id,
        ExternalResource.trashed_at.is_(None),
    )
    if knowledge_point_id is not None:
        statement = statement.where(
            ExternalResource.id.in_(
                select(external_resource_knowledge_points.c.external_resource_id).where(
                    external_resource_knowledge_points.c.knowledge_point_id == knowledge_point_id
                )
            )
        )
    if status is not None:
        statement = statement.where(ExternalResource.check_status == status)
    total = int(await session.scalar(select(func.count()).select_from(statement.subquery())) or 0)
    offset = decode_cursor(cursor)
    resources = list(
        await session.scalars(
            statement.order_by(
                ExternalResource.created_at.desc(),
                ExternalResource.id.desc(),
            )
            .offset(offset)
            .limit(limit)
        )
    )
    for resource in resources:
        await session.refresh(resource, attribute_names=["knowledge_points"])
    next_cursor = encode_cursor(offset + limit) if offset + limit < total else None
    return ExternalResourcePage(
        items=[_external_response(resource) for resource in resources],
        total=total,
        next_cursor=next_cursor,
    )


async def update_external_resource(
    session: AsyncSession,
    course_id: UUID,
    resource_id: UUID,
    requester_id: UUID,
    payload: ExternalResourceUpdate,
) -> ExternalResourceResponse:
    await ensure_teacher(session, course_id, requester_id)
    resource = await _load_external_resource(session, course_id, resource_id)
    if resource is None:
        raise TeacherContentNotFoundError
    if "knowledge_point_ids" in payload.model_fields_set:
        resource.knowledge_points = await load_course_knowledge_points(
            session,
            course_id,
            payload.knowledge_point_ids or [],
        )
    for field in (
        "title",
        "provider",
        "description",
        "check_status",
        "metadata_json",
    ):
        if field in payload.model_fields_set:
            setattr(resource, field, getattr(payload, field))
    if "url" in payload.model_fields_set and payload.url is not None:
        resource.url = str(payload.url)
    if "check_status" in payload.model_fields_set:
        resource.last_verified_at = datetime.now(UTC)
    await session.commit()
    loaded = await _load_external_resource(session, course_id, resource.id)
    if loaded is None:
        raise TeacherContentNotFoundError
    return _external_response(loaded)


async def delete_external_resource(
    session: AsyncSession,
    course_id: UUID,
    resource_id: UUID,
    requester_id: UUID,
) -> None:
    await ensure_teacher(session, course_id, requester_id)
    resource = await _load_external_resource(session, course_id, resource_id)
    if resource is None:
        raise TeacherContentNotFoundError
    resource.trashed_at = datetime.now(UTC)
    await session.commit()
