import type {
  Chapter,
  ChapterAnalytics,
  Course,
  CourseMember,
  LearningEvidence,
  MasteryState,
  ReviewFlag,
  ReviewReason,
  ReviewSeverity,
  ReviewStatus,
  StudentLearningDetail,
} from "@echo/shared-types";

export type StudentAnalyticsTab =
  | "overview"
  | "students"
  | "behavior"
  | "mastery"
  | "difficulty"
  | "segments";

export type StudentDetailTab =
  | "overview"
  | "mastery"
  | "behavior"
  | "conversations"
  | "assignments"
  | "ai"
  | "notes";

export type StudentLearningStatus = "stable" | "basic" | "attention" | "risk" | "no_data";

export type StudentListStatusFilter = StudentLearningStatus | "all";

export type StudentListActivityFilter = "all" | "recent" | "inactive";

export type StudentListRiskFilter = "all" | "needs_attention" | "high" | "none";

export type StudentListSort = "recent" | "mastery_desc" | "mastery_asc" | "name";

export interface StudentListQuery {
  search: string;
  status: StudentListStatusFilter;
  activity: StudentListActivityFilter;
  risk: StudentListRiskFilter;
  sort: StudentListSort;
}

export interface StudentAnalyticsItem {
  member: CourseMember;
  detail: StudentLearningDetail | null;
  mastery: number | null;
  status: StudentLearningStatus;
  weakKnowledgePoints: Array<{ id: string; name: string; score: number }>;
  latestEvidence: LearningEvidence | null;
  evidenceCount: number;
  activeRecently: boolean;
  riskReason: string | null;
}

export interface StudentAnalyticsSummary {
  studentCount: number;
  averageMastery: number | null;
  activeCount: number;
  attentionCount: number;
  masteryDistribution: Array<{ label: string; value: number; tone: string }>;
}

export interface ChapterMasteryItem {
  chapterId: string;
  title: string;
  orderIndex: number;
  score: number | null;
  pointCount: number;
  classAverage: number | null;
}

export type ConversationStatusFilter = ReviewStatus | "all";

export type ConversationReasonFilter = ReviewReason | "all";

export type ConversationSeverityFilter = ReviewSeverity | "all";

export interface ConversationEvidenceQuery {
  search: string;
  status: ConversationStatusFilter;
  reason: ConversationReasonFilter;
  severity: ConversationSeverityFilter;
}

export interface ConversationEvidenceGroup {
  conversationId: string;
  title: string;
  updatedAt: string;
  flags: ReviewFlag[];
  messageIds: string[];
  status: "reviewed" | "pending" | "rejected";
}

export interface StudentDetailContext {
  course: Course;
  member: CourseMember;
  detail: StudentLearningDetail;
  chapters: Chapter[];
  chapterAnalytics: ChapterAnalytics[];
  masteryStates: MasteryState[];
  reviewFlags: ReviewFlag[];
}

export interface StudentPageParams {
  courseId?: string;
  from?: string;
  conversationId?: string;
  messageId?: string;
  knowledgePointId?: string;
  tab?: string;
}
