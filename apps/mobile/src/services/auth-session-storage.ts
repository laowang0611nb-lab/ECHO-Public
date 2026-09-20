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
let sessionVersion = 0;
let storageQueue: Promise<void> = Promise.resolve();

const expiredListeners = new Set<() => void>();

function enqueueSessionStorage<T>(task: () => Promise<T>): Promise<T> {
  const result = storageQueue.then(task, task);
  storageQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

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
    sessionVersion += 1;
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(stored);
    const storedSession = isStoredAuthSession(parsed) ? parsed : null;
    const session = storedSession?.session ?? (isAuthSession(parsed) ? parsed : null);
    if (!session) {
      await studentStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
      cachedSession = null;
      sessionVersion += 1;
      return null;
    }
    const currentApiBaseUrl = getApiBaseUrlSync();
    if (storedSession && storedSession.apiBaseUrl !== currentApiBaseUrl) {
      await clearAuthSession();
      return null;
    }
    cachedSession = session;
    sessionVersion += 1;
    if (!storedSession) {
      await persistAuthSession(session);
    }
    return session;
  } catch {
    await studentStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
    cachedSession = null;
    sessionVersion += 1;
    return null;
  }
}

export async function persistAuthSession(
  session: AuthSessionResponse,
): Promise<void> {
  const version = sessionVersion + 1;
  sessionVersion = version;
  cachedSession = session;
  const stored: StoredAuthSession = {
    version: 1,
    apiBaseUrl: getApiBaseUrlSync(),
    session,
  };
  await enqueueSessionStorage(async () => {
    if (version !== sessionVersion) return;
    await studentStorage.setItem(
      AUTH_SESSION_STORAGE_KEY,
      JSON.stringify(stored),
    );
  });
}

export async function clearAuthSession(): Promise<void> {
  sessionVersion += 1;
  cachedSession = null;
  try {
    await enqueueSessionStorage(() =>
      studentStorage.removeItem(AUTH_SESSION_STORAGE_KEY),
    );
  } finally {
    for (const listener of expiredListeners) listener();
  }
}

export function subscribeAuthSessionExpired(listener: () => void): () => void {
  expiredListeners.add(listener);
  return () => expiredListeners.delete(listener);
}
