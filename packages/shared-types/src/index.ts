export type UserRole = "teacher" | "student";

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
