export const courseDetailTabs = [
  { value: "overview", label: "课程概览" },
  { value: "progress", label: "教学进度" },
  { value: "knowledge", label: "知识点结构" },
  { value: "students", label: "学生管理" },
  { value: "materials", label: "课程资料" },
  { value: "strategy", label: "教学策略" },
  { value: "settings", label: "课程设置" },
] as const;

export type CourseDetailTab = (typeof courseDetailTabs)[number]["value"];

export function normalizeCourseDetailTab(
  value: string | string[] | undefined,
): CourseDetailTab {
  const candidate = Array.isArray(value) ? value[0] : value;
  return courseDetailTabs.some((tab) => tab.value === candidate)
    ? (candidate as CourseDetailTab)
    : "overview";
}
