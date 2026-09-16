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
  | "dismissed";

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

export interface ChatStreamRequest {
  content: string;
  retrieval_limit?: number;
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
