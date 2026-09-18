import { ReviewWorkspacePage } from "@/features/ai-review/components/review-workspace-page";
import { buildReviewFilters, firstQueryValue } from "@/features/ai-review/normalizers";

export default async function AiReviewPendingRoute({
  searchParams,
}: {
  searchParams: Promise<{
    courseId?: string | string[];
    reviewId?: string | string[];
    q?: string | string[];
    status?: string | string[];
    reason?: string | string[];
    severity?: string | string[];
    sort?: string | string[];
  }>;
}) {
  const query = await searchParams;
  return (
    <ReviewWorkspacePage
      initialCourseId={firstQueryValue(query.courseId)}
      initialFilters={buildReviewFilters(query)}
      reviewId={firstQueryValue(query.reviewId)}
    />
  );
}
