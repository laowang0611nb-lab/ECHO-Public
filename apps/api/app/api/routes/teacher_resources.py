from typing import Annotated
from uuid import UUID

from database.models.resource import ExternalResourceStatus
from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import FileResponse

from app.api.dependencies import (
    CurrentUser,
    DBSession,
    DocumentStorageDep,
    KnowledgeGraphReadPrincipalDep,
    require_knowledge_graph_read_course,
)
from app.schemas.teacher_resources import (
    DocumentCitationPage,
    DocumentIndexStatusResponse,
    DocumentPageEvidenceResponse,
    ErrorPatternResponse,
    ExternalResourceCreate,
    ExternalResourcePage,
    ExternalResourceResponse,
    ExternalResourceUpdate,
    KnowledgeGraphResponse,
    MasteryTrendResponse,
    PermanentDeleteResponse,
    QuestionItemCreate,
    QuestionItemPage,
    QuestionItemResponse,
    QuestionItemUpdate,
    ResourceListItem,
    ResourceListPage,
)
from app.services.document_evidence import (
    get_document_for_teacher,
    get_document_index_status,
    get_document_page_evidence,
    list_document_citations,
)
from app.services.external_resources import (
    create_external_resource,
    delete_external_resource,
    list_external_resources,
    update_external_resource,
)
from app.services.knowledge_analytics import (
    get_knowledge_point_error_patterns,
    get_knowledge_point_mastery_trend,
    get_student_error_patterns,
    get_student_mastery_trend,
)
from app.services.knowledge_graph import get_knowledge_graph
from app.services.question_items import (
    create_question_item,
    delete_question_item,
    get_question_item,
    list_question_items,
    update_question_item,
)
from app.services.resource_lifecycle import (
    list_course_resources,
    permanent_delete_resource,
    restore_resource,
    trash_resource,
)
from app.services.teacher_access import (
    TeacherContentConflictError,
    TeacherContentForbiddenError,
    TeacherContentNotFoundError,
)

router = APIRouter(tags=["teacher-resources"])


def _translate_error(exc: Exception) -> HTTPException:
    if isinstance(exc, TeacherContentNotFoundError):
        return HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Teacher resource not found",
        )
    if isinstance(exc, TeacherContentForbiddenError):
        return HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only course teachers can access this resource",
        )
    if isinstance(exc, TeacherContentConflictError):
        return HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Teacher resource operation conflicts with existing data",
        )
    return HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail="Teacher resource operation conflicts with existing data",
    )


@router.get(
    "/courses/{course_id}/knowledge-points/{knowledge_point_id}/mastery-trend",
    response_model=MasteryTrendResponse,
)
async def read_knowledge_point_mastery_trend(
    course_id: UUID,
    knowledge_point_id: UUID,
    current_user: CurrentUser,
    session: DBSession,
    days: Annotated[int, Query(ge=1, le=365)] = 30,
):
    try:
        return await get_knowledge_point_mastery_trend(
            session,
            course_id,
            knowledge_point_id,
            current_user.id,
            days=days,
        )
    except (TeacherContentNotFoundError, TeacherContentForbiddenError) as exc:
        raise _translate_error(exc) from exc


@router.get(
    "/courses/{course_id}/knowledge-points/{knowledge_point_id}/error-patterns",
    response_model=ErrorPatternResponse,
)
async def read_knowledge_point_error_patterns(
    course_id: UUID,
    knowledge_point_id: UUID,
    current_user: CurrentUser,
    session: DBSession,
    days: Annotated[int, Query(ge=1, le=365)] = 30,
):
    try:
        return await get_knowledge_point_error_patterns(
            session,
            course_id,
            knowledge_point_id,
            current_user.id,
            days=days,
        )
    except (TeacherContentNotFoundError, TeacherContentForbiddenError) as exc:
        raise _translate_error(exc) from exc


@router.get(
    "/courses/{course_id}/students/{student_id}/mastery-trend",
    response_model=MasteryTrendResponse,
)
async def read_student_mastery_trend(
    course_id: UUID,
    student_id: UUID,
    current_user: CurrentUser,
    session: DBSession,
    days: Annotated[int, Query(ge=1, le=730)] = 90,
):
    try:
        return await get_student_mastery_trend(
            session,
            course_id,
            student_id,
            current_user.id,
            days=days,
        )
    except (TeacherContentNotFoundError, TeacherContentForbiddenError) as exc:
        raise _translate_error(exc) from exc


@router.get(
    "/courses/{course_id}/students/{student_id}/error-patterns",
    response_model=ErrorPatternResponse,
)
async def read_student_error_patterns(
    course_id: UUID,
    student_id: UUID,
    current_user: CurrentUser,
    session: DBSession,
    days: Annotated[int, Query(ge=1, le=730)] = 90,
):
    try:
        return await get_student_error_patterns(
            session,
            course_id,
            student_id,
            current_user.id,
            days=days,
        )
    except (TeacherContentNotFoundError, TeacherContentForbiddenError) as exc:
        raise _translate_error(exc) from exc


