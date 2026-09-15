from fastapi import APIRouter, HTTPException, status

from app.api.dependencies import CurrentUser, DBSession
from app.core.config import settings
from app.models.user import User
from app.schemas.auth import LoginRequest, UserResponse
from app.services.auth import UserRoleConflictError, get_or_register_user

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=UserResponse, summary="Create or restore a development user")
async def login(payload: LoginRequest, session: DBSession) -> User:
    if not settings.development_auth_enabled:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Development authentication is disabled",
        )
    try:
        return await get_or_register_user(session, payload)
    except UserRoleConflictError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc


@router.get("/me", response_model=UserResponse, summary="Get the current development user")
async def me(current_user: CurrentUser) -> User:
    return current_user
