import type {
  Chapter,
  ChapterAnalytics,
  Course,
  CourseMember,
  LearningEvidence,
  MasteryState,
  ReviewFlag,
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
