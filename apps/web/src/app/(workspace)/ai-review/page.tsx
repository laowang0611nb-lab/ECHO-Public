import { ReviewCockpitPage } from "@/features/ai-review/components/review-cockpit-page";
import { buildReviewFilters, firstQueryValue } from "@/features/ai-review/normalizers";

export default async function AiReviewRoute({
  searchParams,
}: {
  searchParams: Promise<{
    courseId?: string | string[];
    q?: string | string[];
    status?: string | string[];
    reason?: string | string[];
    severity?: string | string[];
    sort?: string | string[];
  }>;
}) {
  const query = await searchParams;
  return <ReviewCockpitPage initialCourseId={firstQueryValue(query.courseId)} initialFilters={buildReviewFilters(query)} />;
}
