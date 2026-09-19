import { createApiClient } from "@echo/api-client";

import { getAccessToken } from "@/lib/auth-session";

export const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

export function resolveApiUrl(value: string | null | undefined) {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  return `${apiBaseUrl.replace(/\/$/, "")}${value.startsWith("/") ? value : `/${value}`}`;
}

export const apiClient = createApiClient({ baseUrl: apiBaseUrl, getAccessToken });
