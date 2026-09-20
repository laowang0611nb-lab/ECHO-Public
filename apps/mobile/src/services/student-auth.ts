import {
  ApiClientError,
  ApiClientTimeoutError,
} from "@echo/api-client";
import type {
  AuthSessionResponse,
  DevelopmentLoginRequest,
  PasswordResetRequest,
  PasswordResetResponse,
  PhoneVerificationPurpose,
  SmsRegistrationRequest,
  SmsSendResponse,
  SmsVerifyResponse,
  User,
} from "@echo/shared-types";

import { apiClient } from "@/lib/api-client";


export interface StudentLoginInput {
  account: string;
  password: string;
}

export interface StudentAuthResult {
  user: User;
  session: AuthSessionResponse | null;
}

export interface StudentRegisterInput {
  displayName: string;
  phone: string;
  password: string;
  email?: string | null;
  verificationToken: string;
  deviceName?: string | null;
}

export interface StudentAuthService {
  login(input: StudentLoginInput): Promise<StudentAuthResult>;
  sendSmsCode(phone: string): Promise<SmsSendResponse>;
  verifySmsCode(
    phone: string,
    code: string,
    purpose: PhoneVerificationPurpose,
  ): Promise<SmsVerifyResponse>;
  register(input: StudentRegisterInput): Promise<StudentAuthResult>;
  resetPassword(payload: PasswordResetRequest): Promise<PasswordResetResponse>;
}

export class BackendCapabilityMissingError extends Error {
  constructor(readonly capability: string) {
    super(capability);
    this.name = "BackendCapabilityMissingError";
  }
}

export class AuthInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthInputError";
  }
}

const authMode = process.env.EXPO_PUBLIC_AUTH_MODE ?? "formal";

function developmentEmailFor(account: string): string {
  const normalized = account.trim().toLowerCase();
  if (normalized.includes("@")) return normalized;
  const localPart = encodeURIComponent(normalized)
    .replace(/[^a-z0-9._-]/g, "_")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 60);
  return `${localPart || "student"}@example.com`;
}

function isEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function isMainlandPhone(value: string): boolean {
  return /^1[3-9]\d{9}$/.test(value.replace(/[\s-]/g, ""));
}

export function normalizePhone(value: string): string {
  return value.replace(/[\s-]/g, "").replace(/^\+86/, "").replace(/^86(?=1\d{10}$)/, "");
}

function authIdentifier(account: string): { email: string } | { phone: string } {
  const normalized = account.trim().toLowerCase();
  if (isEmail(normalized)) return { email: normalized };
  const phone = normalizePhone(normalized);
  if (isMainlandPhone(phone)) return { phone };
  throw new AuthInputError("请输入已注册的手机号或邮箱账号。");
}

function errorDetail(error: ApiClientError): {
  code: string;
  message: string;
} | null {
  const detail = error.detail;
  if (!detail || typeof detail !== "object") return null;
  const candidate = detail as { code?: unknown; message?: unknown };
  return {
    code: typeof candidate.code === "string" ? candidate.code : "",
    message: typeof candidate.message === "string" ? candidate.message : "",
  };
}

const plainDetailMessages: Record<string, string> = {
  "Current password is invalid": "当前密码不正确，请重新输入。",
  "Password credentials are not configured for this account":
    "该账号尚未设置密码，请先通过忘记密码设置密码。",
};

function plainDetailMessage(error: ApiClientError): string | null {
  const detail = error.detail;
  if (typeof detail !== "string") return null;
  return plainDetailMessages[detail] ?? null;
}

