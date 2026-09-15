from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User, UserRole
from app.schemas.auth import LoginRequest


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
