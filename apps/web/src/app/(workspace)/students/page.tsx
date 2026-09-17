import { StudentLearningPage } from "@/features/students/components/student-learning-page";
import type { StudentAnalyticsTab } from "@/features/students/types";

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeTab(value: string | string[] | undefined): StudentAnalyticsTab {
  const tab = first(value);
  return tab === "students" || tab === "behavior" || tab === "mastery" || tab === "difficulty" || tab === "segments"
    ? tab
    : "overview";
}

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ courseId?: string | string[]; tab?: string | string[] }>;
}) {
  const query = await searchParams;
  return <StudentLearningPage initialCourseId={first(query.courseId)} initialTab={normalizeTab(query.tab)} />;
}
