import type { AuthSessionResponse } from "@echo/shared-types";

import { studentStorage } from "@/services/student-storage";

export const AUTH_SESSION_STORAGE_KEY = "echo.student.auth.session.v1";

let cachedSession: AuthSessionResponse | null = null;

const expiredListeners = new Set<() => void>();

function isAuthSession(value: unknown): value is AuthSessionResponse {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<AuthSessionResponse>;
  return (
    typeof candidate.access_token === "string" &&
    typeof candidate.refresh_token === "string" &&
    typeof candidate.session_id === "string" &&
    typeof candidate.refresh_expires_at === "string" &&
    Boolean(candidate.user)
  );
}

export function getCachedAuthSession(): AuthSessionResponse | null {
  return cachedSession;
}

export function getAccessTokenSync(): string | null {
  return cachedSession?.access_token ?? null;
}

export function getRefreshTokenSync(): string | null {
  return cachedSession?.refresh_token ?? null;
}

export async function hydrateAuthSession(): Promise<AuthSessionResponse | null> {
  const stored = await studentStorage.getItem(AUTH_SESSION_STORAGE_KEY);
  if (!stored) {
    cachedSession = null;
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(stored);
    if (!isAuthSession(parsed)) {
      await studentStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
      cachedSession = null;
      return null;
    }
    cachedSession = parsed;
    return parsed;
  } catch {
    await studentStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
    cachedSession = null;
    return null;
  }
}

export async function persistAuthSession(
  session: AuthSessionResponse,
): Promise<void> {
  cachedSession = session;
  await studentStorage.setItem(
    AUTH_SESSION_STORAGE_KEY,
    JSON.stringify(session),
  );
}

export async function clearAuthSession(): Promise<void> {
  cachedSession = null;
  await studentStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
  for (const listener of expiredListeners) listener();
}

export function subscribeAuthSessionExpired(listener: () => void): () => void {
  expiredListeners.add(listener);
  return () => expiredListeners.delete(listener);
}
