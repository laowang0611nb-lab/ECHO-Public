import { CreateExecutionPlanPage } from "@/features/execution-plans/components/create-execution-plan-page";

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeStep(value: string | string[] | undefined) {
  const step = Number(first(value));
  return Number.isInteger(step) && step >= 1 && step <= 5 ? step : undefined;
}

export default async function NewExecutionPlanRoute({
  searchParams,
}: {
  searchParams: Promise<{
    courseId?: string | string[];
    strategyId?: string | string[];
    step?: string | string[];
  }>;
}) {
  const query = await searchParams;

  return (
    <CreateExecutionPlanPage
      initialCourseId={first(query.courseId)}
      initialStep={normalizeStep(query.step)}
      initialStrategyId={first(query.strategyId)}
    />
  );
}
