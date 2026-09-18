export type UserRole = "teacher" | "student";

export type MessageRole = "user" | "assistant" | "system";

export type CourseStatus = "draft" | "published";

export type ChatStreamEventName =
  | "text_delta"
  | "component"
  | "citation"
  | "learning_event"
  | "error"
  | "done";

export type LearningEventType =
  | "question_asked"
  | "hint_requested"
  | "quiz_correct"
  | "quiz_wrong"
  | "concept_confusion"
  | "repeated_error"
  | "resolved"
  | "teacher_adjustment";

export interface HealthResponse {
  status: "ok";
  service: string;
  version: string;
  environment: string;
}

export interface User {
  id: string;
  email: string;
  display_name: string;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

export interface DevelopmentLoginRequest {
  email: string;
  display_name: string;
  role: UserRole;
}

export interface Course {
  id: string;
  name: string;
  description: string | null;
  term: string | null;
  status: CourseStatus;
  code: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface CourseCreateRequest {
  name: string;
  description?: string;
  term?: string;
}

export interface CourseMember {
  id: string;
  course_id: string;
  user_id: string;
  email: string;
  display_name: string;
  role: UserRole;
  joined_at: string;
}

export type DocumentStatus = "uploaded" | "parsing" | "ready" | "failed";

export interface CourseDocument {
  id: string;
  course_id: string;
  uploaded_by: string;
  original_name: string;
  content_type: string;
  size_bytes: number;
  status: DocumentStatus;
  page_count: number | null;
  created_at: string;
  updated_at: string;
}

export interface NativeFileUpload {
  uri: string;
  name: string;
  type?: string;
}

export type DocumentUploadSource = Blob | NativeFileUpload;

export interface TeachingPolicy {
  id: string;
  course_id: string;
  content: string;
  updated_by: string;
  updated_at: string;
}

export interface TeachingPolicyUpdateRequest {
  content: string;
}

export interface KnowledgePoint {
  id: string;
  course_id: string;
  chapter_id: string;
  name: string;
  description: string | null;
  order_index: number;
}

export interface Chapter {
  id: string;
  course_id: string;
  document_id: string;
  title: string;
  summary: string | null;
  order_index: number;
  knowledge_points: KnowledgePoint[];
}

export interface ChapterCreateRequest {
  title: string;
  summary?: string;
  order_index?: number;
}

export interface ChapterUpdateRequest {
  title?: string;
  summary?: string | null;
  order_index?: number;
}

export interface KnowledgePointCreateRequest {
  name: string;
  description?: string;
  order_index?: number;
}

export interface KnowledgePointUpdateRequest {
  chapter_id?: string;
  name?: string;
  description?: string | null;
  order_index?: number;
}

export interface KnowledgePointMergeRequest {
  target_knowledge_point_id: string;
  source_knowledge_point_ids: string[];
  name?: string;
  description?: string;
}

export interface HighRiskKnowledgePoint {
  knowledge_point_id: string;
  name: string;
  average_score: number;
  affected_students: number;
}

export interface CourseDashboard {
  course_id: string;
  student_count: number;
  active_student_count: number;
  question_count_7d: number;
  total_learning_events: number;
  pending_review_count: number;
  average_mastery: number | null;
  high_risk_knowledge_points: HighRiskKnowledgePoint[];
}

export interface ChapterAnalytics {
  chapter_id: string;
  title: string;
  order_index: number;
  knowledge_point_count: number;
  active_learner_count: number;
  average_mastery: number | null;
}


export interface DashboardOverviewStats {
  student_count: number;
  active_student_count: number;
  weekly_interaction_count: number;
  average_mastery: number | null;
  attention_knowledge_point_count: number;
  pending_review_count: number;
}


export interface DashboardTrendPoint {
  date: string;
  interaction_count: number;
  active_student_count: number;
}


export interface DashboardInsight {
  risk_level: "low" | "medium" | "high";
  summary: string;
  generated_at: string;
}


export interface DashboardLearningDifficulty {
  knowledge_point_id: string;
  name: string;
  average_score: number;
  affected_students: number;
}


export interface DashboardTeacherAction {
  action_type:
    | "review_flags"
    | "support_knowledge_point"
    | "encourage_inactive_students";
  priority: "low" | "medium" | "high";
  target_id: string | null;
}


export interface TeacherDashboardOverview {
  course_id: string;
  stats: DashboardOverviewStats;
  trend: DashboardTrendPoint[];
  insight: DashboardInsight;
  chapter_mastery: ChapterAnalytics[];
  learning_difficulties: DashboardLearningDifficulty[];
  teacher_actions: DashboardTeacherAction[];
}

export interface StudentMasteryBrief {
  student_id: string;
  display_name: string;
  score: number;
}

export interface KnowledgePointAnalytics {
  knowledge_point_id: string;
  name: string;
  chapter_id: string;
  chapter_title: string;
  average_mastery: number | null;
  affected_students: number;
  students: StudentMasteryBrief[];
}

export type ReviewReason =
  | "missing_course_basis"
  | "outside_material_heavy"
  | "repeated_follow_up"
  | "student_not_resolved"
  | "teacher_rule_violation";

export type ReviewSeverity = "low" | "medium" | "high";

export type ReviewStatus =
  | "open"
  | "confirmed_correct"
  | "marked_incorrect"
  | "dismissed"
  | "generating"
  | "pending_rereview"
  | "regeneration_failed";

export type ReviewGenerationStatus = "idle" | "generating" | "completed" | "failed";

export type ReviewVersionSource = "original" | "regenerated" | "teacher";

export type ReviewHistoryAction =
  | "confirm_correct"
  | "mark_incorrect"
  | "dismiss"
  | "regenerate";

export interface ReviewCitation {
  document_id: string | null;
  chunk_id: string | null;
  page_start: number;
  page_end: number;
  quote: string;
}

export interface ReviewVersion {
  version: number;
  answer: string;
  knowledgePointIds: string[];
  citations: ReviewCitation[];
  source: ReviewVersionSource;
  instruction: string | null;
  created_at: string;
}

export interface ReviewHistoryEntry {
  id: string;
  review_flag_id: string;
  version: number;
  action: ReviewHistoryAction;
  from_status: ReviewStatus;
  to_status: ReviewStatus;
  teacher_id: string | null;
  teacher_display_name: string | null;
  note: string | null;
  answer_snapshot: string | null;
  corrected_answer_snapshot: string | null;
  created_at: string;
}

export interface ReviewRegenerationRequest {
  instruction: string;
  base_version?: number;
}

export interface ReviewRegeneration {
  review_id: string;
  status: ReviewGenerationStatus;
  version: number;
  answer: string;
  knowledgePointIds: string[];
  citations: ReviewCitation[];
  error: string | null;
}

export interface ReviewRegenerationStatus {
  status: ReviewGenerationStatus;
  progress: number;
  version: number;
  answer: string | null;
  error: string | null;
  knowledgePointIds: string[];
  citations: ReviewCitation[];
}

export interface ReviewFlagSummary {
  pending: number;
  high_risk: number;
  reasons: Record<ReviewReason, number>;
  generating: number;
  pending_rereview: number;
  regeneration_failed: number;
}

export interface ReviewFlagQuery {
  items: ReviewFlag[];
  total: number;
  nextCursor: string | null;
  summary: ReviewFlagSummary;
}

export interface ReviewContext {
  review_id: string;
  question: string | null;
  current_version: ReviewVersion;
  citations: ReviewCitation[];
  knowledgePointIds: string[];
  messageId: string;
  conversationId: string;
  studentId: string;
  recent_learning_events: LearningEventRecord[];
  teaching_policy: string | null;
  teaching_policy_conflicts: Array<{ code: string; detail: string }>;
  review_history: ReviewHistoryEntry[];
}

export type ReviewDecision = "confirm_correct" | "mark_incorrect" | "dismiss";

export interface ReviewFlag {
  id: string;
  course_id: string;
  conversation_id: string;
  message_id: string;
  student_id: string;
  student_display_name: string;
  reason: ReviewReason;
  severity: ReviewSeverity;
  status: ReviewStatus;
  details: Record<string, unknown>;
  question: string | null;
  answer: string;
  teacher_note: string | null;
  corrected_answer: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  knowledgePointIds: string[];
  citations: ReviewCitation[];
  current_version: number;
  generation_status: ReviewGenerationStatus;
  versions: ReviewVersion[];
  review_history: ReviewHistoryEntry[];
}

export interface ReviewDecisionRequest {
  decision: ReviewDecision;
  note?: string;
  corrected_answer?: string;
}

export interface NotResolvedRequest {
  note?: string;
}

export interface Conversation {
  id: string;
  course_id: string;
  user_id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

export interface MessageCitation {
  citation_index: number;
  chunk_id: string | null;
  document_id: string | null;
  page_start: number;
  page_end: number;
  quote: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: MessageRole;
  content: string;
  created_at: string;
  citations: MessageCitation[];
}


export interface TeacherMessage extends Message {
  knowledgePointIds: string[];
  reviewStatus: ReviewStatus | null;
}

export interface ChatStreamRequest {
  content: string;
  retrieval_limit?: number;
}

export interface KnowledgeChunk {
  id: string;
  course_id: string;
  document_id: string;
  chapter_id: string | null;
  chunk_index: number;
  page_start: number;
  page_end: number;
  content: string;
  char_count: number;
}

export interface EmbeddingResult {
  document_id: string;
  embedded_chunks: number;
}

export interface ChunkSearchRequest {
  query: string;
  limit?: number;
}

export interface ChunkSearchResult {
  chunk_id: string;
  document_id: string;
  page_start: number;
  page_end: number;
  content: string;
  distance: number;
}

export interface LearningEventCreateRequest {
  student_id: string;
  knowledge_point_id?: string | null;
  conversation_id?: string | null;
  message_id?: string | null;
  event_type: LearningEventType;
  weight?: number;
  evidence?: string | null;
  metadata_json?: Record<string, unknown>;
}

export interface LearningEventRecord {
  id: string;
  course_id: string;
  user_id: string;
  knowledge_point_id: string | null;
  event_type: LearningEventType;
  weight: number;
  evidence: string | null;
  created_at: string;
}

export interface MasteryState {
  id: string;
  course_id: string;
  user_id: string;
  knowledge_point_id: string;
  score: number;
  updated_at: string;
}

export interface LearningEvidence {
  event_id: string;
  knowledge_point_id: string | null;
  knowledge_point_name: string | null;
  event_type: string;
  evidence: string | null;
  created_at: string;
}

export interface StudentLearningDetail {
  student_id: string;
  display_name: string;
  average_mastery: number | null;
  mastery_states: MasteryState[];
  recent_evidence: LearningEvidence[];
}

export type ChatStreamEvent =
  | { event: "text_delta"; data: { delta: string } }
  | {
      event: "citation";
      data: {
        index: number;
        chunk_id: string | null;
        document_id: string | null;
        page_start: number;
        page_end: number;
      };
    }
  | { event: "error"; data: { detail: string } }
  | {
      event: "done";
      data: { conversation_id: string; message_id: string };
    }
  | { event: "component" | "learning_event"; data: Record<string, unknown> };
