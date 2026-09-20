import type { AuthSessionResponse } from "@echo/shared-types";

import { getApiBaseUrlSync } from "@/services/api-network-config";
import { studentStorage } from "@/services/student-storage";

export const AUTH_SESSION_STORAGE_KEY = "echo.student.auth.session.v1";

interface StoredAuthSession {
  version: 1;
  apiBaseUrl: string;
  session: AuthSessionResponse;
}

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

function isStoredAuthSession(value: unknown): value is StoredAuthSession {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<StoredAuthSession>;
  return (
    candidate.version === 1 &&
    typeof candidate.apiBaseUrl === "string" &&
    isAuthSession(candidate.session)
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
    const storedSession = isStoredAuthSession(parsed) ? parsed : null;
    const session = storedSession?.session ?? (isAuthSession(parsed) ? parsed : null);
    if (!session) {
      await studentStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
      cachedSession = null;
      return null;
    }
    const currentApiBaseUrl = getApiBaseUrlSync();
    if (storedSession && storedSession.apiBaseUrl !== currentApiBaseUrl) {
      await clearAuthSession();
      return null;
    }
    cachedSession = session;
    if (!storedSession) {
      await persistAuthSession(session);
    }
    return session;
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
  const stored: StoredAuthSession = {
    version: 1,
    apiBaseUrl: getApiBaseUrlSync(),
    session,
  };
  await studentStorage.setItem(
    AUTH_SESSION_STORAGE_KEY,
    JSON.stringify(stored),
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
