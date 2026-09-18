import { StudentConversationPage } from "@/features/students/components/student-conversation-page";
import type {
  ConversationEvidenceQuery,
  ConversationReasonFilter,
  ConversationSeverityFilter,
  ConversationStatusFilter,
} from "@/features/students/types";

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeStatus(value: string | string[] | undefined): ConversationStatusFilter {
  const status = first(value);
  return status === "open" || status === "confirmed_correct" || status === "marked_incorrect" || status === "dismissed"
    ? status
    : "all";
}

function normalizeReason(value: string | string[] | undefined): ConversationReasonFilter {
  const reason = first(value);
  return reason === "missing_course_basis" || reason === "outside_material_heavy" || reason === "repeated_follow_up" || reason === "student_not_resolved" || reason === "teacher_rule_violation"
    ? reason
    : "all";
}

function normalizeSeverity(value: string | string[] | undefined): ConversationSeverityFilter {
  const severity = first(value);
  return severity === "low" || severity === "medium" || severity === "high" ? severity : "all";
}

export default async function StudentConversationRoute({
  params,
  searchParams,
}: {
  params: Promise<{ studentId: string; conversationId: string }>;
  searchParams: Promise<{
    from?: string | string[];
    messageId?: string | string[];
    knowledgePointId?: string | string[];
    courseId?: string | string[];
    reviewId?: string | string[];
    q?: string | string[];
    status?: string | string[];
    reason?: string | string[];
    severity?: string | string[];
  }>;
}) {
  const { studentId, conversationId } = await params;
  const query = await searchParams;
  const courseId = first(query.courseId);
  const initialQuery: ConversationEvidenceQuery = {
    search: first(query.q)?.trim() ?? "",
    status: normalizeStatus(query.status),
    reason: normalizeReason(query.reason),
    severity: normalizeSeverity(query.severity),
  };
  return (
    <StudentConversationPage
      courseId={courseId}
      initialQuery={initialQuery}
      conversationId={conversationId}
      from={first(query.from) ?? "student"}
      knowledgePointId={first(query.knowledgePointId)}
      messageId={first(query.messageId)}
      reviewId={first(query.reviewId)}
      studentId={studentId}
    />
  );
}
