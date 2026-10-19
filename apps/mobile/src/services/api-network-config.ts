import { fetch as expoFetch } from "expo/fetch";

import { studentStorage } from "@/services/student-storage";

const API_BASE_URL_STORAGE_KEY = "echo.student.api-base-url.v1";
const PUBLIC_API_BASE_URL = "https://example.com";
const ALLOW_INSECURE_API_OVERRIDE =
  __DEV__ || process.env.EXPO_PUBLIC_ALLOW_INSECURE_API_OVERRIDE === "true";
const BUILD_TIME_API_BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL?.trim() ||
  (__DEV__ ? "http://127.0.0.1:8000" : PUBLIC_API_BASE_URL);

let cachedApiBaseUrl = normalizeApiBaseUrl(BUILD_TIME_API_BASE_URL);

export function normalizeApiBaseUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("服务器地址不能为空。");
  }
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `http://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error("服务器地址格式不正确。");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("服务器地址仅支持 HTTP 或 HTTPS。");
  }
  if (!ALLOW_INSECURE_API_OVERRIDE && parsed.protocol !== "https:") {
    throw new Error("正式比赛版只允许使用 HTTPS 服务器地址。");
  }
  if (!parsed.hostname || parsed.hostname === "0.0.0.0") {
    throw new Error("请输入电脑可被手机访问的地址。");
  }
  if (parsed.username || parsed.password) {
    throw new Error("服务器地址不能包含账号或密码。");
  }
  parsed.hash = "";
  parsed.search = "";
  const pathname = parsed.pathname.replace(/\/+$/, "");
  return `${parsed.origin}${pathname}`;
}

export function getDefaultApiBaseUrl(): string {
  return normalizeApiBaseUrl(BUILD_TIME_API_BASE_URL);
}

export function getApiBaseUrlSync(): string {
  return cachedApiBaseUrl;
}

export async function hydrateApiBaseUrl(): Promise<string> {
  const stored = await studentStorage.getItem(API_BASE_URL_STORAGE_KEY);
  if (!stored) {
    cachedApiBaseUrl = getDefaultApiBaseUrl();
    return cachedApiBaseUrl;
  }
  try {
    cachedApiBaseUrl = normalizeApiBaseUrl(stored);
    return cachedApiBaseUrl;
  } catch {
    await studentStorage.removeItem(API_BASE_URL_STORAGE_KEY);
    cachedApiBaseUrl = getDefaultApiBaseUrl();
    return cachedApiBaseUrl;
  }
}

export async function persistApiBaseUrl(value: string): Promise<string> {
  const normalized = normalizeApiBaseUrl(value);
  await studentStorage.setItem(API_BASE_URL_STORAGE_KEY, normalized);
  cachedApiBaseUrl = normalized;
  return normalized;
}

export async function resetApiBaseUrl(): Promise<string> {
  await studentStorage.removeItem(API_BASE_URL_STORAGE_KEY);
  cachedApiBaseUrl = getDefaultApiBaseUrl();
  return cachedApiBaseUrl;
}

export async function testApiBaseUrl(value: string): Promise<{
  ok: boolean;
  baseUrl: string;
  version: string | null;
  message: string;
}> {
  const normalized = normalizeApiBaseUrl(value);
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, 5_000);
  try {
    const response = await expoFetch(`${normalized}/api/v1/health`, {
      signal: controller.signal,
    });
    if (!response.ok) {
      return {
        ok: false,
        baseUrl: normalized,
        version: null,
        message: "服务器已响应，但健康检查未通过。",
      };
    }
    const body = (await response.json()) as {
      status?: unknown;
      version?: unknown;
    };
    const healthy = body.status === "ok";
    return {
      ok: healthy,
      baseUrl: normalized,
      version: typeof body.version === "string" ? body.version : null,
      message: healthy ? "连接成功。" : "服务器状态异常。",
    };
  } catch {
    return {
      ok: false,
      baseUrl: normalized,
      version: null,
      message: timedOut
        ? "连接超时，请检查服务器是否可达。"
        : ALLOW_INSECURE_API_OVERRIDE
          ? "无法连接，请检查网络、监听地址和防火墙。"
          : "无法连接，请检查网络和公网 HTTPS 服务状态。",
    };
  } finally {
    clearTimeout(timer);
  }
}
