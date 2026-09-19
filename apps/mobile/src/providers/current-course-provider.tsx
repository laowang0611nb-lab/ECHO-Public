import type { Course } from "@echo/shared-types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  studentCourseStorageKey,
  studentStorage,
} from "@/services/student-storage";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { apiClient } from "@/lib/api-client";
import { useStudentSession } from "@/providers/student-session-provider";

interface CurrentCourseValue {
  courses: Course[];
  selectedCourseId: string | null;
  selectedCourse: Course | null;
  loading: boolean;
  error: Error | null;
  selectCourse: (courseId: string) => void;
  refreshCourses: () => Promise<void>;
  joinCourse: (code: string) => Promise<Course>;
}

const CurrentCourseContext = createContext<CurrentCourseValue | null>(null);


export function CurrentCourseProvider({ children }: { children: ReactNode }) {
  const { user } = useStudentSession();
  const queryClient = useQueryClient();
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);

  const coursesQuery = useQuery({
    queryKey: ["student-courses", user?.id],
    queryFn: () => apiClient.listCourses(user?.id ?? ""),
    enabled: Boolean(user),
  });

  useEffect(() => {
    if (!user) {
      return;
    }
    let cancelled = false;
    void (async () => {
      const stored = await studentStorage.getItem(studentCourseStorageKey(user.id));
      if (!cancelled && stored) {
        setSelectedCourseId(stored);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const courses = useMemo(() => coursesQuery.data ?? [], [coursesQuery.data]);
  const fallbackCourseId =
    courses.find((course) => course.status !== "archived")?.id ??
    courses[0]?.id ??
    null;
  const effectiveSelectedCourseId = courses.some((course) => course.id === selectedCourseId)
    ? selectedCourseId
    : fallbackCourseId;
  const selectedCourse =
    courses.find((course) => course.id === effectiveSelectedCourseId) ?? null;

  const selectCourse = useCallback(
    (courseId: string) => {
      setSelectedCourseId(courseId);
      if (user) {
        void studentStorage.setItem(studentCourseStorageKey(user.id), courseId);
      }
    },
    [user],
  );

  const refreshCourses = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ["student-courses", user?.id] });
  }, [queryClient, user?.id]);

  const joinCourse = useCallback(
    async (code: string) => {
      if (!user) {
        throw new Error("登录后才能加入课程");
      }
      const joined = await apiClient.joinCourse(user.id, code);
      await queryClient.invalidateQueries({ queryKey: ["student-courses", user.id] });
      selectCourse(joined.id);
      return joined;
    },
    [queryClient, selectCourse, user],
  );

  const value = useMemo(
    () => ({
      courses,
      selectedCourseId: effectiveSelectedCourseId,
      selectedCourse,
      loading: coursesQuery.isLoading,
      error: coursesQuery.error instanceof Error ? coursesQuery.error : null,
      selectCourse,
      refreshCourses,
      joinCourse,
    }),
    [
      courses,
      coursesQuery.error,
      coursesQuery.isLoading,
      effectiveSelectedCourseId,
      joinCourse,
      refreshCourses,
      selectCourse,
      selectedCourse,
    ],
  );

  return (
    <CurrentCourseContext.Provider value={value}>
      {children}
    </CurrentCourseContext.Provider>
  );
}

export function useCurrentCourse(): CurrentCourseValue {
  const context = useContext(CurrentCourseContext);
  if (!context) {
    throw new Error("useCurrentCourse must be used inside CurrentCourseProvider");
  }
  return context;
}
