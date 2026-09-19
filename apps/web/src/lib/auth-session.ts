import type { AuthSessionResponse } from "@echo/shared-types";

const AUTH_SESSION_KEY = "echo.teacher.auth.session";

export interface StoredAuthSession {
  userId: string;
  sessionId: string;
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: number;
  refreshTokenExpiresAt: number;
}

let memorySession: StoredAuthSession | null = null;
let hydrated = false;

function readStoredSession(): StoredAuthSession | null {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(AUTH_SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredAuthSession>;
    if (
      typeof parsed.userId !== "string" ||
      typeof parsed.sessionId !== "string" ||
      typeof parsed.accessToken !== "string" ||
      typeof parsed.refreshToken !== "string" ||
      typeof parsed.accessTokenExpiresAt !== "number" ||
      typeof parsed.refreshTokenExpiresAt !== "number"
    ) {
      return null;
    }
    return parsed as StoredAuthSession;
  } catch {
    return null;
  }
}

function persistStoredSession(session: StoredAuthSession | null) {
  memorySession = session;
  hydrated = true;
  if (typeof window === "undefined") return;
  if (session) {
    window.sessionStorage.setItem(AUTH_SESSION_KEY, JSON.stringify(session));
  } else {
    window.sessionStorage.removeItem(AUTH_SESSION_KEY);
  }
}

export function getStoredAuthSession(): StoredAuthSession | null {
  if (!hydrated) {
    memorySession = readStoredSession();
    hydrated = true;
  }
  return memorySession;
}

export function getAccessToken(): string | null {
  return getStoredAuthSession()?.accessToken ?? null;
}

export function storeAuthSession(response: AuthSessionResponse): StoredAuthSession {
  const refreshExpiresAt = Date.parse(response.refresh_expires_at);
  const session: StoredAuthSession = {
    userId: response.user.id,
    sessionId: response.session_id,
    accessToken: response.access_token,
    refreshToken: response.refresh_token,
    accessTokenExpiresAt: Date.now() + response.expires_in_seconds * 1000,
    refreshTokenExpiresAt: Number.isNaN(refreshExpiresAt)
      ? Date.now() + 30 * 24 * 60 * 60 * 1000
      : refreshExpiresAt,
  };
  persistStoredSession(session);
  return session;
}

export function clearAuthSession() {
  persistStoredSession(null);
}
