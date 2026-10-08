import { StudentLearningPage } from "@/features/students/components/student-learning-page";
import type {
  StudentAnalyticsTab,
  StudentListActivityFilter,
  StudentListQuery,
  StudentListRiskFilter,
  StudentListSort,
  StudentListStatusFilter,
} from "@/features/students/types";

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeTab(value: string | string[] | undefined): StudentAnalyticsTab {
  const tab = first(value);
  return tab === "students" || tab === "behavior" || tab === "mastery" || tab === "difficulty" || tab === "segments"
    ? tab
    : "overview";
}

function normalizeStatus(value: string | string[] | undefined): StudentListStatusFilter {
  const status = first(value);
  return status === "stable" || status === "basic" || status === "attention" || status === "risk" || status === "no_data"
    ? status
    : "all";
}

function normalizeActivity(value: string | string[] | undefined): StudentListActivityFilter {
  const activity = first(value);
  return activity === "recent" || activity === "inactive" ? activity : "all";
}

function normalizeRisk(value: string | string[] | undefined): StudentListRiskFilter {
  const risk = first(value);
  return risk === "needs_attention" || risk === "high" || risk === "none" ? risk : "all";
}

function normalizeSort(value: string | string[] | undefined): StudentListSort {
  const sort = first(value);
  return sort === "mastery_desc" || sort === "mastery_asc" || sort === "name" ? sort : "recent";
}

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<{
    courseId?: string | string[];
    tab?: string | string[];
    q?: string | string[];
    status?: string | string[];
    activity?: string | string[];
    risk?: string | string[];
    sort?: string | string[];
    knowledgePointId?: string | string[];
  }>;
}) {
  const query = await searchParams;
  const initialListQuery: StudentListQuery = {
    search: first(query.q)?.trim() ?? "",
    status: normalizeStatus(query.status),
    activity: normalizeActivity(query.activity),
    risk: normalizeRisk(query.risk),
    sort: normalizeSort(query.sort),
    knowledgePointId: first(query.knowledgePointId),
  };
  return (
    <StudentLearningPage
      initialCourseId={first(query.courseId)}
      initialKnowledgePointId={first(query.knowledgePointId)}
      initialListQuery={initialListQuery}
      initialTab={normalizeTab(query.tab)}
    />
  );
}
