from datetime import UTC, datetime, timedelta

import jwt
from database.auth.password import hash_password, password_needs_rehash, verify_password
from database.auth.sessions import (
    create_auth_session,
    get_auth_session_by_refresh_token,
    revoke_auth_session,
    rotate_refresh_token,
)
from database.auth.tokens import (
    create_access_token,
    create_phone_verification_token,
    decode_phone_verification_token,
)
from database.config import settings as auth_settings
from database.models.auth import AuthSession, PhoneVerificationClaim, UserCredential
from database.models.user import User, UserStatus
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.schemas.auth import (
    AuthSessionResponse,
    PasswordLoginRequest,
    PasswordResetRequest,
    PasswordResetResponse,
    SmsRegistrationRequest,
    UserResponse,
)

INTERNAL_PHONE_EMAIL_DOMAIN = "echo.example"
MAX_FAILED_LOGIN_ATTEMPTS = 5
LOGIN_LOCK_MINUTES = 15


class AuthFlowError(Exception):
    code = "AUTH_ERROR"
    message = "Authentication request failed"

    def __init__(self, message: str | None = None) -> None:
        super().__init__(message or self.message)


class PhoneAlreadyRegisteredError(AuthFlowError):
    code = "AUTH_PHONE_ALREADY_REGISTERED"
    message = "Phone number is already registered"


class PhoneNotRegisteredError(AuthFlowError):
    code = "AUTH_PHONE_NOT_REGISTERED"
    message = "Phone number is not registered"


class EmailAlreadyRegisteredError(AuthFlowError):
    code = "AUTH_EMAIL_ALREADY_REGISTERED"
    message = "Email is already registered"


class VerificationTokenInvalidError(AuthFlowError):
    code = "AUTH_VERIFICATION_TOKEN_INVALID"
    message = "Phone verification token is invalid or already used"


class VerificationTokenExpiredError(AuthFlowError):
    code = "AUTH_VERIFICATION_TOKEN_EXPIRED"
    message = "Phone verification token has expired"


class AccountNotFoundError(AuthFlowError):
    code = "AUTH_ACCOUNT_NOT_FOUND"
    message = "Account not found"


class InvalidPasswordError(AuthFlowError):
    code = "AUTH_INVALID_PASSWORD"
    message = "Password is invalid"


class AccountLockedError(AuthFlowError):
    code = "AUTH_ACCOUNT_LOCKED"
    message = "Account is temporarily locked"


class AccountDisabledError(AuthFlowError):
    code = "AUTH_ACCOUNT_DISABLED"
    message = "Account is disabled"


class SessionInvalidError(AuthFlowError):
    code = "AUTH_SESSION_INVALID"
    message = "Refresh session is invalid or expired"


async def issue_phone_verification_token(
    session: AsyncSession,
    phone: str,
    purpose: str,
) -> str:
    token = create_phone_verification_token(phone, purpose=purpose)
    payload = decode_phone_verification_token(token, purpose=purpose)
    expires_at = datetime.fromtimestamp(float(payload["exp"]), tz=UTC)
    session.add(
        PhoneVerificationClaim(
            jti=str(payload["jti"]),
            phone=phone,
            purpose=purpose,
            expires_at=expires_at,
        )
    )
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        raise VerificationTokenInvalidError from exc
    return token


async def consume_phone_verification_token(
    session: AsyncSession,
    phone: str,
    token: str,
    *,
    allowed_purposes: set[str],
) -> PhoneVerificationClaim:
    payload: dict[str, object] | None = None
    expired = False
    for purpose in allowed_purposes:
        try:
            payload = decode_phone_verification_token(token, purpose=purpose)
            break
        except jwt.ExpiredSignatureError:
            expired = True
        except (jwt.InvalidTokenError, ValueError):
            continue
    if payload is None:
        if expired:
            raise VerificationTokenExpiredError
        raise VerificationTokenInvalidError
    if payload.get("phone") != phone:
        raise VerificationTokenInvalidError

    jti = str(payload.get("jti") or "")
    claim = await session.get(PhoneVerificationClaim, jti)
    now = datetime.now(UTC)
    if claim is None or claim.phone != phone or claim.purpose not in allowed_purposes:
        raise VerificationTokenInvalidError
    if _as_utc(claim.expires_at) <= now:
        raise VerificationTokenExpiredError
    if claim.consumed_at is not None:
        raise VerificationTokenInvalidError

    result = await session.execute(
        update(PhoneVerificationClaim)
        .where(
            PhoneVerificationClaim.jti == jti,
            PhoneVerificationClaim.consumed_at.is_(None),
        )
        .values(consumed_at=now)
        .execution_options(synchronize_session=False)
    )
    if (result.rowcount or 0) != 1:
        raise VerificationTokenInvalidError
    return claim


