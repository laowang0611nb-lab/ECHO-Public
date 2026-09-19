from uuid import UUID

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import FileResponse

from app.api.dependencies import AvatarStorageDep, DBSession
from app.services.avatar import AvatarNotFoundError, get_avatar_path

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/{user_id}/avatar", response_class=FileResponse)
async def read_user_avatar(
    user_id: UUID,
    session: DBSession,
    storage: AvatarStorageDep,
) -> FileResponse:
    try:
        path, media_type = await get_avatar_path(session, storage, user_id)
    except AvatarNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Avatar not found",
        ) from exc
    return FileResponse(
        path,
        media_type=media_type,
        headers={
            "Cache-Control": "public, max-age=86400, immutable",
            "X-Content-Type-Options": "nosniff",
        },
    )
