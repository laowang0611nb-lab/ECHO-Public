import { ApiClientError } from "@echo/api-client";

type SmsDetail = {
  code?: string;
  message?: string;
};

function readSmsDetail(error: ApiClientError): SmsDetail | null {
  if (!error.detail || typeof error.detail !== "object") {
    return null;
  }
  return error.detail as SmsDetail;
}

export function mapSmsError(error: unknown): string {
  if (error instanceof ApiClientError) {
    const detail = readSmsDetail(error);
    const code = detail?.code;
    const fallbackMessage = detail?.message?.trim();

    if (code === "SMS_CODE_INVALID_OR_EXPIRED" || error.status === 400) {
      return "验证码错误或已失效。";
    }
    if (code === "SMS_TOO_FREQUENT" || error.status === 429) {
      return "操作过于频繁，请稍后再试。";
    }
    if (code === "SMS_PROVIDER_NOT_CONFIGURED") {
      return "短信服务尚未配置，请联系管理员。";
    }
    if (code === "SMS_TIMEOUT" || error.status === 504) {
      return "短信服务响应超时，请稍后重试。";
    }
    if (
      code === "SMS_AUTH_FAILED" ||
      code === "SMS_BILLING_UNAVAILABLE" ||
      code === "SMS_SERVICE_UNAVAILABLE" ||
      error.status === 503
    ) {
      return "短信服务暂时不可用，请稍后重试。";
    }
    if (code === "SMS_SEND_FAILED" || error.status === 502) {
      return "验证码发送失败，请稍后重试。";
    }
    if (error.status === 422) {
      return "请输入有效的中国大陆手机号。";
    }
    if (fallbackMessage && !fallbackMessage.includes("ECHO API")) {
      return fallbackMessage;
    }
    return "短信服务暂时不可用，请稍后重试。";
  }

  if (error instanceof TypeError) {
    return "无法连接认证服务，请检查网络后重试。";
  }

  return error instanceof Error ? error.message : "请求失败，请稍后重试。";
}
