import { KnowledgeBasePage } from "@/features/knowledge/components/knowledge-base-page";
import type { KnowledgeBaseTab } from "@/features/knowledge/types";

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeTab(value: string | string[] | undefined): KnowledgeBaseTab {
  const tab = first(value);
  return tab === "graph" || tab === "textbooks" || tab === "examples" || tab === "external" || tab === "recycle"
    ? tab
    : "resources";
}

export default async function KnowledgePage({
  searchParams,
}: {
  searchParams: Promise<{ courseId?: string | string[]; tab?: string | string[] }>;
}) {
  const query = await searchParams;
  return <KnowledgeBasePage initialCourseId={first(query.courseId)} initialTab={normalizeTab(query.tab)} />;
}