@router.get(
    "/courses/{course_id}/question-items",
    response_model=QuestionItemPage,
)
async def list_course_question_items(
    course_id: UUID,
    current_user: CurrentUser,
    session: DBSession,
    knowledge_point_id: Annotated[UUID | None, Query(alias="knowledgePointId")] = None,
    cursor: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
):
    try:
        return await list_question_items(
            session,
            course_id,
            current_user.id,
            knowledge_point_id=knowledge_point_id,
            cursor=cursor,
            limit=limit,
        )
    except (TeacherContentNotFoundError, TeacherContentForbiddenError) as exc:
        raise _translate_error(exc) from exc


@router.get(
    "/courses/{course_id}/question-items/{question_item_id}",
    response_model=QuestionItemResponse,
)
async def read_question_item(
    course_id: UUID,
    question_item_id: UUID,
    current_user: CurrentUser,
    session: DBSession,
):
    try:
        return await get_question_item(
            session,
            course_id,
            question_item_id,
            current_user.id,
        )
    except (TeacherContentNotFoundError, TeacherContentForbiddenError) as exc:
        raise _translate_error(exc) from exc


@router.post(
    "/courses/{course_id}/question-items",
    response_model=QuestionItemResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_course_question_item(
    course_id: UUID,
    payload: QuestionItemCreate,
    current_user: CurrentUser,
    session: DBSession,
):
    try:
        return await create_question_item(
            session,
            course_id,
            current_user.id,
            payload,
        )
    except (TeacherContentNotFoundError, TeacherContentForbiddenError) as exc:
        raise _translate_error(exc) from exc


@router.patch(
    "/courses/{course_id}/question-items/{question_item_id}",
    response_model=QuestionItemResponse,
)
async def patch_course_question_item(
    course_id: UUID,
    question_item_id: UUID,
    payload: QuestionItemUpdate,
    current_user: CurrentUser,
    session: DBSession,
):
    try:
        return await update_question_item(
            session,
            course_id,
            question_item_id,
            current_user.id,
            payload,
        )
    except (TeacherContentNotFoundError, TeacherContentForbiddenError) as exc:
        raise _translate_error(exc) from exc


@router.delete(
    "/courses/{course_id}/question-items/{question_item_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def remove_course_question_item(
    course_id: UUID,
    question_item_id: UUID,
    current_user: CurrentUser,
    session: DBSession,
):
    try:
        await delete_question_item(
            session,
            course_id,
            question_item_id,
            current_user.id,
        )
    except (TeacherContentNotFoundError, TeacherContentForbiddenError) as exc:
        raise _translate_error(exc) from exc


@router.get(
    "/courses/{course_id}/external-resources",
    response_model=ExternalResourcePage,
)
async def list_course_external_resources(
    course_id: UUID,
    current_user: CurrentUser,
    session: DBSession,
    knowledge_point_id: Annotated[UUID | None, Query(alias="knowledgePointId")] = None,
    check_status: Annotated[ExternalResourceStatus | None, Query(alias="status")] = None,
    cursor: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
):
    try:
        return await list_external_resources(
            session,
            course_id,
            current_user.id,
            knowledge_point_id=knowledge_point_id,
            status=check_status,
            cursor=cursor,
            limit=limit,
        )
    except (TeacherContentNotFoundError, TeacherContentForbiddenError) as exc:
        raise _translate_error(exc) from exc


@router.post(
    "/courses/{course_id}/external-resources",
    response_model=ExternalResourceResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_course_external_resource(
    course_id: UUID,
    payload: ExternalResourceCreate,
    current_user: CurrentUser,
    session: DBSession,
):
    try:
        return await create_external_resource(
            session,
            course_id,
            current_user.id,
            payload,
        )
    except (TeacherContentNotFoundError, TeacherContentForbiddenError) as exc:
        raise _translate_error(exc) from exc


@router.patch(
    "/courses/{course_id}/external-resources/{resource_id}",
    response_model=ExternalResourceResponse,
)
async def patch_course_external_resource(
    course_id: UUID,
    resource_id: UUID,
    payload: ExternalResourceUpdate,
    current_user: CurrentUser,
    session: DBSession,
):
    try:
        return await update_external_resource(
            session,
            course_id,
            resource_id,
            current_user.id,
            payload,
        )
    except (TeacherContentNotFoundError, TeacherContentForbiddenError) as exc:
        raise _translate_error(exc) from exc


@router.delete(
    "/courses/{course_id}/external-resources/{resource_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def remove_course_external_resource(
    course_id: UUID,
    resource_id: UUID,
    current_user: CurrentUser,
    session: DBSession,
):
    try:
        await delete_external_resource(
            session,
            course_id,
            resource_id,
            current_user.id,
        )
    except (TeacherContentNotFoundError, TeacherContentForbiddenError) as exc:
        raise _translate_error(exc) from exc


@router.get(
    "/courses/{course_id}/resources",
    response_model=ResourceListPage,
)
async def list_course_resources_endpoint(
    course_id: UUID,
    current_user: CurrentUser,
    session: DBSession,
    trashed: Annotated[bool, Query()] = False,
    cursor: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
):
    try:
        return await list_course_resources(
            session,
            course_id,
            current_user.id,
            trashed=trashed,
            cursor=cursor,
            limit=limit,
        )
    except (TeacherContentNotFoundError, TeacherContentForbiddenError) as exc:
        raise _translate_error(exc) from exc


@router.post(
    "/courses/{course_id}/resources/{resource_id}/trash",
    response_model=ResourceListItem,
)
async def trash_course_resource(
    course_id: UUID,
    resource_id: UUID,
    current_user: CurrentUser,
    session: DBSession,
):
    try:
        return await trash_resource(
            session,
            course_id,
            resource_id,
            current_user.id,
        )
    except (TeacherContentNotFoundError, TeacherContentForbiddenError) as exc:
        raise _translate_error(exc) from exc


@router.post(
    "/courses/{course_id}/resources/{resource_id}/restore",
    response_model=ResourceListItem,
)
async def restore_course_resource(
    course_id: UUID,
    resource_id: UUID,
    current_user: CurrentUser,
    session: DBSession,
):
    try:
        return await restore_resource(
            session,
            course_id,
            resource_id,
            current_user.id,
        )
    except (
        TeacherContentNotFoundError,
        TeacherContentForbiddenError,
        TeacherContentConflictError,
    ) as exc:
        raise _translate_error(exc) from exc


@router.delete(
    "/courses/{course_id}/resources/{resource_id}",
    response_model=PermanentDeleteResponse,
)
async def permanently_delete_course_resource(
    course_id: UUID,
    resource_id: UUID,
    current_user: CurrentUser,
    session: DBSession,
    storage: DocumentStorageDep,
    permanent: Annotated[bool, Query()] = False,
):
    try:
        return await permanent_delete_resource(
            session,
            storage,
            course_id,
            resource_id,
            current_user.id,
            permanent=permanent,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    except (TeacherContentNotFoundError, TeacherContentForbiddenError) as exc:
        raise _translate_error(exc) from exc


@router.get(
    "/courses/{course_id}/knowledge-graph",
    response_model=KnowledgeGraphResponse,
)
async def read_course_knowledge_graph(
    course_id: UUID,
    read_principal: KnowledgeGraphReadPrincipalDep,
    session: DBSession,
    chapter_id: Annotated[UUID | None, Query(alias="chapterId")] = None,
    point_id: Annotated[UUID | None, Query(alias="pointId")] = None,
):
    try:
        require_knowledge_graph_read_course(read_principal, course_id)
        return await get_knowledge_graph(
            session,
            course_id,
            read_principal.user_id,
            allow_course_read=read_principal.is_embedded,
            chapter_id=chapter_id,
            point_id=point_id,
        )
    except (TeacherContentNotFoundError, TeacherContentForbiddenError) as exc:
        raise _translate_error(exc) from exc


@router.get(
    "/courses/{course_id}/documents/{document_id}/file",
    response_class=FileResponse,
)
async def read_course_document_file(
    course_id: UUID,
    document_id: UUID,
    current_user: CurrentUser,
    session: DBSession,
    storage: DocumentStorageDep,
):
    try:
        document, path = await get_document_for_teacher(
            session,
            storage,
            course_id,
            document_id,
            current_user.id,
        )
    except (TeacherContentNotFoundError, TeacherContentForbiddenError) as exc:
        raise _translate_error(exc) from exc
    return FileResponse(
        path,
        media_type="application/pdf",
        filename=document.original_name,
        headers={"Accept-Ranges": "bytes"},
    )


@router.get(
    "/courses/{course_id}/documents/{document_id}/pages/{page_number}",
    response_model=DocumentPageEvidenceResponse,
)
async def read_course_document_page(
    course_id: UUID,
    document_id: UUID,
    page_number: int,
    current_user: CurrentUser,
    session: DBSession,
):
    if page_number < 1:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="page_number must be positive",
        )
    try:
        return await get_document_page_evidence(
            session,
            course_id,
            document_id,
            page_number,
            current_user.id,
        )
    except (TeacherContentNotFoundError, TeacherContentForbiddenError) as exc:
        raise _translate_error(exc) from exc


@router.get(
    "/courses/{course_id}/documents/{document_id}/index-status",
    response_model=DocumentIndexStatusResponse,
)
async def read_course_document_index_status(
    course_id: UUID,
    document_id: UUID,
    current_user: CurrentUser,
    session: DBSession,
):
    try:
        return await get_document_index_status(
            session,
            course_id,
            document_id,
            current_user.id,
        )
    except (TeacherContentNotFoundError, TeacherContentForbiddenError) as exc:
        raise _translate_error(exc) from exc


@router.get(
    "/courses/{course_id}/documents/{document_id}/citations",
    response_model=DocumentCitationPage,
)
async def read_course_document_citations(
    course_id: UUID,
    document_id: UUID,
    current_user: CurrentUser,
    session: DBSession,
    cursor: Annotated[str | None, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
):
    try:
        return await list_document_citations(
            session,
            course_id,
            document_id,
            current_user.id,
            cursor=cursor,
            limit=limit,
        )
    except (TeacherContentNotFoundError, TeacherContentForbiddenError) as exc:
        raise _translate_error(exc) from exc
