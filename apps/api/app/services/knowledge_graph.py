from collections import defaultdict, deque
from typing import Literal
from uuid import UUID

from database.models.course import Course
from database.models.document import Document
from database.models.knowledge import Chapter, KnowledgePoint, KnowledgeRelation
from database.models.learning import LearningEvent
from database.models.resource import ExternalResource, QuestionItem
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.schemas.teacher_resources import (
    KnowledgeGraphEdge,
    KnowledgeGraphNode,
    KnowledgeGraphResponse,
)
from app.services.teacher_access import TeacherContentNotFoundError, ensure_teacher

GraphScope = Literal["overview", "document", "chapter", "point", "full"]


def _normalize_relation_type(relation_type: str) -> str:
    if relation_type in {"prerequisite", "prerequisite_of"}:
        return "prerequisite"
    if relation_type in {"related", "related_to", "applied_in"}:
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


def _course_node(course: Course) -> KnowledgeGraphNode:
    return KnowledgeGraphNode(
        id=course.id,
        type="course",
        label=course.name,
        parent_id=None,
        metadata={},
    )


def _document_node(
    document: Document,
    *,
    course_id: UUID,
    chapter_count: int,
    knowledge_point_count: int,
) -> KnowledgeGraphNode:
    return KnowledgeGraphNode(
        id=document.id,
        type="resource",
        label=document.display_name or document.original_name,
        parent_id=course_id,
        metadata={
            "resource_type": document.resource_type.value,
            "document_id": str(document.id),
            "chapter_count": chapter_count,
            "knowledge_point_count": knowledge_point_count,
            "page_count": document.page_count,
            "original_name": document.original_name,
        },
    )


def _chapter_node(
    chapter: Chapter,
    *,
    course_id: UUID,
    document_id: UUID,
    point_count: int,
) -> KnowledgeGraphNode:
    return KnowledgeGraphNode(
        id=chapter.id,
        type="chapter",
        label=chapter.title,
        parent_id=document_id,
        metadata={
            "course_id": str(course_id),
            "document_id": str(document_id),
            "knowledge_point_count": point_count,
            "order_index": chapter.order_index,
        },
    )


def _point_node(point: KnowledgePoint, *, chapter_id: UUID) -> KnowledgeGraphNode:
    return KnowledgeGraphNode(
        id=point.id,
        type="knowledge_point",
        label=point.name,
        parent_id=chapter_id,
        metadata={
            "chapter_id": str(chapter_id),
            "order_index": point.order_index,
        },
    )


def _close_edges(
    nodes: dict[UUID, KnowledgeGraphNode],
    edges: list[KnowledgeGraphEdge],
) -> list[KnowledgeGraphEdge]:
    return [edge for edge in edges if edge.source in nodes and edge.target in nodes]


