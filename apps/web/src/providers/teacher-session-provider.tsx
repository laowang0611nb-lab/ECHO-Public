"use client";

import { useQueryClient } from "@tanstack/react-query";
import type { DevelopmentLoginRequest, User } from "@echo/shared-types";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { apiClient } from "@/lib/api";

const SESSION_KEY = "echo.teacher.user-id";

interface TeacherSessionContextValue {
  ready: boolean;
  user: User | null;
  login: (payload: DevelopmentLoginRequest) => Promise<User>;
  establishSession: (user: User) => void;
  updateUser: (patch: Partial<User>) => void;
  logout: () => void;
}

const TeacherSessionContext = createContext<TeacherSessionContextValue | null>(null);

export function TeacherSessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const storedUserId = window.localStorage.getItem(SESSION_KEY);
      if (!storedUserId) {
        setReady(true);
        return;
      }

      try {
        const currentUser = await Promise.race([
          apiClient.me(storedUserId),
          new Promise<never>((_, reject) => {
            window.setTimeout(() => reject(new Error("Teacher session restore timed out")), 4000);
          }),
        ]);
        if (!cancelled) {
          setUser(currentUser);
        }
      } catch {
        window.localStorage.removeItem(SESSION_KEY);
      } finally {
        if (!cancelled) {
          setReady(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const establishSession = useCallback((currentUser: User) => {
    window.localStorage.setItem(SESSION_KEY, currentUser.id);
    setUser(currentUser);
  }, []);

  const updateUser = useCallback((patch: Partial<User>) => {
    setUser((current) => (current ? { ...current, ...patch, id: current.id } : current));
  }, []);

  const login = useCallback(async (payload: DevelopmentLoginRequest) => {
    const currentUser = await apiClient.login(payload);
    queryClient.clear();
    window.localStorage.setItem(SESSION_KEY, currentUser.id);
    setUser(currentUser);
    return currentUser;
  }, [queryClient]);

  const logout = useCallback(() => {
    window.localStorage.removeItem(SESSION_KEY);
    setUser(null);
    queryClient.clear();
  }, [queryClient]);

  const value = useMemo(
    () => ({ ready, user, login, establishSession, updateUser, logout }),
    [establishSession, login, logout, ready, updateUser, user],
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
