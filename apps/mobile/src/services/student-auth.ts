import { ApiClientError } from "@echo/api-client";
import type { DevelopmentLoginRequest, User } from "@echo/shared-types";

import { apiClient } from "@/lib/api-client";

export function studentReadableAuthError(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.status === 400 || error.status === 422) {
      return "输入内容不正确，请检查后重试。";
    }
    if (error.status === 401) {
      return "账号或密码不正确，请重新登录。";
    }
    if (error.status === 403) {
      return "当前账号没有执行此操作的权限。";
    }
    if (error.status === 404) {
      return "没有找到对应内容，请检查课程码或稍后重试。";
    }
    if (error.status === 409) {
      return "当前状态已发生变化，请刷新后重试。";
    }
    if (error.status >= 500) {
      return "ECHO 服务暂时不可用，请稍后重试。";
    }
    return "请求未能完成，请稍后重试。";
  }
  return "ECHO 服务暂时不可用，请检查网络后重试。";
}


export const PENDING_COURSE_CODE_KEY = "echo.student.pending-course-code";

export interface StudentLoginInput {
  account: string;
  password: string;
}

export interface StudentAuthService {
  login(input: StudentLoginInput): Promise<User>;
}

export class BackendCapabilityMissingError extends Error {
  constructor(readonly capability: string) {
    super(capability);
    this.name = "BackendCapabilityMissingError";
  }
}

const authMode = process.env.EXPO_PUBLIC_AUTH_MODE ?? "development";

function developmentEmailFor(account: string): string {
  const normalized = account.trim().toLowerCase();
  if (normalized.includes("@")) {
    return normalized;
  }

  const localPart = encodeURIComponent(normalized)
    .replace(/[^a-z0-9._-]/g, "_")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 60);
  return `${localPart || "student"}@example.com`;
}

const developmentAuthService: StudentAuthService = {
  async login({ account }: StudentLoginInput) {
    const normalizedAccount = account.trim();
    const payload: DevelopmentLoginRequest = {
      email: developmentEmailFor(normalizedAccount),
      display_name: normalizedAccount,
      role: "student",
    };
    return apiClient.login(payload);
  },
};

const formalAuthService: StudentAuthService = {
  async login() {
    // Formal account/password login is specified in the database V1 plan but is not
    // available in the current backend. The UI must not invent or call a replacement URL.
    throw new BackendCapabilityMissingError(
      "POST /api/v1/auth/login (account/password) is not implemented",
    );
  },
};

export const studentAuthService: StudentAuthService =
  authMode === "development" ? developmentAuthService : formalAuthService;

export const isDevelopmentAuth = authMode === "development";
