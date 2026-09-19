from datetime import UTC, datetime, timedelta
from types import SimpleNamespace

import pytest
from database.auth.tokens import (
    create_phone_verification_token,
    decode_phone_verification_token,
)
from httpx import AsyncClient
from Tea.exceptions import TeaException

from app.api.dependencies import get_aliyun_pnvs_provider
from app.core.config import Settings
from app.main import app
from app.services.aliyun_pnvs import (
    AliyunPnvsAuthenticationError,
    AliyunPnvsBillingError,
    AliyunPnvsCodeInvalidOrExpiredError,
    AliyunPnvsConfigurationError,
    AliyunPnvsProvider,
    AliyunPnvsSendError,
    AliyunPnvsTimeoutError,
    AliyunPnvsTooFrequentError,
)

PHONE = "13800138000"
OTHER_PHONE = "13900139000"


class FakeSdkClient:
    def __init__(
        self,
        *,
        send_body: object | None = None,
        check_body: object | None = None,
        send_error: Exception | None = None,
        check_error: Exception | None = None,
    ) -> None:
        self.send_body = send_body
        self.check_body = check_body
        self.send_error = send_error
        self.check_error = check_error
        self.send_request = None
        self.check_request = None
        self.send_runtime = None
        self.check_runtime = None

    async def send_sms_verify_code_with_options_async(self, request, runtime):
        self.send_request = request
        self.send_runtime = runtime
        if self.send_error is not None:
            raise self.send_error
        return SimpleNamespace(body=self.send_body)

    async def check_sms_verify_code_with_options_async(self, request, runtime):
        self.check_request = request
        self.check_runtime = runtime
        if self.check_error is not None:
            raise self.check_error
        return SimpleNamespace(body=self.check_body)


def make_provider(sdk_client: FakeSdkClient) -> AliyunPnvsProvider:
    return AliyunPnvsProvider(
        access_key_id="test-access-key-id",
        access_key_secret="test-access-key-secret",
        sign_name="test-sign",
        template_code="100001",
        country_code="86",
        valid_time=300,
        interval=60,
        timeout_seconds=10,
        sdk_client=sdk_client,
    )


def success_body(*, verify_result: str | None = None) -> SimpleNamespace:
    return SimpleNamespace(
        success=True,
        code="OK",
        message="success",
        model=SimpleNamespace(verify_result=verify_result),
    )


async def test_send_sms_success(client: AsyncClient, pnvs_provider) -> None:
    response = await client.post("/api/v1/auth/sms/send", json={"phone": PHONE})

    assert response.status_code == 200
    assert response.json() == {
        "success": True,
        "message": "验证码已发送",
        "cooldown_seconds": 60,
    }
    assert pnvs_provider.sent_phones == [PHONE]


async def test_send_sms_normalizes_mainland_prefix(
    client: AsyncClient,
    pnvs_provider,
) -> None:
    response = await client.post("/api/v1/auth/sms/send", json={"phone": "+86 138-0013-8000"})

    assert response.status_code == 200
    assert pnvs_provider.sent_phones == [PHONE]


async def test_send_sms_rejects_invalid_phone(
    client: AsyncClient,
    pnvs_provider,
) -> None:
    response = await client.post("/api/v1/auth/sms/send", json={"phone": "12345"})

    assert response.status_code == 422
    assert pnvs_provider.sent_phones == []


async def test_send_sms_maps_provider_failure(client: AsyncClient, pnvs_provider) -> None:
    pnvs_provider.send_error = AliyunPnvsSendError()

    response = await client.post("/api/v1/auth/sms/send", json={"phone": PHONE})

    assert response.status_code == 502
    assert response.json()["detail"]["code"] == "SMS_SEND_FAILED"


async def test_send_sms_maps_frequency_limit(client: AsyncClient, pnvs_provider) -> None:
    pnvs_provider.send_error = AliyunPnvsTooFrequentError()

    response = await client.post("/api/v1/auth/sms/send", json={"phone": PHONE})

    assert response.status_code == 429
    assert response.headers["retry-after"] == "60"
    assert response.json()["detail"]["code"] == "SMS_TOO_FREQUENT"


async def test_send_sms_missing_configuration_returns_503(client: AsyncClient) -> None:
    provider = AliyunPnvsProvider(
        access_key_id=None,
        access_key_secret=None,
        sign_name=None,
        template_code="100001",
        country_code="86",
        valid_time=300,
        interval=60,
        timeout_seconds=10,
    )
    app.dependency_overrides[get_aliyun_pnvs_provider] = lambda: provider

    response = await client.post("/api/v1/auth/sms/send", json={"phone": PHONE})

    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "SMS_PROVIDER_NOT_CONFIGURED"


