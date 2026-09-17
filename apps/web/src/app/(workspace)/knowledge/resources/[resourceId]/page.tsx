import { KnowledgeResourceDetailPage } from "@/features/knowledge/components/resource-detail-page";
import type { ResourceDetailTab } from "@/features/knowledge/types";

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeTab(value: string | string[] | undefined): ResourceDetailTab {
  const tab = first(value);
  return tab === "overview" || tab === "chapters" || tab === "points" || tab === "index" || tab === "citations" || tab === "related"
    ? tab
    : "parse";
}

export default async function KnowledgeResourcePage({
  params,
  searchParams,
}: {
  params: Promise<{ resourceId: string }>;
  searchParams: Promise<{ from?: string | string[]; courseId?: string | string[]; tab?: string | string[] }>;
}) {
  const { resourceId } = await params;
  const query = await searchParams;
  return (
    <KnowledgeResourceDetailPage
      courseId={first(query.courseId)}
      from={first(query.from) ?? "knowledge"}
      initialTab={normalizeTab(query.tab)}
      resourceId={resourceId}
    />
  );
}
