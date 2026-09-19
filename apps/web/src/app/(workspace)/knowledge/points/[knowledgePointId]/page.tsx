import { KnowledgePointDetailPage } from "@/features/knowledge/components/knowledge-point-detail-page";
import type { KnowledgePointTab } from "@/features/knowledge/types";

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeTab(value: string | string[] | undefined): KnowledgePointTab {
  const tab = first(value);
  return tab === "related" || tab === "students" || tab === "exercises" || tab === "suggestions" || tab === "analysis"
    ? tab
    : "overview";
}

export default async function KnowledgePointPage({
  params,
  searchParams,
}: {
  params: Promise<{ knowledgePointId: string }>;
  searchParams: Promise<{
    from?: string | string[];
    courseId?: string | string[];
    resourceId?: string | string[];
    tab?: string | string[];
    reviewId?: string | string[];
    conversationId?: string | string[];
    messageId?: string | string[];
    studentId?: string | string[];
  }>;
}) {
  const { knowledgePointId } = await params;
  const query = await searchParams;
  return (
    <KnowledgePointDetailPage
      courseId={first(query.courseId)}
      conversationId={first(query.conversationId)}
      messageId={first(query.messageId)}
      reviewId={first(query.reviewId)}
      studentId={first(query.studentId)}
      from={first(query.from) ?? "knowledge"}
      initialTab={normalizeTab(query.tab)}
      pointId={knowledgePointId}
      resourceId={first(query.resourceId)}
    />
  );
}
