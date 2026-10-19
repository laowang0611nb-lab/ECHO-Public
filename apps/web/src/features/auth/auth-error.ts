import { ApiClientError } from "@echo/api-client";

type AuthErrorDetail = {
  code?: string;
  message?: string;
};

function readAuthErrorDetail(error: ApiClientError): AuthErrorDetail | null {
  if (!error.detail || typeof error.detail !== "object") return null;
  return error.detail as AuthErrorDetail;
}

export function mapAuthError(error: unknown): string {
  if (error instanceof ApiClientError) {
    const detail = readAuthErrorDetail(error);
    const code = detail?.code;

    if (code === "AUTH_ACCOUNT_NOT_FOUND" || error.status === 404) {
      return "账号不存在，请检查手机号或邮箱。";
    }
    if (code === "AUTH_INVALID_PASSWORD" || error.status === 401) {
      return "账号或密码错误。";
    }
    if (code === "AUTH_ACCOUNT_LOCKED" || error.status === 423) {
      return "连续登录失败次数过多，账号已锁定 15 分钟。";
    }
    if (code === "AUTH_REGISTRATION_DISABLED") {
      return "公开注册已关闭，请使用预建演示账号登录。";
    }
    if (code === "AUTH_ACCOUNT_DISABLED" || error.status === 403) {
      return "当前账号已停用，请联系管理员。";
    }
    if (code === "AUTH_PHONE_ALREADY_REGISTERED" || code === "AUTH_EMAIL_ALREADY_REGISTERED" || error.status === 409) {
      return "该手机号或邮箱已注册，请直接登录或重置密码。";
    }
    if (code === "AUTH_PHONE_NOT_REGISTERED") {
      return "该手机号尚未注册教师账号。";
    }
    if (code === "AUTH_VERIFICATION_TOKEN_INVALID" || code === "AUTH_VERIFICATION_TOKEN_EXPIRED") {
      return "验证码错误或已失效，请重新验证手机号。";
    }
    if (code === "AUTH_SESSION_INVALID") {
      return "登录会话已失效，请重新登录。";
    }
    if (error.status === 429) return "操作过于频繁，请稍后再试。";
    if (error.status === 503) return "认证服务暂时不可用，请稍后重试。";
    if (error.status === 504) return "认证服务响应超时，请稍后重试。";
    if (error.status === 422) return "提交内容格式不正确，请检查后重试。";
    if (detail?.message && !detail.message.includes("ECHO API")) return detail.message;
  }

  if (error instanceof TypeError) {
    return "无法连接认证服务，请检查网络后重试。";
  }
  return error instanceof Error ? error.message : "认证请求失败，请稍后重试。";
}