async def register_with_sms(
    session: AsyncSession,
    payload: SmsRegistrationRequest,
    *,
    user_agent: str | None = None,
) -> AuthSessionResponse:
    await consume_phone_verification_token(
        session,
        payload.phone,
        payload.verification_token,
        allowed_purposes={"register"},
    )

    existing_phone = await session.scalar(select(User).where(User.phone == payload.phone))
    if existing_phone is not None:
        raise PhoneAlreadyRegisteredError

    email = str(payload.email) if payload.email is not None else _phone_email(payload.phone)
    if payload.email is not None:
        existing_email = await session.scalar(select(User).where(User.email == email))
        if existing_email is not None:
            raise EmailAlreadyRegisteredError

    user = User(
        email=email,
        phone=payload.phone,
        display_name=payload.display_name,
        role=payload.role,
    )
    session.add(user)
    await session.flush()

    password_hash, algorithm = hash_password(payload.password)
    session.add(
        UserCredential(
            user_id=user.id,
            password_hash=password_hash,
            password_algorithm=algorithm,
        )
    )
    auth_session, refresh_token = await create_auth_session(
        session,
        user.id,
        device_name=payload.device_name,
        user_agent=user_agent,
    )
    try:
        await session.commit()
    except IntegrityError as exc:
        await session.rollback()
        phone_conflict = await session.scalar(select(User).where(User.phone == payload.phone))
        if phone_conflict is not None:
            raise PhoneAlreadyRegisteredError from exc
        email_conflict = await session.scalar(select(User).where(User.email == email))
        if email_conflict is not None:
            raise EmailAlreadyRegisteredError from exc
        raise

    await session.refresh(user)
    return _auth_session_response(user, auth_session, refresh_token)


async def login_with_password(
    session: AsyncSession,
    payload: PasswordLoginRequest,
    *,
    user_agent: str | None = None,
) -> AuthSessionResponse:
    if payload.email is not None:
        user = await session.scalar(select(User).where(User.email == str(payload.email)))
    else:
        user = await session.scalar(select(User).where(User.phone == payload.phone))
    if user is None:
        raise AccountNotFoundError
    if user.status != UserStatus.ACTIVE:
        raise AccountDisabledError

    credential = await session.get(UserCredential, user.id)
    if credential is None:
        raise AccountNotFoundError

    now = datetime.now(UTC)
    if credential.locked_until is not None and _as_utc(credential.locked_until) > now:
        raise AccountLockedError

    if not verify_password(payload.password, credential.password_hash):
        credential.failed_login_count = (credential.failed_login_count or 0) + 1
        if credential.failed_login_count >= MAX_FAILED_LOGIN_ATTEMPTS:
            credential.locked_until = now + timedelta(minutes=LOGIN_LOCK_MINUTES)
        await session.commit()
        if credential.locked_until is not None and _as_utc(credential.locked_until) > now:
            raise AccountLockedError
        raise InvalidPasswordError

    if password_needs_rehash(credential.password_hash):
        password_hash, algorithm = hash_password(payload.password)
        credential.password_hash = password_hash
        credential.password_algorithm = algorithm

    credential.failed_login_count = 0
    credential.locked_until = None
    user.last_login_at = now
    auth_session, refresh_token = await create_auth_session(
        session,
        user.id,
        device_name=payload.device_name,
        user_agent=user_agent,
    )
    await session.commit()
    await session.refresh(user)
    return _auth_session_response(user, auth_session, refresh_token)


async def reset_password_with_sms(
    session: AsyncSession,
    payload: PasswordResetRequest,
) -> PasswordResetResponse:
    await consume_phone_verification_token(
        session,
        payload.phone,
        payload.verification_token,
        allowed_purposes={"password_reset"},
    )

    user = await session.scalar(select(User).where(User.phone == payload.phone))
    if user is None:
        raise PhoneNotRegisteredError

    credential = await session.get(UserCredential, user.id)
    if credential is None:
        credential = UserCredential(
            user_id=user.id,
            password_hash="",
            password_algorithm="",
        )
        session.add(credential)

    changed_at = datetime.now(UTC)
    password_hash, algorithm = hash_password(payload.new_password)
    credential.password_hash = password_hash
    credential.password_algorithm = algorithm
    credential.password_changed_at = changed_at
    credential.failed_login_count = 0
    credential.locked_until = None

    result = await session.execute(
        update(AuthSession)
        .where(AuthSession.user_id == user.id, AuthSession.revoked_at.is_(None))
        .values(revoked_at=changed_at)
    )
    await session.commit()
    return PasswordResetResponse(
        message="密码重置成功",
        changed_at=changed_at,
        sessions_revoked=max(0, result.rowcount or 0),
    )


async def refresh_auth_session(
    session: AsyncSession,
    refresh_token: str,
    *,
    user_agent: str | None = None,
) -> AuthSessionResponse:
    rotated = await rotate_refresh_token(session, refresh_token)
    if rotated is None:
        raise SessionInvalidError
    auth_session, next_refresh_token = rotated
    user = await session.get(User, auth_session.user_id)
    if user is None:
        raise SessionInvalidError
    if user.status != UserStatus.ACTIVE:
        raise AccountDisabledError
    if user_agent and auth_session.user_agent is None:
        auth_session.user_agent = user_agent
    await session.commit()
    return _auth_session_response(user, auth_session, next_refresh_token)


async def logout_refresh_session(
    session: AsyncSession,
    refresh_token: str,
) -> None:
    auth_session = await get_auth_session_by_refresh_token(session, refresh_token)
    if auth_session is None:
        return
    await revoke_auth_session(session, auth_session)
    await session.commit()


def _auth_session_response(
    user: User,
    auth_session: AuthSession,
    refresh_token: str,
) -> AuthSessionResponse:
    return AuthSessionResponse(
        user=UserResponse.model_validate(user),
        session_id=auth_session.id,
        access_token=create_access_token(
            user.id,
            user.role.value,
            session_id=auth_session.id,
        ),
        refresh_token=refresh_token,
        expires_in_seconds=auth_settings.auth_access_token_minutes * 60,
        refresh_expires_at=auth_session.expires_at,
    )


def _phone_email(phone: str) -> str:
    return f"phone-{phone}@{INTERNAL_PHONE_EMAIL_DOMAIN}"


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)