async def _event_counts(
    session: AsyncSession,
    course_id: UUID,
    point_ids: set[UUID] | None = None,
) -> dict[UUID, int]:
    statement = (
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
    if point_ids is not None:
        if not point_ids:
            return {}
        statement = statement.where(LearningEvent.knowledge_point_id.in_(point_ids))
    rows = await session.execute(statement)
    return {point_id: int(count) for point_id, count in rows.all() if point_id is not None}


async def _relations_for_course(
    session: AsyncSession,
    course_id: UUID,
) -> list[KnowledgeRelation]:
    return list(
        await session.scalars(
            select(KnowledgeRelation).where(KnowledgeRelation.course_id == course_id)
        )
    )


async def _point_resource_candidates(
    session: AsyncSession,
    course_id: UUID,
    selected_ids: set[UUID],
) -> list[tuple[KnowledgeGraphNode, list[UUID]]]:
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
    candidates: list[tuple[KnowledgeGraphNode, list[UUID]]] = []
    for item in question_items:
        linked_ids = [point.id for point in item.knowledge_points if point.id in selected_ids]
        if linked_ids:
            candidates.append(
                (
                    KnowledgeGraphNode(
                        id=item.id,
                        type="resource",
                        label=item.title,
                        parent_id=course_id,
                        metadata={
                            "resource_type": "question_item",
                            "item_type": item.type.value,
                        },
                    ),
                    linked_ids,
                )
            )
    for resource in external_resources:
        linked_ids = [point.id for point in resource.knowledge_points if point.id in selected_ids]
        if linked_ids:
            candidates.append(
                (
                    KnowledgeGraphNode(
                        id=resource.id,
                        type="resource",
                        label=resource.title,
                        parent_id=course_id,
                        metadata={
                            "resource_type": "external_resource",
                            "url": resource.url,
                            "check_status": resource.check_status.value,
                        },
                    ),
                    linked_ids,
                )
            )
    return candidates


async def _overview_graph(
    session: AsyncSession,
    course: Course,
    *,
    max_nodes: int,
) -> KnowledgeGraphResponse:
    rows = await session.execute(
        select(
            Document,
            func.count(func.distinct(Chapter.id)).label("chapter_count"),
            func.count(func.distinct(KnowledgePoint.id)).label("point_count"),
        )
        .outerjoin(
            Chapter,
            and_(
                Chapter.document_id == Document.id,
                Chapter.trashed_at.is_(None),
            ),
        )
        .outerjoin(
            KnowledgePoint,
            and_(
                KnowledgePoint.chapter_id == Chapter.id,
                KnowledgePoint.trashed_at.is_(None),
            ),
        )
        .where(
            Document.course_id == course.id,
            Document.trashed_at.is_(None),
        )
        .group_by(Document.id)
        .order_by(Document.created_at, Document.id)
    )
    documents = rows.all()
    total_nodes = 1 + len(documents)
    node_limit = max(1, max_nodes)
    nodes = {course.id: _course_node(course)}
    edges: list[KnowledgeGraphEdge] = []
    for document, chapter_count, point_count in documents:
        if len(nodes) >= node_limit:
            break
        nodes[document.id] = _document_node(
            document,
            course_id=course.id,
            chapter_count=int(chapter_count or 0),
            knowledge_point_count=int(point_count or 0),
        )
        edges.append(_edge("contains", course.id, document.id))
    return KnowledgeGraphResponse(
        nodes=list(nodes.values()),
        edges=_close_edges(nodes, edges),
        scope="overview",
        focus_id=course.id,
        total_nodes=total_nodes,
        returned_nodes=len(nodes),
        has_more=len(nodes) < total_nodes,
        truncated=len(nodes) < total_nodes,
    )


async def _document_graph(
    session: AsyncSession,
    course: Course,
    *,
    document_id: UUID,
    max_nodes: int,
) -> KnowledgeGraphResponse:
    document = await session.scalar(
        select(Document).where(
            Document.id == document_id,
            Document.course_id == course.id,
            Document.trashed_at.is_(None),
        )
    )
    if document is None:
        raise TeacherContentNotFoundError
    rows = await session.execute(
        select(
            Chapter,
            func.count(func.distinct(KnowledgePoint.id)).label("point_count"),
        )
        .outerjoin(
            KnowledgePoint,
            and_(
                KnowledgePoint.chapter_id == Chapter.id,
                KnowledgePoint.trashed_at.is_(None),
            ),
        )
        .where(
            Chapter.document_id == document.id,
            Chapter.trashed_at.is_(None),
        )
        .group_by(Chapter.id)
        .order_by(Chapter.order_index, Chapter.id)
    )
    chapters = rows.all()
    total_nodes = 2 + len(chapters)
    node_limit = max(2, max_nodes)
    nodes = {
        course.id: _course_node(course),
        document.id: _document_node(
            document,
            course_id=course.id,
            chapter_count=len(chapters),
            knowledge_point_count=sum(int(point_count or 0) for _, point_count in chapters),
        ),
    }
    edges = [_edge("contains", course.id, document.id)]
    for chapter, point_count in chapters:
        if len(nodes) >= node_limit:
            break
        nodes[chapter.id] = _chapter_node(
            chapter,
            course_id=course.id,
            document_id=document.id,
            point_count=int(point_count or 0),
        )
        edges.append(_edge("contains", document.id, chapter.id))
    return KnowledgeGraphResponse(
        nodes=list(nodes.values()),
        edges=_close_edges(nodes, edges),
        scope="document",
        focus_id=document.id,
        total_nodes=total_nodes,
        returned_nodes=len(nodes),
        has_more=len(nodes) < total_nodes,
        truncated=len(nodes) < total_nodes,
    )


async def _chapter_graph(
    session: AsyncSession,
    course: Course,
    *,
    chapter_id: UUID,
    max_nodes: int,
) -> KnowledgeGraphResponse:
    row = (
        await session.execute(
            select(Chapter, Document)
            .join(Document, Document.id == Chapter.document_id)
            .where(
                Chapter.id == chapter_id,
                Chapter.course_id == course.id,
                Chapter.trashed_at.is_(None),
                Document.trashed_at.is_(None),
            )
        )
    ).first()
    if row is None:
        raise TeacherContentNotFoundError
    chapter, document = row
    points = list(
        await session.scalars(
            select(KnowledgePoint)
            .where(
                KnowledgePoint.chapter_id == chapter.id,
                KnowledgePoint.course_id == course.id,
                KnowledgePoint.trashed_at.is_(None),
            )
            .order_by(KnowledgePoint.order_index, KnowledgePoint.id)
        )
    )
    total_nodes = 3 + len(points)
    node_limit = max(3, max_nodes)
    selected_points = points[: max(0, node_limit - 3)]
    selected_ids = {point.id for point in selected_points}
    nodes = {
        course.id: _course_node(course),
        document.id: _document_node(
            document,
            course_id=course.id,
            chapter_count=1,
            knowledge_point_count=len(points),
        ),
        chapter.id: _chapter_node(
            chapter,
            course_id=course.id,
            document_id=document.id,
            point_count=len(points),
        ),
    }
    for point in selected_points:
        nodes[point.id] = _point_node(point, chapter_id=chapter.id)
    edges = [
        _edge("contains", course.id, document.id),
        _edge("contains", document.id, chapter.id),
        *[_edge("contains", chapter.id, point.id) for point in selected_points],
    ]
    event_counts = await _event_counts(session, course.id, selected_ids)
    resource_candidates = await _point_resource_candidates(
        session,
        course.id,
        selected_ids,
    )
    for resource_node, linked_ids in resource_candidates:
        if len(nodes) >= max_nodes:
            break
        nodes[resource_node.id] = resource_node
        for point_id in linked_ids:
            edges.append(
                _edge(
                    "assessed_by",
                    point_id,
                    resource_node.id,
                    evidence_count=event_counts.get(point_id, 0),
                )
            )
    for relation in await _relations_for_course(session, course.id):
        source = relation.source_knowledge_point_id
        target = relation.target_knowledge_point_id
        if source not in selected_ids or target not in selected_ids:
            continue
        edges.append(
            _edge(
                _normalize_relation_type(relation.relation_type),
                source,
                target,
                evidence_count=event_counts.get(source, 0),
            )
        )
    total_nodes = 3 + len(points) + len(resource_candidates)
    return KnowledgeGraphResponse(
        nodes=list(nodes.values()),
        edges=_close_edges(nodes, edges),
        scope="chapter",
        focus_id=chapter.id,
        total_nodes=total_nodes,
        returned_nodes=len(nodes),
        has_more=len(nodes) < total_nodes,
        truncated=len(nodes) < total_nodes,
    )


async def _point_graph(
    session: AsyncSession,
    course: Course,
    *,
    point_id: UUID,
    depth: int,
    max_nodes: int,
) -> KnowledgeGraphResponse:
    row = (
        await session.execute(
            select(KnowledgePoint, Chapter, Document)
            .join(Chapter, Chapter.id == KnowledgePoint.chapter_id)
            .join(Document, Document.id == Chapter.document_id)
            .where(
                KnowledgePoint.id == point_id,
                KnowledgePoint.course_id == course.id,
                KnowledgePoint.trashed_at.is_(None),
                Chapter.trashed_at.is_(None),
                Document.trashed_at.is_(None),
            )
        )
    ).first()
    if row is None:
        raise TeacherContentNotFoundError
    focus_point, chapter, document = row
    visible_points = list(
        await session.scalars(
            select(KnowledgePoint)
            .join(Chapter, Chapter.id == KnowledgePoint.chapter_id)
            .join(Document, Document.id == Chapter.document_id)
            .where(
                KnowledgePoint.course_id == course.id,
                KnowledgePoint.trashed_at.is_(None),
                Chapter.trashed_at.is_(None),
                Document.trashed_at.is_(None),
            )
            .order_by(KnowledgePoint.order_index, KnowledgePoint.id)
        )
    )
    point_by_id = {point.id: point for point in visible_points}
    adjacency: dict[UUID, list[tuple[UUID, str]]] = defaultdict(list)
    for relation in await _relations_for_course(session, course.id):
        source = relation.source_knowledge_point_id
        target = relation.target_knowledge_point_id
        if source not in point_by_id or target not in point_by_id:
            continue
        relation_type = _normalize_relation_type(relation.relation_type)
        adjacency[source].append((target, relation_type))
        adjacency[target].append((source, relation_type))
    for neighbors in adjacency.values():
        neighbors.sort(key=lambda item: (item[1] != "prerequisite", str(item[0])))

    distance = {focus_point.id: 0}
    queue = deque([focus_point.id])
    reachable = [focus_point.id]
    while queue:
        current = queue.popleft()
        if distance[current] >= depth:
            continue
        for neighbor_id, _ in adjacency.get(current, []):
            if neighbor_id in distance:
                continue
            distance[neighbor_id] = distance[current] + 1
            reachable.append(neighbor_id)
            queue.append(neighbor_id)

    selected_limit = max(1, max_nodes - 3)
    selected_ids = set(reachable[:selected_limit])
    chapter_point_count = sum(1 for point in visible_points if point.chapter_id == chapter.id)
    nodes = {
        course.id: _course_node(course),
        document.id: _document_node(
            document,
            course_id=course.id,
            chapter_count=1,
            knowledge_point_count=chapter_point_count,
        ),
        chapter.id: _chapter_node(
            chapter,
            course_id=course.id,
            document_id=document.id,
            point_count=chapter_point_count,
        ),
    }
    for selected_id in reachable:
        if selected_id not in selected_ids:
            continue
        point = point_by_id[selected_id]
        nodes[selected_id] = _point_node(
            point,
            chapter_id=point.chapter_id,
        )

    edges = [
        _edge("contains", course.id, document.id),
        _edge("contains", document.id, chapter.id),
    ]
    for selected_id in selected_ids:
        point = point_by_id[selected_id]
        if point.chapter_id == chapter.id:
            edges.append(_edge("contains", chapter.id, point.id))

    event_counts = await _event_counts(session, course.id, selected_ids)
    resource_candidates = await _point_resource_candidates(
        session,
        course.id,
        selected_ids,
    )
    for resource_node, linked_ids in resource_candidates:
        if len(nodes) >= max_nodes:
            break
        nodes[resource_node.id] = resource_node
        for point_id in linked_ids:
            edges.append(
                _edge(
                    "assessed_by",
                    point_id,
                    resource_node.id,
                    evidence_count=event_counts.get(point_id, 0),
                )
            )
    for relation in await _relations_for_course(session, course.id):
        source = relation.source_knowledge_point_id
        target = relation.target_knowledge_point_id
        if source not in selected_ids or target not in selected_ids:
            continue
        edges.append(
            _edge(
                _normalize_relation_type(relation.relation_type),
                source,
                target,
                evidence_count=event_counts.get(source, 0),
            )
        )
    total_nodes = 3 + len(reachable) + len(resource_candidates)
    return KnowledgeGraphResponse(
        nodes=list(nodes.values()),
        edges=_close_edges(nodes, edges),
        scope="point",
        focus_id=point_id,
        total_nodes=total_nodes,
        returned_nodes=len(nodes),
        has_more=len(nodes) < total_nodes,
        truncated=len(nodes) < total_nodes,
    )


async def _full_graph(
    session: AsyncSession,
    course: Course,
    *,
    max_nodes: int,
) -> KnowledgeGraphResponse:
    chapters = list(
        await session.scalars(
            select(Chapter)
            .join(Document, Document.id == Chapter.document_id)
            .where(
                Chapter.course_id == course.id,
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
                KnowledgePoint.course_id == course.id,
                KnowledgePoint.trashed_at.is_(None),
                Chapter.trashed_at.is_(None),
                Document.trashed_at.is_(None),
            )
        )
    )
    points_by_chapter: dict[UUID, list[KnowledgePoint]] = defaultdict(list)
    for point in points:
        points_by_chapter[point.chapter_id].append(point)
    relations = await _relations_for_course(session, course.id)
    question_items = list(
        await session.scalars(
            select(QuestionItem)
            .options(selectinload(QuestionItem.knowledge_points))
            .where(
                QuestionItem.course_id == course.id,
                QuestionItem.trashed_at.is_(None),
            )
        )
    )
    external_resources = list(
        await session.scalars(
            select(ExternalResource)
            .options(selectinload(ExternalResource.knowledge_points))
            .where(
                ExternalResource.course_id == course.id,
                ExternalResource.trashed_at.is_(None),
            )
        )
    )
    documents = list(
        await session.scalars(
            select(Document).where(
                Document.course_id == course.id,
                Document.trashed_at.is_(None),
            )
        )
    )

    all_nodes: dict[UUID, KnowledgeGraphNode] = {course.id: _course_node(course)}
    all_edges: list[KnowledgeGraphEdge] = []
    for document in documents:
        document_chapters = [chapter for chapter in chapters if chapter.document_id == document.id]
        all_nodes[document.id] = _document_node(
            document,
            course_id=course.id,
            chapter_count=len(document_chapters),
            knowledge_point_count=sum(
                len(points_by_chapter.get(chapter.id, [])) for chapter in document_chapters
            ),
        )
        all_edges.append(_edge("contains", course.id, document.id))
        for chapter in document_chapters:
            all_nodes[chapter.id] = _chapter_node(
                chapter,
                course_id=course.id,
                document_id=document.id,
                point_count=len(points_by_chapter.get(chapter.id, [])),
            )
            all_edges.append(_edge("contains", document.id, chapter.id))
            for point in points_by_chapter.get(chapter.id, []):
                all_nodes[point.id] = _point_node(
                    point,
                    chapter_id=chapter.id,
                )
                all_edges.append(_edge("contains", chapter.id, point.id))

    event_counts = await _event_counts(session, course.id)
    for relation in relations:
        source = relation.source_knowledge_point_id
        target = relation.target_knowledge_point_id
        if source not in all_nodes or target not in all_nodes:
            continue
        all_edges.append(
            _edge(
                _normalize_relation_type(relation.relation_type),
                source,
                target,
                evidence_count=event_counts.get(source, 0),
            )
        )

    for item in question_items:
        all_nodes[item.id] = KnowledgeGraphNode(
            id=item.id,
            type="resource",
            label=item.title,
            parent_id=course.id,
            metadata={
                "resource_type": "question_item",
                "item_type": item.type.value,
            },
        )
        for point in item.knowledge_points:
            if point.id in all_nodes:
                all_edges.append(
                    _edge(
                        "assessed_by",
                        point.id,
                        item.id,
                        evidence_count=event_counts.get(point.id, 0),
                    )
                )

    for resource in external_resources:
        all_nodes[resource.id] = KnowledgeGraphNode(
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
            if point.id in all_nodes:
                all_edges.append(
                    _edge(
                        "assessed_by",
                        point.id,
                        resource.id,
                        evidence_count=event_counts.get(point.id, 0),
                    )
                )

    total_nodes = len(all_nodes)
    node_limit = max(1, max_nodes)
    if total_nodes <= node_limit:
        return KnowledgeGraphResponse(
            nodes=list(all_nodes.values()),
            edges=all_edges,
            scope="full",
            focus_id=course.id,
            total_nodes=total_nodes,
            returned_nodes=total_nodes,
            has_more=False,
            truncated=False,
        )

    priority_nodes: dict[UUID, KnowledgeGraphNode] = {course.id: all_nodes[course.id]}
    for node in all_nodes.values():
        if (
            node.type == "resource"
            and node.metadata.get("resource_type") == "textbook"
            and len(priority_nodes) < node_limit
        ):
            priority_nodes[node.id] = node
    for node in all_nodes.values():
        if node.type == "chapter" and len(priority_nodes) < node_limit:
            priority_nodes[node.id] = node
    for node in all_nodes.values():
        if node.type == "knowledge_point" and len(priority_nodes) < node_limit:
            priority_nodes[node.id] = node
    for node in all_nodes.values():
        if (
            node.type == "resource"
            and node.id not in priority_nodes
            and len(priority_nodes) < node_limit
        ):
            priority_nodes[node.id] = node
    return KnowledgeGraphResponse(
        nodes=list(priority_nodes.values()),
        edges=_close_edges(priority_nodes, all_edges),
        scope="full",
        focus_id=course.id,
        total_nodes=total_nodes,
        returned_nodes=len(priority_nodes),
        has_more=True,
        truncated=True,
    )


async def get_knowledge_graph(
    session: AsyncSession,
    course_id: UUID,
    requester_id: UUID,
    *,
    allow_course_read: bool = False,
    scope: GraphScope = "full",
    document_id: UUID | None = None,
    chapter_id: UUID | None = None,
    point_id: UUID | None = None,
    depth: int = 1,
    max_nodes: int = 500,
) -> KnowledgeGraphResponse:
    if not allow_course_read:
        await ensure_teacher(session, course_id, requester_id)
    course = await session.get(Course, course_id)
    if course is None:
        raise TeacherContentNotFoundError

    effective_scope: GraphScope = scope
    if scope == "full" and point_id is not None:
        effective_scope = "point"
    elif scope == "full" and chapter_id is not None:
        effective_scope = "chapter"

    if effective_scope == "overview":
        return await _overview_graph(
            session,
            course,
            max_nodes=max_nodes,
        )
    if effective_scope == "document":
        if document_id is None:
            raise TeacherContentNotFoundError
        return await _document_graph(
            session,
            course,
            document_id=document_id,
            max_nodes=max_nodes,
        )
    if effective_scope == "chapter":
        if chapter_id is None:
            raise TeacherContentNotFoundError
        return await _chapter_graph(
            session,
            course,
            chapter_id=chapter_id,
            max_nodes=max_nodes,
        )
    if effective_scope == "point":
        if point_id is None:
            raise TeacherContentNotFoundError
        return await _point_graph(
            session,
            course,
            point_id=point_id,
            depth=max(1, min(depth, 2)),
            max_nodes=max_nodes,
        )
    return await _full_graph(
        session,
        course,
        max_nodes=max_nodes,
    )