async def test_verify_sms_success_returns_phone_verification_token(
    client: AsyncClient,
    pnvs_provider,
) -> None:
    response = await client.post(
        "/api/v1/auth/sms/verify",
        json={"phone": PHONE, "code": "8043"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["success"] is True
    assert body["verified"] is True
    assert body["expires_in_seconds"] == 300
    payload = decode_phone_verification_token(
        body["verification_token"],
    )
    assert payload["phone"] == PHONE
    assert payload["purpose"] == "phone_verification"
    assert pnvs_provider.verify_calls == [(PHONE, "8043")]


async def test_verify_sms_rejects_non_pass(
    client: AsyncClient,
    pnvs_provider,
) -> None:
    pnvs_provider.verify_error = AliyunPnvsCodeInvalidOrExpiredError()

    response = await client.post(
        "/api/v1/auth/sms/verify",
        json={"phone": PHONE, "code": "8043"},
    )

    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "SMS_CODE_INVALID_OR_EXPIRED"


async def test_send_maps_sdk_code_ok_as_success_and_preserves_request_fields() -> None:
    sdk_client = FakeSdkClient(send_body=success_body())
    provider = make_provider(sdk_client)

    await provider.send_verify_code(PHONE)

    request = sdk_client.send_request
    assert request.phone_number == PHONE
    assert request.sign_name == "test-sign"
    assert request.template_code == "100001"
    assert request.template_param == '{"code":"##code##","min":"5"}'
    assert request.country_code == "86"
    assert request.valid_time == 300
    assert request.interval == 60
    assert request.code_length == 4
    assert request.code_type == 1
    assert request.return_verify_code is False
    assert sdk_client.send_runtime.autoretry is False
    assert sdk_client.send_runtime.max_attempts == 1


async def test_verify_requires_pass_even_when_success_and_code_are_ok() -> None:
    sdk_client = FakeSdkClient(check_body=success_body(verify_result="UNKNOWN"))
    provider = make_provider(sdk_client)

    with pytest.raises(AliyunPnvsCodeInvalidOrExpiredError):
        await provider.check_verify_code(PHONE, "8043")


async def test_verify_pass_returns_true() -> None:
    sdk_client = FakeSdkClient(check_body=success_body(verify_result="PASS"))
    provider = make_provider(sdk_client)

    assert await provider.check_verify_code(PHONE, "8043") is True
    assert sdk_client.check_request.phone_number == PHONE
    assert sdk_client.check_request.verify_code == "8043"
    assert sdk_client.check_request.country_code == "86"


async def test_sdk_frequency_error_is_mapped_without_leaking_details() -> None:
    sdk_client = FakeSdkClient(
        send_error=TeaException({"code": "isv.BUSINESS_LIMIT_CONTROL", "message": "too frequent"})
    )
    provider = make_provider(sdk_client)

    with pytest.raises(AliyunPnvsTooFrequentError):
        await provider.send_verify_code(PHONE)


@pytest.mark.parametrize(
    ("provider_code", "expected_error"),
    [
        ("InvalidAccessKeyId.NotFound", AliyunPnvsAuthenticationError),
        ("AccountArrears", AliyunPnvsBillingError),
        ("RequestTimeout", AliyunPnvsTimeoutError),
    ],
)
async def test_sdk_provider_errors_are_mapped(provider_code, expected_error) -> None:
    sdk_client = FakeSdkClient(
        send_error=TeaException({"code": provider_code, "message": provider_code})
    )
    provider = make_provider(sdk_client)

    with pytest.raises(expected_error):
        await provider.send_verify_code(PHONE)


async def test_missing_credentials_are_rejected() -> None:
    provider = AliyunPnvsProvider(
        access_key_id=None,
        access_key_secret=None,
        sign_name=None,
        template_code="100001",
        country_code="86",
        valid_time=300,
        interval=60,
        timeout_seconds=10,
    )

    with pytest.raises(AliyunPnvsConfigurationError):
        await provider.send_verify_code(PHONE)


def test_phone_verification_token_contains_required_claims() -> None:
    now = datetime.now(UTC)
    token = create_phone_verification_token(
        PHONE,
        secret_key="test-secret-with-at-least-thirty-two-bytes",
        now=now,
        expires_delta=timedelta(minutes=5),
    )

    payload = decode_phone_verification_token(
        token,
        secret_key="test-secret-with-at-least-thirty-two-bytes",
    )

    assert payload["phone"] == PHONE
    assert payload["purpose"] == "phone_verification"
    assert payload["jti"]
    assert payload["exp"] == int((now + timedelta(minutes=5)).timestamp())


def test_aliyun_pnvs_standard_environment_names_are_supported(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    values = {
        "ALIBABA_CLOUD_ACCESS_KEY_ID": "test-id",
        "ALIBABA_CLOUD_ACCESS_KEY_SECRET": "test-secret",
        "ALIYUN_PNVS_SIGN_NAME": "test-sign",
        "ALIYUN_PNVS_TEMPLATE_CODE": "100001",
        "ALIYUN_PNVS_COUNTRY_CODE": "86",
        "ALIYUN_PNVS_VALID_TIME": "300",
        "ALIYUN_PNVS_INTERVAL": "60",
        "ALIYUN_PNVS_TIMEOUT_SECONDS": "10",
    }
    for key, value in values.items():
        monkeypatch.setenv(key, value)

    configured = Settings(_env_file=None)

    assert configured.alibaba_cloud_access_key_id == "test-id"
    assert configured.alibaba_cloud_access_key_secret == "test-secret"
    assert configured.aliyun_pnvs_sign_name == "test-sign"
    assert configured.aliyun_pnvs_template_code == "100001"
    assert configured.aliyun_pnvs_configured is True


async def test_verify_token_purpose_mismatch_is_rejected() -> None:
    token = create_phone_verification_token(
        OTHER_PHONE,
        purpose="other-purpose",
        secret_key="test-secret-with-at-least-thirty-two-bytes",
    )

    with pytest.raises(ValueError):
        decode_phone_verification_token(
            token,
            secret_key="test-secret-with-at-least-thirty-two-bytes",
        )
