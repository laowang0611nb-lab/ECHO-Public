from datetime import UTC, datetime
from uuid import UUID

from database.auth.password import hash_password, verify_password
from database.models.auth import AuthSession, UserCredential
from database.models.profile import TeacherProfile
from database.models.user import User, UserRole, UserStatus
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.auth import (
    LoginRequest,
    PasswordChangeRequest,
    PasswordChangeResponse,
    TeacherProfileResponse,
    TeacherProfileUpdate,
)


class TeacherProfileForbiddenError(Exception):
    pass


class TeacherProfileConflictError(Exception):
    pass


class PasswordNotConfiguredError(Exception):
    pass


class CurrentPasswordInvalidError(Exception):
    pass


class UserRoleConflictError(Exception):
    def __init__(self, requested_role: UserRole, existing_role: UserRole) -> None:
        self.requested_role = requested_role
        self.existing_role = existing_role
        super().__init__(
            f"email is already registered as {existing_role.value}; "
            f"requested role {requested_role.value} conflicts"
        )


async def get_or_register_user(session: AsyncSession, payload: LoginRequest) -> User:
    existing = await session.scalar(select(User).where(User.email == payload.email))
    if existing is not None:
        if existing.role != payload.role:
            raise UserRoleConflictError(payload.role, existing.role)
        return existing

    user = User(
        email=payload.email,
        display_name=payload.display_name,
        role=payload.role,
    )
    session.add(user)

    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        existing = await session.scalar(select(User).where(User.email == payload.email))
        if existing is None:
            raise
        if existing.role != payload.role:
            raise UserRoleConflictError(payload.role, existing.role) from None
        return existing

    await session.refresh(user)
    return user


async def get_teacher_profile(
    session: AsyncSession,
    user: User,
) -> TeacherProfileResponse:
    if user.role != UserRole.TEACHER:
        raise TeacherProfileForbiddenError
    profile = await session.get(TeacherProfile, user.id)
    return _profile_response(user, profile)


async def update_teacher_profile(
    session: AsyncSession,
    user: User,
    payload: TeacherProfileUpdate,
) -> TeacherProfileResponse:
    if user.role != UserRole.TEACHER:
        raise TeacherProfileForbiddenError

    profile = await session.get(TeacherProfile, user.id)
    if profile is None:
        profile = TeacherProfile(user_id=user.id, teaching_fields=[])
        session.add(profile)

    if "display_name" in payload.model_fields_set and payload.display_name is not None:
        user.display_name = payload.display_name

    for field in ("school_name", "department", "employee_no", "title"):
        if field in payload.model_fields_set:
            setattr(profile, field, getattr(payload, field))

    if "teaching_fields" in payload.model_fields_set:
        values = payload.teaching_fields or []
        profile.teaching_fields = list(
            dict.fromkeys(value.strip() for value in values if value.strip())
        )

    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise TeacherProfileConflictError from exc

    await session.refresh(user)
    await session.refresh(profile)
    return _profile_response(user, profile)


async def change_password(
    session: AsyncSession,
    user_id: UUID,
    payload: PasswordChangeRequest,
) -> PasswordChangeResponse:
    credential = await session.get(UserCredential, user_id)
    if credential is None:
        raise PasswordNotConfiguredError
    if not verify_password(payload.current_password, credential.password_hash):
        raise CurrentPasswordInvalidError
    if verify_password(payload.new_password, credential.password_hash):
        raise CurrentPasswordInvalidError

    changed_at = datetime.now(UTC)
    password_hash, algorithm = hash_password(payload.new_password)
    credential.password_hash = password_hash
    credential.password_algorithm = algorithm
    credential.password_changed_at = changed_at
    credential.failed_login_count = 0
    credential.locked_until = None

    result = await session.execute(
        update(AuthSession)
        .where(
            AuthSession.user_id == user_id,
            AuthSession.revoked_at.is_(None),
        )
        .values(revoked_at=changed_at)
    )
    await session.commit()
    return PasswordChangeResponse(
        changed_at=changed_at,
        sessions_revoked=max(0, result.rowcount or 0),
    )


async def authenticate_with_password(
    session: AsyncSession,
    email: str,
    password: str,
) -> User | None:
    row = (
        await session.execute(
            select(User, UserCredential)
            .join(UserCredential, UserCredential.user_id == User.id)
            .where(User.email == email.strip().lower())
        )
    ).first()
    if row is None:
        return None
    user, credential = row
    if user.status != UserStatus.ACTIVE:
        return None
    if not verify_password(password, credential.password_hash):
        return None
    return user


def _profile_response(
    user: User,
    profile: TeacherProfile | None,
) -> TeacherProfileResponse:
    return TeacherProfileResponse(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        role=user.role,
        avatar_url=user.avatar_url,
        school_name=profile.school_name if profile else None,
        department=profile.department if profile else None,
        employee_no=profile.employee_no if profile else None,
        title=profile.title if profile else None,
        teaching_fields=profile.teaching_fields if profile else [],
        created_at=profile.created_at if profile else user.created_at,
        updated_at=profile.updated_at if profile else user.updated_at,
    )
