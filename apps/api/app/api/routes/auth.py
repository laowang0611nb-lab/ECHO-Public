from database.models.user import User
from fastapi import APIRouter, HTTPException, status

from app.api.dependencies import CurrentUser, DBSession
from app.core.config import settings
from app.schemas.auth import (
    LoginRequest,
    PasswordChangeRequest,
    PasswordChangeResponse,
    TeacherProfileResponse,
    TeacherProfileUpdate,
    UserResponse,
)
from app.services.auth import (
    CurrentPasswordInvalidError,
    PasswordNotConfiguredError,
    TeacherProfileConflictError,
    TeacherProfileForbiddenError,
    UserRoleConflictError,
    change_password,
    get_or_register_user,
    get_teacher_profile,
    update_teacher_profile,
)

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


@router.get("/me/profile", response_model=TeacherProfileResponse)
async def get_profile(current_user: CurrentUser, session: DBSession) -> TeacherProfileResponse:
    try:
        return await get_teacher_profile(session, current_user)
    except TeacherProfileForbiddenError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only teachers can update teacher profiles",
        ) from exc


@router.patch("/me/profile", response_model=TeacherProfileResponse)
async def patch_profile(
    payload: TeacherProfileUpdate,
    current_user: CurrentUser,
    session: DBSession,
) -> TeacherProfileResponse:
    try:
        return await update_teacher_profile(session, current_user, payload)
    except TeacherProfileForbiddenError as exc:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only teachers can update teacher profiles",
        ) from exc
    except TeacherProfileConflictError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Teacher profile conflicts with existing data",
        ) from exc


@router.post("/change-password", response_model=PasswordChangeResponse)
async def change_current_password(
    payload: PasswordChangeRequest,
    current_user: CurrentUser,
    session: DBSession,
) -> PasswordChangeResponse:
    try:
        return await change_password(session, current_user.id, payload)
    except PasswordNotConfiguredError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Password credentials are not configured for this account",
        ) from exc
    except CurrentPasswordInvalidError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is invalid",
        ) from exc


@router.get("/me", response_model=UserResponse, summary="Get the current development user")
async def me(current_user: CurrentUser) -> User:
    return current_user
