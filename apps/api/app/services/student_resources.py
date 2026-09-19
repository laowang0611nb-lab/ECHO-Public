from datetime import UTC, datetime
from uuid import UUID

from database.models.chat import Conversation
from database.models.course import CourseMember
from database.models.document import Document
from database.models.knowledge import Chapter, KnowledgeChunk
from database.models.learning import LearningEvent, LearningEventType
from database.models.planning import (
    ExecutionPlan,
    ExecutionPlanStatus,
    PlanTargetScope,
    PlanTask,
    PlanTaskStatus,
    plan_target_students,
    plan_task_target_students,
)
from database.models.resource import ExternalResource, ExternalResourceStatus
from database.models.user import User, UserRole
from sqlalchemy import exists, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.schemas.student_learning import (
    KnowledgePointSourceItem,
    KnowledgePointSourcePage,
    StudentConversationPage,
    StudentConversationSummary,
    StudentPlanTaskItem,
    StudentPlanTaskPage,
    StudentResourceItem,
    StudentResourcePage,
    StudentTeacherListResponse,
    StudentTeacherSummary,
)
from app.services.course import get_course_for_member
from app.services.student_learning import (
    _active_knowledge_point,
    ensure_student_learning_access,
)

COMPLETED_EVENT_TYPES = {
    LearningEventType.QUIZ_CORRECT,
    LearningEventType.RESOLVED,
    LearningEventType.TEACHER_ADJUSTMENT,
}


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


async def list_student_course_resources(
    session: AsyncSession,
    course_id: UUID,
    requester_id: UUID,
) -> StudentResourcePage:
    await get_course_for_member(session, course_id, requester_id)
    documents = list(
        await session.scalars(
            select(Document)
            .where(
                Document.course_id == course_id,
                Document.trashed_at.is_(None),
            )
            .order_by(Document.updated_at.desc(), Document.id.desc())
        )
    )
    external_resources = list(
        await session.scalars(
            select(ExternalResource)
            .where(
                ExternalResource.course_id == course_id,
                ExternalResource.trashed_at.is_(None),
            )
            .order_by(ExternalResource.updated_at.desc(), ExternalResource.id.desc())
        )
    )
    items: list[StudentResourceItem] = []
    for document in documents:
        chapter_title = await session.scalar(
            select(Chapter.title)
            .where(
                Chapter.document_id == document.id,
                Chapter.trashed_at.is_(None),
            )
            .order_by(Chapter.order_index)
            .limit(1)
        )
        items.append(
            StudentResourceItem(
                id=document.id,
                title=document.display_name or document.original_name,
                resource_type=document.resource_type.value,
                status=document.status.value,
                summary=document.summary,
                chapter_title=chapter_title,
                mime_type=document.content_type,
                page_count=document.page_count,
                external_url=None,
                available=document.status.value == "ready",
                updated_at=document.updated_at,
            )
        )
    for resource in external_resources:
        items.append(
            StudentResourceItem(
                id=resource.id,
                title=resource.title,
                resource_type="external_link",
                status=resource.check_status.value,
                summary=resource.description,
                chapter_title=None,
                mime_type="text/uri-list",
                page_count=None,
                external_url=resource.url,
                available=resource.check_status != ExternalResourceStatus.INVALID,
                updated_at=resource.updated_at,
            )
        )
    items.sort(key=lambda item: item.updated_at, reverse=True)
    return StudentResourcePage(items=items, total=len(items))


async def list_student_knowledge_point_sources(
    session: AsyncSession,
    course_id: UUID,
    knowledge_point_id: UUID,
    requester_id: UUID,
) -> KnowledgePointSourcePage:
    await get_course_for_member(session, course_id, requester_id)
    point = await _active_knowledge_point(session, course_id, knowledge_point_id)
    rows = (
        await session.execute(
            select(KnowledgeChunk, Document, Chapter)
            .join(Document, Document.id == KnowledgeChunk.document_id)
            .join(Chapter, Chapter.id == KnowledgeChunk.chapter_id)
            .where(
                KnowledgeChunk.course_id == course_id,
                KnowledgeChunk.chapter_id == point.chapter_id,
                Document.trashed_at.is_(None),
                Chapter.trashed_at.is_(None),
            )
            .order_by(KnowledgeChunk.chunk_index)
            .limit(20)
        )
    ).all()
    items = [
        KnowledgePointSourceItem(
            document_id=document.id,
            document_name=document.display_name or document.original_name,
            chapter_id=chapter.id,
            chapter_title=chapter.title,
            chunk_id=chunk.id,
            page_start=chunk.page_start,
            page_end=chunk.page_end,
            quote=chunk.content,
        )
        for chunk, document, chapter in rows
    ]
    return KnowledgePointSourcePage(
        knowledge_point_id=point.id,
        knowledge_point_name=point.name,
        items=items,
        total=len(items),
    )


