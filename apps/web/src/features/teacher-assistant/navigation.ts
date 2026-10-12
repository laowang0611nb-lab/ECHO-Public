import type { TeacherAssistantNavigationTarget } from "@echo/shared-types";

export function teacherAssistantNavigationHref(
  target: TeacherAssistantNavigationTarget,
  currentCourseId: string | null,
) {
  if (!currentCourseId || target.course_id !== currentCourseId) return null;
  const course = encodeURIComponent(currentCourseId);
  const required = (value: string | null | undefined) => value?.trim() || null;

  switch (target.type) {
    case "dashboard":
      return `/dashboard?courseId=${course}`;
    case "ai_insights":
      return `/ai-insights?courseId=${course}`;
    case "students_list":
      return `/students?courseId=${course}`;
    case "student_detail": {
      const studentId = required(target.student_id);
      return studentId ? `/students/${encodeURIComponent(studentId)}?courseId=${course}&from=assistant` : null;
    }
    case "student_conversation": {
      const studentId = required(target.student_id);
      const conversationId = required(target.conversation_id);
      return studentId && conversationId
        ? `/students/${encodeURIComponent(studentId)}/conversations/${encodeURIComponent(conversationId)}?courseId=${course}&from=assistant`
        : null;
    }
    case "knowledge_base":
      return `/knowledge?courseId=${course}&tab=resources`;
    case "knowledge_point_detail": {
      const pointId = required(target.knowledge_point_id);
      return pointId
        ? `/knowledge/points/${encodeURIComponent(pointId)}?courseId=${course}&from=assistant`
        : null;
    }
    case "ai_review":
      return `/ai-review?courseId=${course}`;
    case "ai_review_pending":
      return `/ai-review/pending?courseId=${course}`;
    case "review_flag": {
      const reviewId = required(target.review_flag_id);
      return reviewId
        ? `/ai-review/pending?courseId=${course}&reviewId=${encodeURIComponent(reviewId)}`
        : null;
    }
    case "teaching_strategies":
      return `/teaching-strategies?courseId=${course}`;
    case "teaching_strategy": {
      const strategyId = required(target.strategy_id);
      return strategyId
        ? `/teaching-strategies/${encodeURIComponent(strategyId)}?courseId=${course}`
        : null;
    }
    case "execution_plans":
      return `/teaching-strategies?courseId=${course}#execution-plans`;
    case "execution_plan": {
      const planId = required(target.plan_id);
      return planId
        ? `/execution-plans/${encodeURIComponent(planId)}?courseId=${course}`
        : null;
    }
    case "courses":
      return "/courses";
    case "course_detail":
      return `/courses/${course}`;
    default:
      return null;
  }
}
