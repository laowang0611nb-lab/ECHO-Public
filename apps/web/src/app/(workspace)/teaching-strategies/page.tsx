import { TeachingStrategiesPage } from "@/features/teaching-strategies/components/teaching-strategies-page";

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function TeachingStrategiesRoute({
  searchParams,
}: {
  searchParams: Promise<{
    courseId?: string | string[];
    knowledgePointId?: string | string[];
    studentGroup?: string | string[];
    suggestionId?: string | string[];
  }>;
}) {
  const query = await searchParams;

  return (
    <TeachingStrategiesPage
      initialCourseId={first(query.courseId)}
      initialKnowledgePointId={first(query.knowledgePointId)}
      initialStudentGroup={first(query.studentGroup)}
      initialSuggestionId={first(query.suggestionId)}
    />
  );
}
