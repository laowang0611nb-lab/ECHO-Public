import type { User } from "@echo/shared-types";
import { useQueryClient } from "@tanstack/react-query";
import {
  studentCourseStorageKey,
  studentStorage,
} from "@/services/student-storage";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { studentAuthService, type StudentLoginInput } from "@/services/student-auth";

const SESSION_USER_KEY = "echo.student.session.user";

interface StudentSessionValue {
  user: User | null;
  ready: boolean;
  login: (input: StudentLoginInput) => Promise<User>;
  logout: () => Promise<void>;
}

const StudentSessionContext = createContext<StudentSessionValue | null>(null);

export function StudentSessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const stored = await studentStorage.getItem(SESSION_USER_KEY);
        if (!cancelled && stored) {
          try {
            setUser(JSON.parse(stored) as User);
          } catch {
            await studentStorage.removeItem(SESSION_USER_KEY);
          }
        }
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

  const login = useCallback(async (input: StudentLoginInput) => {
    const nextUser = await studentAuthService.login(input);
    await studentStorage.setItem(SESSION_USER_KEY, JSON.stringify(nextUser));
    setUser(nextUser);
    return nextUser;
  }, []);

  const logout = useCallback(async () => {
    await Promise.allSettled([
      studentStorage.removeItem(SESSION_USER_KEY),
      user
        ? studentStorage.removeItem(studentCourseStorageKey(user.id))
        : Promise.resolve(),
    ]);
    queryClient.clear();
    setUser(null);
  }, [queryClient, user]);

  const value = useMemo(
    () => ({ user, ready, login, logout }),
    [login, logout, ready, user],
  );

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
