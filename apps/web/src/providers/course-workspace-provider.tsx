"use client";

import type { Course } from "@echo/shared-types";
import { useQuery } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { apiClient } from "@/lib/api";
import { useTeacherSession } from "@/providers/teacher-session-provider";

const COURSE_KEY = "echo.teacher.course-id";

interface CourseWorkspaceContextValue {
  courses: Course[];
  selectedCourseId: string | null;
  selectedCourse: Course | null;
  setSelectedCourseId: (courseId: string) => void;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}

const CourseWorkspaceContext = createContext<CourseWorkspaceContextValue | null>(null);

export function CourseWorkspaceProvider({ children }: { children: ReactNode }) {
  const { user } = useTeacherSession();
  const [requestedCourseId, setRequestedCourseId] = useState<string | null>(null);

  const coursesQuery = useQuery({
    queryKey: ["teacher", "courses", user?.id],
    queryFn: () => apiClient.listCourses(user!.id),
    enabled: Boolean(user),
  });

  const courses = useMemo(() => coursesQuery.data ?? [], [coursesQuery.data]);
  const { isError, isPending, refetch } = coursesQuery;

  const selectedCourseId = useMemo(() => {
    if (!courses.length) {
      return null;
    }
    if (requestedCourseId && courses.some((course) => course.id === requestedCourseId)) {
      return requestedCourseId;
    }

    const stored = typeof window === "undefined" ? null : window.localStorage.getItem(COURSE_KEY);
    if (stored && courses.some((course) => course.id === stored)) {
      return stored;
    }
    return courses[0].id;
  }, [courses, requestedCourseId]);

  const setSelectedCourseId = useCallback((courseId: string) => {
    window.localStorage.setItem(COURSE_KEY, courseId);
    setRequestedCourseId(courseId);
  }, []);

  const selectedCourse = useMemo(
    () => courses.find((course) => course.id === selectedCourseId) ?? null,
    [courses, selectedCourseId],
  );

  const value = useMemo<CourseWorkspaceContextValue>(
    () => ({
      courses,
      selectedCourseId,
      selectedCourse,
      setSelectedCourseId,
      isLoading: isPending,
      isError,
      refetch: () => void refetch(),
    }),
    [courses, isError, isPending, refetch, selectedCourse, selectedCourseId, setSelectedCourseId],
  );

  return (
    <CourseWorkspaceContext.Provider value={value}>{children}</CourseWorkspaceContext.Provider>
  );
}

export function useCourseWorkspace() {
  const context = useContext(CourseWorkspaceContext);
  if (!context) {
    throw new Error("useCourseWorkspace must be used within CourseWorkspaceProvider");
  }
  return context;
}
