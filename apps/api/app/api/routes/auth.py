from typing import Annotated

from database.auth.tokens import create_phone_verification_token
from database.models.user import User
from fastapi import APIRouter, File, HTTPException, UploadFile, status

from app.api.dependencies import AliyunPnvsProviderDep, AvatarStorageDep, CurrentUser, DBSession
from app.core.config import settings
from app.schemas.auth import (
    AvatarResponse,
    LoginRequest,
    PasswordChangeRequest,
    PasswordChangeResponse,
    SmsErrorResponse,
    SmsSendRequest,
    SmsSendResponse,
    SmsVerifyRequest,
    SmsVerifyResponse,
    TeacherProfileResponse,
    TeacherProfileUpdate,
    UserResponse,
)
from app.services.aliyun_pnvs import (
    AliyunPnvsAuthenticationError,
    AliyunPnvsBillingError,
    AliyunPnvsCodeInvalidOrExpiredError,
    AliyunPnvsConfigurationError,
    AliyunPnvsError,
    AliyunPnvsSendError,
    AliyunPnvsTimeoutError,
    AliyunPnvsTooFrequentError,
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
from app.services.avatar import (
    AvatarTooLargeError,
    UnsupportedAvatarTypeError,
    delete_avatar,
    upload_avatar,
)

router = APIRouter(prefix="/auth", tags=["auth"])
PHONE_VERIFICATION_TOKEN_SECONDS = 300
SMS_ERROR_RESPONSES = {
    400: {"model": SmsErrorResponse, "description": "Invalid or expired code"},
    429: {"model": SmsErrorResponse, "description": "SMS send interval exceeded"},
    502: {"model": SmsErrorResponse, "description": "SMS provider send failure"},
    503: {"model": SmsErrorResponse, "description": "SMS provider unavailable"},
    504: {"model": SmsErrorResponse, "description": "SMS provider timeout"},
}


def _sms_http_exception(exc: AliyunPnvsError) -> HTTPException:
    if isinstance(exc, AliyunPnvsTooFrequentError):
        return HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={"code": "SMS_TOO_FREQUENT", "message": "操作过于频繁，请稍后再试"},
            headers={"Retry-After": str(settings.aliyun_pnvs_interval)},
        )
    if isinstance(exc, AliyunPnvsCodeInvalidOrExpiredError):
        return HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "SMS_CODE_INVALID_OR_EXPIRED",
                "message": "验证码错误或已失效",
            },
        )
    if isinstance(exc, AliyunPnvsTimeoutError):
        return HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail={"code": "SMS_TIMEOUT", "message": "短信服务响应超时，请稍后重试"},
        )
    if isinstance(exc, AliyunPnvsConfigurationError):
        return HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": "SMS_PROVIDER_NOT_CONFIGURED",
                "message": "短信服务尚未配置",
            },
        )
    if isinstance(exc, AliyunPnvsAuthenticationError):
        return HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": "SMS_AUTH_FAILED", "message": "短信服务暂时不可用"},
        )
    if isinstance(exc, AliyunPnvsBillingError):
        return HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": "SMS_BILLING_UNAVAILABLE", "message": "短信服务暂时不可用"},
        )
    if isinstance(exc, AliyunPnvsSendError):
        return HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail={"code": "SMS_SEND_FAILED", "message": "验证码发送失败，请稍后重试"},
        )
    return HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail={"code": "SMS_SERVICE_UNAVAILABLE", "message": "短信服务暂时不可用"},
    )


@router.post(
    "/sms/send",
    response_model=SmsSendResponse,
    responses=SMS_ERROR_RESPONSES,
)
async def send_sms_verification_code(
    payload: SmsSendRequest,
    provider: AliyunPnvsProviderDep,
) -> SmsSendResponse:
    try:
        await provider.send_verify_code(payload.phone)
    except AliyunPnvsError as exc:
        raise _sms_http_exception(exc) from exc
    return SmsSendResponse(
        message="验证码已发送",
        cooldown_seconds=settings.aliyun_pnvs_interval,
    )


@router.post(
    "/sms/verify",
    response_model=SmsVerifyResponse,
    responses=SMS_ERROR_RESPONSES,
)
async def verify_sms_code(
    payload: SmsVerifyRequest,
    provider: AliyunPnvsProviderDep,
) -> SmsVerifyResponse:
    try:
        await provider.check_verify_code(payload.phone, payload.code)
    except AliyunPnvsError as exc:
        raise _sms_http_exception(exc) from exc
    return SmsVerifyResponse(
        verification_token=create_phone_verification_token(payload.phone),
        expires_in_seconds=PHONE_VERIFICATION_TOKEN_SECONDS,
    )


@router.post("/me/avatar", response_model=AvatarResponse)
async def upload_current_avatar(
    file: Annotated[UploadFile, File()],
    current_user: CurrentUser,
    session: DBSession,
    storage: AvatarStorageDep,
) -> AvatarResponse:
    try:
        avatar_url = await upload_avatar(
            session,
            storage,
            current_user,
            file,
            settings.avatar_max_upload_bytes,
        )
    except AvatarTooLargeError as exc:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail="Avatar exceeds the configured upload limit",
        ) from exc
    except UnsupportedAvatarTypeError as exc:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Avatar must be JPEG, PNG, or WebP",
        ) from exc
    return AvatarResponse(avatar_url=avatar_url)


@router.delete("/me/avatar", status_code=status.HTTP_204_NO_CONTENT)
async def delete_current_avatar(
    current_user: CurrentUser,
    session: DBSession,
    storage: AvatarStorageDep,
) -> None:
    await delete_avatar(session, storage, current_user)


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
