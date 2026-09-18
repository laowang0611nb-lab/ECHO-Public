import { TeachingStrategyDetailPage } from "@/features/teaching-strategies/components/teaching-strategy-detail-page";

const strategyTabs = ["overview", "goals", "methods", "rules", "ai-rules", "resources", "effect", "history"] as const;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeTab(value: string | string[] | undefined) {
  const tab = first(value);
  return strategyTabs.find((candidate) => candidate === tab) ?? "overview";
}

export default async function TeachingStrategyDetailRoute({
  params,
  searchParams,
}: {
  params: Promise<{ strategyId: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const { strategyId } = await params;
  const query = await searchParams;

  return <TeachingStrategyDetailPage initialTab={normalizeTab(query.tab)} strategyId={strategyId} />;
}
