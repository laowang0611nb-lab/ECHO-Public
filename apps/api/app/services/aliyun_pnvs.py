from __future__ import annotations

import json
import logging
from typing import Any

from alibabacloud_dypnsapi20170525 import models as dypnsapi_models
from alibabacloud_dypnsapi20170525.client import Client as DypnsapiClient
from alibabacloud_tea_openapi import models as open_api_models
from alibabacloud_tea_util import models as util_models
from Tea.exceptions import TeaException

logger = logging.getLogger(__name__)


class AliyunPnvsError(Exception):
    """Base exception for failures from the Aliyun PNVS provider."""


class AliyunPnvsConfigurationError(AliyunPnvsError):
    pass


class AliyunPnvsAuthenticationError(AliyunPnvsError):
    pass


class AliyunPnvsBillingError(AliyunPnvsError):
    pass


class AliyunPnvsTooFrequentError(AliyunPnvsError):
    pass


class AliyunPnvsSendError(AliyunPnvsError):
    pass


class AliyunPnvsCodeInvalidOrExpiredError(AliyunPnvsError):
    pass


class AliyunPnvsTimeoutError(AliyunPnvsError):
    pass


class AliyunPnvsServiceUnavailableError(AliyunPnvsError):
    pass


class AliyunPnvsProvider:
    ENDPOINT = "dypnsapi.aliyuncs.com"

    def __init__(
        self,
        *,
        access_key_id: str | None,
        access_key_secret: str | None,
        sign_name: str | None,
        template_code: str,
        country_code: str,
        valid_time: int,
        interval: int,
        timeout_seconds: int,
        sdk_client: Any | None = None,
    ) -> None:
        self._access_key_id = access_key_id
        self._access_key_secret = access_key_secret
        self._sign_name = sign_name
        self._template_code = template_code
        self._country_code = country_code
        self._valid_time = valid_time
        self._interval = interval
        self._timeout_seconds = timeout_seconds
        self._sdk_client = sdk_client

    async def send_verify_code(self, phone: str) -> None:
        client = self._get_client()
        request = dypnsapi_models.SendSmsVerifyCodeRequest(
            phone_number=phone,
            sign_name=self._sign_name,
            template_code=self._template_code,
            template_param=json.dumps(
                {
                    "code": "##code##",
                    "min": str(max(1, self._valid_time // 60)),
                },
                separators=(",", ":"),
            ),
            country_code=self._country_code,
            valid_time=self._valid_time,
            interval=self._interval,
            code_length=4,
            code_type=1,
            return_verify_code=False,
        )
        try:
            response = await client.send_sms_verify_code_with_options_async(
                request,
                self._runtime_options(),
            )
        except Exception as exc:
            raise _translate_exception(exc, operation="send") from None

        body = self._require_body(response)
        self._raise_for_response(body, operation="send")
        logger.info("Aliyun PNVS verification code sent to %s", _mask_phone(phone))

    async def check_verify_code(self, phone: str, code: str) -> bool:
        client = self._get_client()
        request = dypnsapi_models.CheckSmsVerifyCodeRequest(
            phone_number=phone,
            country_code=self._country_code,
            verify_code=code,
        )
        try:
            response = await client.check_sms_verify_code_with_options_async(
                request,
                self._runtime_options(),
            )
        except Exception as exc:
            raise _translate_exception(exc, operation="verify") from None

        body = self._require_body(response)
        self._raise_for_response(body, operation="verify")
        verify_result = getattr(getattr(body, "model", None), "verify_result", None)
        if str(verify_result).upper() != "PASS":
            logger.info("Aliyun PNVS rejected verification for %s", _mask_phone(phone))
            raise AliyunPnvsCodeInvalidOrExpiredError
        return True

    def _get_client(self) -> Any:
        if self._sdk_client is not None:
            return self._sdk_client

        missing = [
            name
            for name, value in (
                ("access_key_id", self._access_key_id),
                ("access_key_secret", self._access_key_secret),
                ("sign_name", self._sign_name),
                ("template_code", self._template_code),
            )
            if not value or not str(value).strip()
        ]
        if missing:
            raise AliyunPnvsConfigurationError(
                "Aliyun PNVS configuration is incomplete: " + ", ".join(missing)
            )

        self._sdk_client = DypnsapiClient(
            open_api_models.Config(
                access_key_id=self._access_key_id,
                access_key_secret=self._access_key_secret,
                endpoint=self.ENDPOINT,
                read_timeout=self._timeout_seconds * 1000,
                connect_timeout=self._timeout_seconds * 1000,
            )
        )
        return self._sdk_client

    def _runtime_options(self) -> util_models.RuntimeOptions:
        return util_models.RuntimeOptions(
            autoretry=False,
            max_attempts=1,
            read_timeout=self._timeout_seconds * 1000,
            connect_timeout=self._timeout_seconds * 1000,
        )

    @staticmethod
    def _require_body(response: Any) -> Any:
        body = getattr(response, "body", None)
        if body is None:
            raise AliyunPnvsServiceUnavailableError
        return body

    @staticmethod
    def _raise_for_response(body: Any, *, operation: str) -> None:
        code = str(getattr(body, "code", "") or "")
        success = getattr(body, "success", None)
        if success is True and code.upper() == "OK":
            return
        raise _translate_provider_error(
            code,
            getattr(body, "message", None),
            operation=operation,
        )


def _translate_exception(exc: Exception, *, operation: str) -> AliyunPnvsError:
    if isinstance(exc, TimeoutError):
        return AliyunPnvsTimeoutError
    if isinstance(exc, TeaException):
        return _translate_provider_error(
            getattr(exc, "code", None),
            getattr(exc, "message", None),
            operation=operation,
            status_code=getattr(exc, "statusCode", None),
        )

    message = repr(exc).casefold()
    if "timeout" in message or "timed out" in message:
        return AliyunPnvsTimeoutError
    return AliyunPnvsServiceUnavailableError


def _translate_provider_error(
    code: str | None,
    message: str | None,
    *,
    operation: str,
    status_code: int | None = None,
) -> AliyunPnvsError:
    haystack = f"{code or ''} {message or ''}".casefold()
    if any(
        token in haystack
        for token in (
            "throttl",
            "frequency",
            "too many",
            "rate limit",
            "business_limit",
            "minute_limit",
            "day_limit",
            "限流",
            "频繁",
        )
    ):
        return AliyunPnvsTooFrequentError
    if any(
        token in haystack
        for token in (
            "invalidaccesskey",
            "signaturedoesnotmatch",
            "signature_does_not_match",
            "unauthorized",
            "forbidden",
            "accessdenied",
            "permission",
            "account_not_exist",
            "securitytoken",
            "authentication",
        )
    ) or status_code in {401, 403}:
        return AliyunPnvsAuthenticationError
    if any(
        token in haystack
        for token in (
            "balance",
            "arrears",
            "insufficient",
            "amount_not_enough",
            "not_enough",
            "billing",
            "account_charge",
            "欠费",
            "余额",
        )
    ):
        return AliyunPnvsBillingError
    if any(token in haystack for token in ("timeout", "timed out")):
        return AliyunPnvsTimeoutError
    if status_code is not None and status_code >= 500:
        return AliyunPnvsServiceUnavailableError
    if any(
        token in haystack
        for token in (
            "serviceunavailable",
            "internalerror",
            "systemerror",
            "servererror",
        )
    ):
        return AliyunPnvsServiceUnavailableError
    if operation == "verify" and any(
        token in haystack for token in ("verify", "verifycode", "expired", "invalid")
    ):
        return AliyunPnvsCodeInvalidOrExpiredError
    if operation == "verify":
        return AliyunPnvsServiceUnavailableError
    return AliyunPnvsSendError


def _mask_phone(phone: str) -> str:
    if len(phone) < 7:
        return "***"
    return f"{phone[:3]}****{phone[-4:]}"
