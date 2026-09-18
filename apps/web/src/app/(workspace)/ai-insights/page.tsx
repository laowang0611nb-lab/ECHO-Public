import { AiInsightsPage } from "@/features/ai-insights/components/ai-insights-page";

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AiInsightsRoute({
  searchParams,
}: {
  searchParams: Promise<{ courseId?: string | string[] }>;
}) {
  const query = await searchParams;
  return <AiInsightsPage initialCourseId={first(query.courseId)} />;
}
