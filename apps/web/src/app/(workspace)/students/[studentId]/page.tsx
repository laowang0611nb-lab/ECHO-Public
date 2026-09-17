import { StudentDetailPage } from "@/features/students/components/student-detail-page";
import type { StudentDetailTab } from "@/features/students/types";

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeTab(value: string | string[] | undefined): StudentDetailTab {
  const tab = first(value);
  return tab === "mastery" || tab === "behavior" || tab === "conversations" || tab === "assignments" || tab === "ai" || tab === "notes"
    ? tab
    : "overview";
}

export default async function StudentDetailRoute({
  params,
  searchParams,
}: {
  params: Promise<{ studentId: string }>;
  searchParams: Promise<{ from?: string | string[]; courseId?: string | string[]; tab?: string | string[] }>;
}) {
  const { studentId } = await params;
  const query = await searchParams;
  return <StudentDetailPage courseId={first(query.courseId)} from={first(query.from) ?? "students"} initialTab={normalizeTab(query.tab)} studentId={studentId} />;
}
