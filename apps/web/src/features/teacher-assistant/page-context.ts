"use client";

import type { TeacherAssistantPageContext } from "@echo/shared-types";
import { usePathname, useSearchParams } from "next/navigation";
import { useMemo } from "react";

function pathSegment(pathname: string, index: number) {
  const value = pathname.split("/").filter(Boolean)[index];
  if (!value) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function timeRangeDays(value: string | null) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 7 && parsed <= 180 ? parsed : null;
}

export function useTeacherAssistantPageContext() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return useMemo<TeacherAssistantPageContext>(() => {
    const reviewId = searchParams.get("reviewId");
    const knowledgePointId =
      searchParams.get("knowledgePointId") ?? searchParams.get("pointId");
    const days = timeRangeDays(searchParams.get("days") ?? searchParams.get("timeRangeDays"));
    const queryContext = {
      time_range_days: days,
    };

    if (pathname === "/dashboard") {
      return { page: "dashboard", ...queryContext };
    }
    if (pathname === "/ai-insights") {
      return { page: "ai_insights", ...queryContext };
    }
    if (pathname === "/students") {
      return {
        page: "student_analytics",
        knowledge_point_id: knowledgePointId,
        ...queryContext,
      };
    }

    const studentId = pathSegment(pathname, 1);
    const conversationId = pathSegment(pathname, 3);
    if (pathname.startsWith("/students/") && studentId && conversationId && pathSegment(pathname, 2) === "conversations") {
      return {
        page: "student_conversation",
        student_id: studentId,
        conversation_id: conversationId,
        knowledge_point_id: knowledgePointId,
        review_flag_id: reviewId,
        ...queryContext,
      };
    }
    if (pathname.startsWith("/students/") && studentId) {
      return {
        page: "student_detail",
        student_id: studentId,
        knowledge_point_id: knowledgePointId,
        ...queryContext,
      };
    }

    if (pathname.startsWith("/knowledge/points/")) {
      return {
        page: "knowledge_point_detail",
        knowledge_point_id: pathSegment(pathname, 2) ?? knowledgePointId,
        ...queryContext,
      };
    }
    if (pathname === "/knowledge") {
      return {
        page: "knowledge_base",
        knowledge_point_id: knowledgePointId,
        ...queryContext,
      };
    }

    if (pathname === "/ai-review" || pathname === "/ai-review/pending") {
      return {
        page: "ai_review",
        review_flag_id: reviewId,
        ...queryContext,
      };
    }

    if (pathname.startsWith("/teaching-strategies/")) {
      return {
        page: "teaching_strategy",
        strategy_id: pathSegment(pathname, 1),
        ...queryContext,
      };
    }
    if (pathname === "/teaching-strategies") {
      return {
        page: "teaching_strategy",
        knowledge_point_id: knowledgePointId,
        ...queryContext,
      };
    }

    if (pathname.startsWith("/execution-plans/") && pathname !== "/execution-plans/new") {
      return {
        page: "execution_plan",
        plan_id: pathSegment(pathname, 1),
        ...queryContext,
      };
    }
    if (pathname === "/execution-plans/new") {
      return {
        page: "execution_plan",
        strategy_id: searchParams.get("strategyId"),
        ...queryContext,
      };
    }

    if (pathname === "/courses" || pathname.startsWith("/courses/")) {
      return { page: "courses", ...queryContext };
    }

    return {
      page: "unknown",
      knowledge_point_id: knowledgePointId,
      review_flag_id: reviewId,
      ...queryContext,
    };
  }, [pathname, searchParams]);
}
