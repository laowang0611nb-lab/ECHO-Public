from collections import defaultdict
from uuid import UUID

from database.models.course import Course
from database.models.document import Document
from database.models.knowledge import Chapter, KnowledgePoint, KnowledgeRelation
from database.models.learning import LearningEvent
from database.models.resource import ExternalResource, QuestionItem
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.schemas.teacher_resources import (
    KnowledgeGraphEdge,
    KnowledgeGraphNode,
    KnowledgeGraphResponse,
)
from app.services.teacher_access import TeacherContentNotFoundError, ensure_teacher


def _normalize_relation_type(relation_type: str) -> str:
    if relation_type in {"prerequisite", "prerequisite_of"}:
        return "prerequisite"
    if relation_type in {"related", "related_to", "applied_in"}:
        # applied_in keeps the current compatible projection without expanding the shared enum.
        return "related"
    return "related"


def _edge(
    edge_type: str,
    source: UUID,
    target: UUID,
    *,
    evidence_count: int = 0,
) -> KnowledgeGraphEdge:
    return KnowledgeGraphEdge(
        id=f"{edge_type}:{source}:{target}",
        source=source,
        target=target,
        type=edge_type,
        evidence_count=evidence_count,
    )


async def get_knowledge_graph(
    session: AsyncSession,
    course_id: UUID,
    requester_id: UUID,
    *,
    chapter_id: UUID | None,
    point_id: UUID | None,
) -> KnowledgeGraphResponse:
    await ensure_teacher(session, course_id, requester_id)
    course = await session.get(Course, course_id)
    if course is None:
        raise TeacherContentNotFoundError
    chapters = list(
        await session.scalars(
            select(Chapter)
            .join(Document, Document.id == Chapter.document_id)
            .where(
                Chapter.course_id == course_id,
                Chapter.trashed_at.is_(None),
                Document.trashed_at.is_(None),
            )
            .order_by(Chapter.order_index, Chapter.id)
        )
    )
    points = list(
        await session.scalars(
            select(KnowledgePoint)
            .join(Chapter, Chapter.id == KnowledgePoint.chapter_id)
            .join(Document, Document.id == Chapter.document_id)
            .where(
                KnowledgePoint.course_id == course_id,
                KnowledgePoint.trashed_at.is_(None),
                Chapter.trashed_at.is_(None),
                Document.trashed_at.is_(None),
            )
        )
    )
    points_by_chapter: dict[UUID, list[KnowledgePoint]] = defaultdict(list)
    for point in points:
        points_by_chapter[point.chapter_id].append(point)
    relations = list(
        await session.scalars(
            select(KnowledgeRelation).where(KnowledgeRelation.course_id == course_id)
        )
    )
    question_items = list(
        await session.scalars(
            select(QuestionItem)
            .options(selectinload(QuestionItem.knowledge_points))
            .where(
                QuestionItem.course_id == course_id,
                QuestionItem.trashed_at.is_(None),
            )
        )
    )
    external_resources = list(
        await session.scalars(
            select(ExternalResource)
            .options(selectinload(ExternalResource.knowledge_points))
            .where(
                ExternalResource.course_id == course_id,
                ExternalResource.trashed_at.is_(None),
            )
        )
    )
    documents = list(
        await session.scalars(
            select(Document).where(
                Document.course_id == course_id,
                Document.trashed_at.is_(None),
            )
        )
    )

    nodes: dict[UUID, KnowledgeGraphNode] = {
        course.id: KnowledgeGraphNode(
            id=course.id,
            type="course",
            label=course.name,
            parent_id=None,
        )
    }
    edges: list[KnowledgeGraphEdge] = []
    for chapter in chapters:
        nodes[chapter.id] = KnowledgeGraphNode(
            id=chapter.id,
            type="chapter",
            label=chapter.title,
            parent_id=course.id,
            metadata={"document_id": str(chapter.document_id)},
        )
        edges.append(_edge("contains", course.id, chapter.id))
        for point in points_by_chapter.get(chapter.id, []):
            nodes[point.id] = KnowledgeGraphNode(
                id=point.id,
                type="knowledge_point",
                label=point.name,
                parent_id=chapter.id,
            )
            edges.append(_edge("contains", chapter.id, point.id))

    event_counts_rows = await session.execute(
        select(
            LearningEvent.knowledge_point_id,
            func.count(LearningEvent.id),
        )
        .where(
            LearningEvent.course_id == course_id,
            LearningEvent.knowledge_point_id.is_not(None),
        )
        .group_by(LearningEvent.knowledge_point_id)
    )
    event_counts = {
        point_id: int(count) for point_id, count in event_counts_rows.all() if point_id is not None
    }
    for relation in relations:
        if (
            relation.source_knowledge_point_id not in nodes
            or relation.target_knowledge_point_id not in nodes
        ):
            continue
        relation_type = _normalize_relation_type(relation.relation_type)
        edges.append(
            _edge(
                relation_type,
                relation.source_knowledge_point_id,
                relation.target_knowledge_point_id,
                evidence_count=event_counts.get(
                    relation.source_knowledge_point_id,
                    0,
                ),
            )
        )

    for document in documents:
        nodes[document.id] = KnowledgeGraphNode(
            id=document.id,
            type="resource",
            label=document.display_name or document.original_name,
            parent_id=course.id,
            metadata={
                "resource_type": document.resource_type.value,
                "document_id": str(document.id),
            },
        )
        source_chapters = [chapter for chapter in chapters if chapter.document_id == document.id]
        for chapter in source_chapters:
            edges.append(_edge("sourced_from", chapter.id, document.id))

    for item in question_items:
        nodes[item.id] = KnowledgeGraphNode(
            id=item.id,
            type="resource",
            label=item.title,
            parent_id=course.id,
            metadata={"resource_type": "question_item", "item_type": item.type.value},
        )
        for point in item.knowledge_points:
            if point.id in nodes:
                edges.append(
                    _edge(
                        "assessed_by",
                        point.id,
                        item.id,
                        evidence_count=event_counts.get(point.id, 0),
                    )
                )

    for resource in external_resources:
        nodes[resource.id] = KnowledgeGraphNode(
            id=resource.id,
            type="resource",
            label=resource.title,
            parent_id=course.id,
            metadata={
                "resource_type": "external_resource",
                "url": resource.url,
                "check_status": resource.check_status.value,
            },
        )
        for point in resource.knowledge_points:
            if point.id in nodes:
                edges.append(
                    _edge(
                        "assessed_by",
                        point.id,
                        resource.id,
                        evidence_count=event_counts.get(point.id, 0),
                    )
                )

    selected_ids: set[UUID] | None = None
    if point_id is not None:
        if point_id not in nodes:
            raise TeacherContentNotFoundError
        selected_ids = {course.id, point_id}
        selected_ids.update(
            edge.source for edge in edges if edge.target == point_id or edge.source == point_id
        )
        selected_ids.update(
            edge.target for edge in edges if edge.target == point_id or edge.source == point_id
        )
    elif chapter_id is not None:
        if chapter_id not in nodes:
            raise TeacherContentNotFoundError
        selected_ids = {course.id, chapter_id}
        selected_ids.update(edge.target for edge in edges if edge.source == chapter_id)
    if selected_ids is not None:
        nodes = {node_id: node for node_id, node in nodes.items() if node_id in selected_ids}
        edges = [edge for edge in edges if edge.source in nodes and edge.target in nodes]
    return KnowledgeGraphResponse(
        nodes=list(nodes.values()),
        edges=edges,
    )