export function studentReadableAuthError(error: unknown): string {
  if (error instanceof AuthInputError) return error.message;
  if (error instanceof BackendCapabilityMissingError) return error.capability;
  if (error instanceof ApiClientTimeoutError) {
    return "连接超时，请检查网络后重试。";
  }
  if (error instanceof ApiClientError) {
    const detail = errorDetail(error);
    const code = detail?.code ?? "";
    const plainMessage = plainDetailMessage(error);
    if (plainMessage) return plainMessage;
    if (code === "AUTH_ACCOUNT_NOT_FOUND") {
      return "没有找到这个账号，请确认手机号或邮箱是否正确。";
    }
    if (code === "AUTH_PHONE_NOT_REGISTERED") {
      return "该手机号尚未注册，请确认手机号或先注册账号。";
    }
    if (code === "AUTH_NEW_PASSWORD_UNCHANGED") {
      return "新密码不能与当前密码相同。";
    }
    if (code === "AUTH_INVALID_PASSWORD" || error.status === 401) {
      return "密码不正确，请重新输入。";
    }
    if (code === "AUTH_ACCOUNT_LOCKED" || error.status === 423) {
      return "尝试次数过多，请稍后再试。";
    }
    if (code === "AUTH_ACCOUNT_DISABLED") {
      return "当前账号已停用，请联系教师或管理员。";
    }
    if (code === "AUTH_PHONE_ALREADY_REGISTERED") {
      return "该手机号已经注册，请直接登录或使用忘记密码。";
    }
    if (code === "AUTH_EMAIL_ALREADY_REGISTERED") {
      return "该邮箱已经注册，请直接登录或使用忘记密码。";
    }
    if (
      code === "AUTH_VERIFICATION_TOKEN_INVALID" ||
      code === "AUTH_VERIFICATION_TOKEN_EXPIRED"
    ) {
      return "验证码验证已失效，请重新获取验证码。";
    }
    if (code === "SMS_CODE_INVALID_OR_EXPIRED") {
      return "验证码错误或已失效，请检查后重试。";
    }
    if (code === "SMS_TOO_FREQUENT" || error.status === 429) {
      return detail?.message || "操作过于频繁，请稍后再试。";
    }
    if (code.startsWith("SMS_") || error.status === 502 || error.status === 503) {
      return detail?.message || "短信服务暂时不可用，请稍后重试。";
    }
    if (error.status === 400 || error.status === 422) {
      return detail?.message || "输入内容不正确，请检查后重试。";
    }
    if (error.status === 404) {
      return detail?.message || "没有找到对应账号或内容。";
    }
    if (error.status === 409) {
      return detail?.message || "当前账号状态已发生变化，请刷新后重试。";
    }
    if (error.status >= 500) {
      return "ECHO 服务暂时不可用，请稍后重试。";
    }
  }
  return "请求未能完成，请检查网络后重试。";
}

const developmentAuthService: StudentAuthService = {
  async login({ account }: StudentLoginInput) {
    const normalizedAccount = account.trim();
    const payload: DevelopmentLoginRequest = {
      email: developmentEmailFor(normalizedAccount),
      display_name: normalizedAccount,
      role: "student",
    };
    return { user: await apiClient.login(payload), session: null };
  },
  async sendSmsCode(phone) {
    return apiClient.sendSmsCode({ phone: normalizePhone(phone) });
  },
  async verifySmsCode(phone, code, purpose) {
    return apiClient.verifySmsCode({
      phone: normalizePhone(phone),
      code: code.trim(),
      purpose,
    });
  },
  async register(input) {
    const payload: SmsRegistrationRequest = {
      phone: normalizePhone(input.phone),
      verification_token: input.verificationToken,
      display_name: input.displayName.trim(),
      password: input.password,
      email: input.email?.trim().toLowerCase() || null,
      role: "student",
      device_name: input.deviceName || "ECHO Android",
    };
    const session = await apiClient.registerWithSms(payload);
    return { user: session.user, session };
  },
  async resetPassword(payload) {
    return apiClient.resetPassword(payload);
  },
};

const formalAuthService: StudentAuthService = {
  async login({ account, password }) {
    const session = await apiClient.loginWithPassword({
      ...authIdentifier(account),
      password,
      device_name: "ECHO Android",
    });
    return { user: session.user, session };
  },
  async sendSmsCode(phone) {
    const normalized = normalizePhone(phone);
    if (!isMainlandPhone(normalized)) {
      throw new AuthInputError("请输入正确的 11 位手机号。");
    }
    return apiClient.sendSmsCode({ phone: normalized });
  },
  async verifySmsCode(phone, code, purpose) {
    return apiClient.verifySmsCode({
      phone: normalizePhone(phone),
      code: code.trim(),
      purpose,
    });
  },
  async register(input) {
    const payload: SmsRegistrationRequest = {
      phone: normalizePhone(input.phone),
      verification_token: input.verificationToken,
      display_name: input.displayName.trim(),
      password: input.password,
      email: input.email?.trim().toLowerCase() || null,
      role: "student",
      device_name: input.deviceName || "ECHO Android",
    };
    const session = await apiClient.registerWithSms(payload);
    return { user: session.user, session };
  },
  async resetPassword(payload) {
    return apiClient.resetPassword({
      ...payload,
      phone: normalizePhone(payload.phone),
    });
  },
};

export const studentAuthService: StudentAuthService =
  authMode === "development" ? developmentAuthService : formalAuthService;

export const isDevelopmentAuth = authMode === "development";
