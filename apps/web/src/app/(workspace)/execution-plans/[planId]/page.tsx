import { ExecutionPlanDetailPage } from "@/features/execution-plans/components/execution-plan-detail-page";
import { normalizeExecutionPlanTab } from "@/features/execution-plans/types";

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ExecutionPlanDetailRoute({
  params,
  searchParams,
}: {
  params: Promise<{ planId: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const { planId } = await params;
  const query = await searchParams;

  return <ExecutionPlanDetailPage initialTab={normalizeExecutionPlanTab(first(query.tab))} planId={planId} />;
}
