import { CourseDetailPage } from "@/features/courses/detail/course-detail-page";
import { normalizeCourseDetailTab } from "@/features/courses/detail/tabs";

export default async function CourseDetailRoute({
  params,
  searchParams,
}: {
  params: Promise<{ courseId: string }>;
  searchParams: Promise<{ tab?: string | string[] }>;
}) {
  const { courseId } = await params;
  const query = await searchParams;

  return (
    <CourseDetailPage
      courseId={courseId}
      initialTab={normalizeCourseDetailTab(query.tab)}
    />
  );
}
