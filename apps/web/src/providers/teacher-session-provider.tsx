"use client";

import { ApiClientError } from "@echo/api-client";
import { useQueryClient } from "@tanstack/react-query";
import type {
  AuthSessionResponse,
  DevelopmentLoginRequest,
  PasswordLoginRequest,
  SmsRegistrationRequest,
  User,
} from "@echo/shared-types";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { apiClient } from "@/lib/api";
import { AUTH_SESSION_EXPIRED_EVENT, clearAuthSession, getStoredAuthSession, storeAuthSession } from "@/lib/auth-session";

const SESSION_KEY = "echo.teacher.user-id";
const ACCESS_TOKEN_REFRESH_LEEWAY_MS = 60_000;
const REQUEST_TIMEOUT_MS = 4_000;

function withTimeout<T>(promise: Promise<T>, timeoutMs = REQUEST_TIMEOUT_MS) {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      window.setTimeout(() => reject(new Error("Teacher session request timed out")), timeoutMs);
    }),
  ]);
}

interface TeacherSessionContextValue {
  ready: boolean;
  user: User | null;
  login: (payload: DevelopmentLoginRequest) => Promise<User>;
  loginWithPassword: (payload: PasswordLoginRequest) => Promise<User>;
  registerWithSms: (payload: SmsRegistrationRequest) => Promise<User>;
  establishSession: (user: User) => void;
  updateUser: (patch: Partial<User>) => void;
  logout: () => Promise<void>;
}

const TeacherSessionContext = createContext<TeacherSessionContextValue | null>(null);

export function TeacherSessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const refreshingRef = useRef<Promise<User | null> | null>(null);
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  const applyAuthSession = useCallback((session: AuthSessionResponse) => {
    storeAuthSession(session);
    window.localStorage.removeItem(SESSION_KEY);
    setUser(session.user);
    return session.user;
  }, []);

  const refreshStoredSession = useCallback(async () => {
    if (refreshingRef.current) return refreshingRef.current;
    const stored = getStoredAuthSession();
    if (!stored || stored.refreshTokenExpiresAt <= Date.now()) {
      clearAuthSession();
      return null;
    }

    const refreshTask = apiClient
      .refreshSession({ refresh_token: stored.refreshToken })
      .then((session) => applyAuthSession(session))
      .catch((error) => {
        clearAuthSession();
        setUser(null);
        throw error;
      });
    refreshingRef.current = refreshTask;
    try {
      return await refreshTask;
    } finally {
      refreshingRef.current = null;
    }
  }, [applyAuthSession]);

  useEffect(() => {
    const handleExpiredSession = () => {
      queryClient.clear();
      setUser(null);
    };
    window.addEventListener(AUTH_SESSION_EXPIRED_EVENT, handleExpiredSession);
    return () => window.removeEventListener(AUTH_SESSION_EXPIRED_EVENT, handleExpiredSession);
  }, [queryClient]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const storedAuthSession = getStoredAuthSession();
        if (storedAuthSession) {
          if (storedAuthSession.refreshTokenExpiresAt <= Date.now()) {
            clearAuthSession();
            return;
          }

          let currentUser: User;
          if (storedAuthSession.accessTokenExpiresAt <= Date.now() + ACCESS_TOKEN_REFRESH_LEEWAY_MS) {
            const refreshed = await withTimeout(
              apiClient.refreshSession({ refresh_token: storedAuthSession.refreshToken }),
            );
            currentUser = applyAuthSession(refreshed);
          } else {
            try {
              currentUser = await withTimeout(apiClient.me(storedAuthSession.userId));
            } catch (error) {
              if (!(error instanceof ApiClientError) || error.status !== 401) throw error;
              const refreshed = await withTimeout(
                apiClient.refreshSession({ refresh_token: storedAuthSession.refreshToken }),
              );
              currentUser = applyAuthSession(refreshed);
            }
          }

          if (!cancelled) setUser(currentUser);
          return;
        }

        const storedUserId = window.localStorage.getItem(SESSION_KEY);
        if (!storedUserId) return;
        const currentUser = await withTimeout(apiClient.me(storedUserId));
        if (!cancelled) setUser(currentUser);
      } catch {
        clearAuthSession();
        window.localStorage.removeItem(SESSION_KEY);
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [applyAuthSession]);

  useEffect(() => {
    if (!user) return;
    const refreshIfNeeded = () => {
      const stored = getStoredAuthSession();
      if (!stored) return;
      if (stored.refreshTokenExpiresAt <= Date.now()) {
        clearAuthSession();
        setUser(null);
        return;
      }
      if (stored.accessTokenExpiresAt <= Date.now() + ACCESS_TOKEN_REFRESH_LEEWAY_MS) {
        void refreshStoredSession().catch(() => undefined);
      }
    };

    refreshIfNeeded();
    const timer = window.setInterval(refreshIfNeeded, 30_000);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") refreshIfNeeded();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [refreshStoredSession, user]);

  const establishSession = useCallback((currentUser: User) => {
    clearAuthSession();
    window.localStorage.setItem(SESSION_KEY, currentUser.id);
    queryClient.clear();
    setUser(currentUser);
  }, [queryClient]);

  const updateUser = useCallback((patch: Partial<User>) => {
    setUser((current) => (current ? { ...current, ...patch, id: current.id } : current));
  }, []);

  const login = useCallback(async (payload: DevelopmentLoginRequest) => {
    const currentUser = await apiClient.login(payload);
    clearAuthSession();
    window.localStorage.setItem(SESSION_KEY, currentUser.id);
    queryClient.clear();
    setUser(currentUser);
    return currentUser;
  }, [queryClient]);

  const loginWithPassword = useCallback(async (payload: PasswordLoginRequest) => {
    const session = await apiClient.loginWithPassword(payload);
    queryClient.clear();
    return applyAuthSession(session);
  }, [applyAuthSession, queryClient]);

  const registerWithSms = useCallback(async (payload: SmsRegistrationRequest) => {
    const session = await apiClient.registerWithSms(payload);
    queryClient.clear();
    return applyAuthSession(session);
  }, [applyAuthSession, queryClient]);

  const logout = useCallback(async () => {
    const refreshToken = getStoredAuthSession()?.refreshToken;
    try {
      if (refreshToken) {
        await withTimeout(apiClient.logout(refreshToken), 3_000);
      }
    } catch {
      // Local credentials must be cleared even when the server session is already gone.
    } finally {
      clearAuthSession();
      window.localStorage.removeItem(SESSION_KEY);
      queryClient.clear();
      setUser(null);
    }
  }, [queryClient]);

  const value = useMemo(
    () => ({
      ready,
      user,
      login,
      loginWithPassword,
      registerWithSms,
      establishSession,
      updateUser,
      logout,
    }),
    [
      establishSession,
      login,
      loginWithPassword,
      logout,
      ready,
      registerWithSms,
      updateUser,
      user,
    ],
  );

  return <TeacherSessionContext.Provider value={value}>{children}</TeacherSessionContext.Provider>;
}

export function useTeacherSession() {
  const context = useContext(TeacherSessionContext);
  if (!context) {
    throw new Error("useTeacherSession must be used within TeacherSessionProvider");
  }
  return context;
}