async def list_student_related_conversations(
    session: AsyncSession,
    course_id: UUID,
    student_id: UUID,
    requester_id: UUID,
    knowledge_point_id: UUID,
    *,
    limit: int,
) -> StudentConversationPage:
    await ensure_student_learning_access(session, course_id, student_id, requester_id)
    await _active_knowledge_point(session, course_id, knowledge_point_id)
    events = list(
        await session.scalars(
            select(LearningEvent)
            .where(
                LearningEvent.course_id == course_id,
                LearningEvent.user_id == student_id,
                LearningEvent.knowledge_point_id == knowledge_point_id,
                LearningEvent.conversation_id.is_not(None),
            )
            .order_by(LearningEvent.created_at.desc(), LearningEvent.id.desc())
            .limit(500)
        )
    )
    grouped: dict[UUID, list[LearningEvent]] = {}
    for event in events:
        if event.conversation_id is not None:
            grouped.setdefault(event.conversation_id, []).append(event)
    conversation_ids = list(grouped)[:limit]
    conversations = (
        list(
            await session.scalars(select(Conversation).where(Conversation.id.in_(conversation_ids)))
        )
        if conversation_ids
        else []
    )
    conversation_by_id = {conversation.id: conversation for conversation in conversations}
    items = []
    for conversation_id in conversation_ids:
        conversation = conversation_by_id.get(conversation_id)
        matching_events = grouped[conversation_id]
        latest = matching_events[0]
        if conversation is None or latest.message_id is None:
            continue
        items.append(
            StudentConversationSummary(
                id=conversation.id,
                title=conversation.title,
                created_at=conversation.created_at,
                updated_at=conversation.updated_at,
                matching_message_count=len(
                    {event.message_id for event in matching_events if event.message_id}
                ),
                latest_matching_message_id=latest.message_id,
                latest_matching_at=latest.created_at,
            )
        )
    return StudentConversationPage(items=items, total=len(items))


async def list_course_teachers_for_student(
    session: AsyncSession,
    course_id: UUID,
    requester_id: UUID,
) -> StudentTeacherListResponse:
    await get_course_for_member(session, course_id, requester_id)
    rows = (
        await session.execute(
            select(User)
            .join(CourseMember, CourseMember.user_id == User.id)
            .where(
                CourseMember.course_id == course_id,
                CourseMember.role == UserRole.TEACHER,
            )
            .order_by(User.display_name, User.id)
        )
    ).scalars()
    return StudentTeacherListResponse(
        course_id=course_id,
        teachers=[
            StudentTeacherSummary(
                user_id=user.id,
                display_name=user.display_name,
                avatar_url=user.avatar_url,
            )
            for user in rows
        ],
    )


async def list_student_plan_tasks(
    session: AsyncSession,
    course_id: UUID,
    student_id: UUID,
    requester_id: UUID,
) -> StudentPlanTaskPage:
    await ensure_student_learning_access(session, course_id, student_id, requester_id)
    plan_target_exists = exists().where(
        plan_target_students.c.plan_id == ExecutionPlan.id,
        plan_target_students.c.user_id == student_id,
    )
    task_target_exists = exists().where(
        plan_task_target_students.c.task_id == PlanTask.id,
        plan_task_target_students.c.user_id == student_id,
    )
    any_task_target = exists().where(plan_task_target_students.c.task_id == PlanTask.id)
    tasks = list(
        await session.scalars(
            select(PlanTask)
            .options(selectinload(PlanTask.knowledge_points))
            .join(ExecutionPlan, ExecutionPlan.id == PlanTask.plan_id)
            .where(
                ExecutionPlan.course_id == course_id,
                PlanTask.status != PlanTaskStatus.CANCELLED,
                ExecutionPlan.status.in_([ExecutionPlanStatus.ACTIVE, ExecutionPlanStatus.PAUSED]),
                or_(
                    ExecutionPlan.target_scope == PlanTargetScope.WHOLE_CLASS,
                    plan_target_exists,
                ),
                or_(~any_task_target, task_target_exists),
            )
            .order_by(
                PlanTask.week_number,
                PlanTask.order_index,
                PlanTask.due_at,
                PlanTask.id,
            )
        )
    )
    task_ids = [task.id for task in tasks]
    completion_events = (
        list(
            await session.scalars(
                select(LearningEvent)
                .where(
                    LearningEvent.user_id == student_id,
                    LearningEvent.task_id.in_(task_ids),
                    LearningEvent.event_type.in_(COMPLETED_EVENT_TYPES),
                )
                .order_by(LearningEvent.created_at.desc(), LearningEvent.id.desc())
            )
        )
        if task_ids
        else []
    )
    completion_by_task: dict[UUID, LearningEvent] = {}
    for event in completion_events:
        if event.task_id is not None:
            completion_by_task.setdefault(event.task_id, event)
    plan_titles = (
        dict(
            (
                await session.execute(
                    select(ExecutionPlan.id, ExecutionPlan.title).where(
                        ExecutionPlan.id.in_({task.plan_id for task in tasks})
                    )
                )
            ).all()
        )
        if tasks
        else {}
    )
    now = datetime.now(UTC)
    items: list[StudentPlanTaskItem] = []
    for task in tasks:
        status = task.status
        if (
            task.due_at is not None
            and _as_utc(task.due_at) < now
            and status in {PlanTaskStatus.NOT_STARTED, PlanTaskStatus.IN_PROGRESS}
        ):
            status = PlanTaskStatus.OVERDUE
        completed_event = completion_by_task.get(task.id)
        items.append(
            StudentPlanTaskItem(
                id=task.id,
                plan_id=task.plan_id,
                plan_title=plan_titles[task.plan_id],
                week_number=task.week_number,
                title=task.title,
                description=task.description,
                task_type=task.type.value,
                status=status.value,
                due_at=task.due_at,
                knowledge_point_ids=[point.id for point in task.knowledge_points],
                resources=task.resources_json,
                completed_at=completed_event.created_at if completed_event else None,
                completion_evidence=(
                    completed_event.evidence or completed_event.event_type.value
                    if completed_event
                    else None
                ),
            )
        )
    return StudentPlanTaskPage(items=items, total=len(items))
