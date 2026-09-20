import { ApiClientError } from "@echo/api-client";
import type { AuthSessionResponse, User } from "@echo/shared-types";
import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import { apiClient } from "@/lib/api-client";
import { hydrateApiBaseUrl } from "@/services/api-network-config";
import {
  clearAuthSession,
  getCachedAuthSession,
  getRefreshTokenSync,
  hydrateAuthSession,
  persistAuthSession,
  subscribeAuthSessionExpired,
} from "@/services/auth-session-storage";
import {
  isDevelopmentAuth,
  PENDING_COURSE_CODE_KEY,
  studentAuthService,
  type StudentLoginInput,
  type StudentRegisterInput,
} from "@/services/student-auth";
import {
  studentCourseStorageKey,
  studentStorage,
} from "@/services/student-storage";

const LEGACY_SESSION_USER_KEY = "echo.student.session.user";

interface StudentSessionValue {
  user: User | null;
  ready: boolean;
  login: (input: StudentLoginInput) => Promise<User>;
  register: (input: StudentRegisterInput) => Promise<User>;
  refreshUser: () => Promise<User | null>;
  logout: () => Promise<void>;
}

const StudentSessionContext = createContext<StudentSessionValue | null>(null);

export function StudentSessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(
    () =>
      subscribeAuthSessionExpired(() => {
        setUser(null);
        queryClient.clear();
      }),
    [queryClient],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        await hydrateApiBaseUrl();
        const session = await hydrateAuthSession();
        if (session) {
          try {
            const freshUser = await apiClient.me(session.user.id);
            if (!cancelled) setUser(freshUser);
            const latestSession = getCachedAuthSession() ?? session;
            await persistAuthSession({ ...latestSession, user: freshUser });
          } catch (error) {
            const unauthorized =
              error instanceof ApiClientError && error.status === 401;
            if (unauthorized) {
              await clearAuthSession();
            } else if (!cancelled) {
              setUser(session.user);
            }
          }
          return;
        }

        if (isDevelopmentAuth) {
          const legacy = await studentStorage.getItem(LEGACY_SESSION_USER_KEY);
          if (legacy && !cancelled) {
            try {
              setUser(JSON.parse(legacy) as User);
            } catch {
              await studentStorage.removeItem(LEGACY_SESSION_USER_KEY);
            }
          }
        } else {
          await studentStorage.removeItem(LEGACY_SESSION_USER_KEY);
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function applyAuthResult(
    nextUser: User,
    session: AuthSessionResponse | null,
  ) {
    if (session) {
      await persistAuthSession(session);
    } else {
      await studentStorage.setItem(
        LEGACY_SESSION_USER_KEY,
        JSON.stringify(nextUser),
      );
    }
    setUser(nextUser);
    return nextUser;
  }

  async function login(input: StudentLoginInput) {
    const result = await studentAuthService.login(input);
    return applyAuthResult(result.user, result.session);
  }

  async function register(input: StudentRegisterInput) {
    const result = await studentAuthService.register(input);
    return applyAuthResult(result.user, result.session);
  }

  async function refreshUser() {
    const currentUserId = user?.id ?? getCachedAuthSession()?.user.id;
    if (!currentUserId) return null;
    const freshUser = await apiClient.me(currentUserId);
    setUser(freshUser);
    const session = getCachedAuthSession();
    if (session) {
      await persistAuthSession({ ...session, user: freshUser });
    }
    return freshUser;
  }

  async function logout() {
    const refreshToken = getRefreshTokenSync();
    if (refreshToken) {
      try {
        await apiClient.logout(refreshToken);
      } catch {
        // Local logout must still succeed if the server is unavailable.
      }
    }
    await Promise.allSettled([
      clearAuthSession(),
      studentStorage.removeItem(LEGACY_SESSION_USER_KEY),
      studentStorage.removeItem(PENDING_COURSE_CODE_KEY),
      user
        ? studentStorage.removeItem(studentCourseStorageKey(user.id))
        : Promise.resolve(),
    ]);
    queryClient.clear();
    setUser(null);
  }

  const value = { user, ready, login, register, refreshUser, logout };

  return (
    <StudentSessionContext.Provider value={value}>
      {children}
    </StudentSessionContext.Provider>
  );
}

export function useStudentSession(): StudentSessionValue {
  const context = useContext(StudentSessionContext);
  if (!context) {
    throw new Error("useStudentSession must be used inside StudentSessionProvider");
  }
  return context;
}
