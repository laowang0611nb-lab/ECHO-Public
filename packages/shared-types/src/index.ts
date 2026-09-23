export type UserRole = "teacher" | "student";

export type MessageRole = "user" | "assistant" | "system";

export type CourseStatus = "draft" | "published" | "archived";

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

export type ServiceState = "healthy" | "warning" | "offline" | "unconfigured";

export interface SystemDatabaseStatus {
  status: ServiceState;
  dialect: string;
  current_label: string;
  target_architecture: string;
  latency_ms: number;
  message: string;
}

export interface SystemVectorStatus {
  status: ServiceState;
  available: boolean;
  engine: string;
  message: string;
}

export interface SystemAIProviderStatus {
  status: ServiceState;
  configured: boolean;
  chat_configured: boolean;
  embedding_configured: boolean;
  model: string;
  chat_model: string;
  embedding_model: string;
  message: string;
}

export interface SystemStorageStatus {
  status: ServiceState;
  mode: string;
  path_label: string;
  writable: boolean;
  message: string;
}

export interface SystemLanStatus {
  api_base_url: string;
  api_port: number;
  candidate_lan_ips: string[];
  student_api_base_url: string | null;
  message: string;
}

export interface SystemStatusResponse {
  status: ServiceState;
  service: string;
  version: string;
  environment: string;
  database: SystemDatabaseStatus;
  vector: SystemVectorStatus;
  ai_provider: SystemAIProviderStatus;
  storage: SystemStorageStatus;
  lan: SystemLanStatus;
  checked_at: string;
}

export interface DemoDatasetStatus {
  available: boolean;
  seeded: boolean;
  isolated: boolean;
  namespace: string;
  dataset_tag: string;
  course_id: string | null;
  course_name: string | null;
  course_code: string | null;
  student_count: number;
  knowledge_point_count: number;
  learning_event_count: number;
  review_count: number;
  strategy_count: number;
  plan_count: number;
  strategy_id: string | null;
  student_id: string | null;
  plan_id: string | null;
  plan_task_id: string | null;
  review_id: string | null;
  message_id: string | null;
  conversation_id: string | null;
  knowledge_point_id: string | null;
  resource_id: string | null;
  checked_at: string;
}

export interface User {
  id: string;
  phone: string | null;
  email: string;
  display_name: string;
  role: UserRole;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface TeacherProfile {
  id: string;
  phone: string | null;
  email: string;
  display_name: string;
  role: "teacher";
  school_name: string | null;
  avatar_url: string | null;
  department: string | null;
  employee_no: string | null;
  title: string | null;
  teaching_fields: string[];
  created_at: string;
  updated_at: string;
}

export interface TeacherProfileUpdateRequest {
  display_name?: string;
  school_name?: string | null;
  department?: string | null;
  employee_no?: string | null;
  teacher_no?: string | null;
  title?: string | null;
  teaching_fields?: string[] | null;
}

export interface PasswordChangeRequest {
  current_password: string;
  new_password: string;
}

export type SmsErrorCode =
  | "SMS_TOO_FREQUENT"
  | "SMS_CODE_INVALID_OR_EXPIRED"
  | "SMS_PROVIDER_NOT_CONFIGURED"
  | "SMS_AUTH_FAILED"
  | "SMS_BILLING_UNAVAILABLE"
  | "SMS_SEND_FAILED"
  | "SMS_TIMEOUT"
  | "SMS_SERVICE_UNAVAILABLE";

export type PhoneVerificationPurpose = "register" | "password_reset" | "login";

export interface SmsSendRequest {
  phone: string;
}

export interface SmsSendResponse {
  success: true;
  message: string;
  cooldown_seconds: number;
}

export interface SmsVerifyRequest {
  purpose: PhoneVerificationPurpose;
  phone: string;
  code: string;
}

export interface SmsVerifyResponse {
  success: true;
  verified: true;
  purpose: PhoneVerificationPurpose;
  verification_token: string;
  expires_in_seconds: number;
}

export interface SmsErrorDetail {
  code: SmsErrorCode | string;
  message: string;
}

export interface SmsRegistrationRequest {
  phone: string;
  verification_token: string;
  display_name: string;
  password: string;
  email?: string | null;
  role?: UserRole;
  device_name?: string | null;
}

export interface SmsLoginRequest {
  phone: string;
  verification_token: string;
  device_name?: string | null;
}

export interface PasswordLoginRequest {
  email?: string;
  phone?: string;
  password: string;
  device_name?: string | null;
}

export interface PasswordResetRequest {
  phone: string;
  verification_token: string;
  new_password: string;
}

export interface AuthSessionResponse {
  user: User;
  session_id: string;
  access_token: string;
  refresh_token: string;
  token_type: "bearer";
  expires_in_seconds: number;
  refresh_expires_at: string;
}

export interface SessionRefreshRequest {
  refresh_token: string;
}

export interface SessionLogoutRequest {
  refresh_token: string;
}

export interface PasswordResetResponse {
  success: true;
  message: string;
  changed_at: string;
  sessions_revoked: number;
}

export interface AuthErrorResponse {
  detail: {
    code: string;
    message: string;
  };
}

export interface PasswordChangeResponse {
  changed_at: string;
  sessions_revoked: number;
}

export interface AvatarUploadResponse {
  avatar_url: string;
}

export type NotificationType =
  | "ai_high_risk"
  | "student_abnormal"
  | "course_member_change"
  | "system_status";

export type NotificationSeverity = "info" | "warning" | "critical";

export interface Notification {
  id: string;
  type: NotificationType;
  severity: NotificationSeverity;
  title: string;
  body: string;
  action_url: string | null;
  payload_json: Record<string, unknown>;
  course_id: string | null;
  actor_id: string | null;
  read_at: string | null;
  created_at: string;
}

export interface NotificationPage {
  items: Notification[];
  total: number;
  nextCursor: string | null;
  unreadCount: number;
}

export interface NotificationUnreadCount {
  unreadCount: number;
}

export interface NotificationMarkAllReadResponse {
  updated: number;
  unreadCount: number;
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
  semester: string | null;
  course_type: string | null;
  target_audience: string | null;
  expected_student_count: number | null;
  status: CourseStatus;
  code: string;
  created_by: string;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CourseCreateRequest {
  name: string;
  description?: string;
  term?: string;
  semester?: string;
  course_type?: string;
  target_audience?: string;
  expected_student_count?: number;
}

export interface CourseUpdateRequest {
  name?: string;
  description?: string | null;
  term?: string | null;
  semester?: string | null;
  course_type?: string | null;
  target_audience?: string | null;
  expected_student_count?: number | null;
}
export interface CourseMember {
  id: string;
  course_id: string;
  user_id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  role: UserRole;
  joined_at: string;
}

export type DocumentStatus = "uploaded" | "parsing" | "ready" | "failed";

export type ResourceType =
  | "textbook"
  | "outline"
  | "question_bank"
  | "code_example"
  | "lab"
  | "external_link";

export interface CourseDocument {
  id: string;
  course_id: string;
  uploaded_by: string;
  original_name: string;
  display_name: string | null;
  summary: string | null;
  keywords: string[];
  author: string | null;
  publisher: string | null;
  copyright: string | null;
  content_type: string;
  size_bytes: number;
  status: DocumentStatus;
  resource_type: ResourceType;
  page_count: number | null;
  trashed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DocumentMetadataUpdateRequest {
  display_name?: string | null;
  title?: string | null;
  summary?: string | null;
  keywords?: string[] | null;
  author?: string | null;
  publisher?: string | null;
  copyright?: string | null;
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
  document_name?: string | null;
  chapter_title?: string | null;
  page_start: number;
  page_end: number;
  quote: string;
}

export type MessageStatus =
  | "sending"
  | "sent"
  | "streaming"
  | "complete"
  | "interrupted"
  | "failed";

export interface TextBlock {
  type: "text";
  text: string;
}

export interface MarkdownBlock {
  type: "markdown";
  markdown: string;
}

export interface HintBlock {
  type: "hint";
  level: number;
  title: string | null;
  content: string;
  can_request_more: boolean;
}

export interface QuickCheckOption {
  id: string;
  label: string;
}

export type QuickCheckStatus =
  | "unanswered"
  | "selected"
  | "submitting"
  | "locked"
  | "correct"
  | "wrong";

export interface QuickCheckBlock {
  type: "quick_check";
  question_id: string;
  title: string | null;
  prompt: string;
  options: QuickCheckOption[];
  status: QuickCheckStatus;
  selected_option_id: string | null;
  attempts_remaining: number | null;
  correct: boolean | null;
  explanation: string | null;
  hint: string | null;
}

export interface CitationBlock {
  type: "citation";
  citations: MessageCitation[];
}

export interface MasteryUpdateBlock {
  type: "mastery_update";
  knowledge_point_id: string;
  knowledge_point_name: string | null;
  before: number | null;
  after: number;
  reason: string;
  evidence_id: string | null;
}

export interface WarningBlock {
  type: "warning";
  message: string;
}

export type AIMessageBlock =
  | TextBlock
  | MarkdownBlock
  | HintBlock
  | QuickCheckBlock
  | CitationBlock
  | MasteryUpdateBlock
  | WarningBlock;

export type ChatAttachmentKind = "image" | "audio" | "video";

export interface ChatAttachment {
  id: string;
  kind: ChatAttachmentKind;
  mime_type: string;
  file_name: string | null;
  size_bytes: number | null;
  width: number | null;
  height: number | null;
  duration_seconds: number | null;
  transcript: string | null;
  url: string | null;
}

export interface ChatAttachmentUploadResponse {
  attachment: ChatAttachment;
  expires_at: string | null;
}

export interface ChatModalitiesResponse {
  input_modalities: ("text" | ChatAttachmentKind)[];
  output_modalities: "text"[];
  attachments_enabled: boolean;
  message: string | null;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: MessageRole;
  content: string;
  created_at: string;
  citations: MessageCitation[];
  client_request_id?: string | null;
  status?: MessageStatus;
  blocks?: AIMessageBlock[];
  attachments?: ChatAttachment[];
}


export interface TeacherMessage extends Message {
  knowledgePointIds: string[];
  reviewStatus: ReviewStatus | null;
}

export interface ChatStreamRequest {
  content: string;
  client_request_id: string;
  knowledge_point_id?: string | null;
  retrieval_limit?: number;
  attachments?: ChatAttachment[];
}

export interface ChatContinueRequest {
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
  plan_id?: string | null;
  task_id?: string | null;
  week_number?: number | null;
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
  plan_id: string | null;
  task_id: string | null;
  week_number: number | null;
  event_type: LearningEventType;
  weight: number;
  evidence: string | null;
  result: PlanLearningEventResult;
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


export interface MasteryTrendPoint {
  date: string;
  average_mastery: number | null;
  affected_students: number;
  evidence_count: number;
  snapshot_ids: string[];
  event_ids: string[];
}

export interface MasteryTrendRange {
  start_date: string;
  end_date: string;
  days: number;
}

export interface MasteryTrend {
  knowledge_point_id: string | null;
  student_id: string | null;
  range: MasteryTrendRange;
  points: MasteryTrendPoint[];
}

export type ErrorPatternTrend = "up" | "stable" | "down" | "unknown";

export interface ErrorPattern {
  code: string;
  label: string;
  description: string;
  occurrence_count: number;
  affected_students: number;
  trend: ErrorPatternTrend;
  sample_evidence_ids: string[];
}

export interface ErrorPatternReport {
  knowledge_point_id: string | null;
  student_id: string | null;
  window_days: number;
  patterns: ErrorPattern[];
}

export type QuestionType =
  | "single_choice"
  | "multiple_choice"
  | "true_false"
  | "short_answer"
  | "coding"
  | "experiment";

export type QuestionDifficulty = "easy" | "medium" | "hard";

export interface QuestionItem {
  id: string;
  course_id: string;
  knowledge_point_ids: string[];
  type: QuestionType;
  difficulty: QuestionDifficulty;
  title: string;
  content: string;
  answer: string | null;
  explanation: string | null;
  source_document_id: string | null;
  source_page: number | null;
  metadata_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface QuestionItemCreateRequest {
  knowledge_point_ids?: string[];
  type: QuestionType;
  difficulty?: QuestionDifficulty;
  title: string;
  content: string;
  answer?: string | null;
  explanation?: string | null;
  source_document_id?: string | null;
  source_page?: number | null;
  metadata_json?: Record<string, unknown>;
}

export type QuestionItemUpdateRequest = Partial<QuestionItemCreateRequest>;

export interface QuestionItemPage {
  items: QuestionItem[];
  total: number;
  next_cursor: string | null;
}

export type ExternalResourceStatus = "unchecked" | "valid" | "invalid" | "unknown";

export interface ExternalResource {
  id: string;
  course_id: string;
  title: string;
  url: string;
  provider: string | null;
  description: string | null;
  knowledge_point_ids: string[];
  check_status: ExternalResourceStatus;
  last_verified_at: string | null;
  metadata_json: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ExternalResourceCreateRequest {
  title: string;
  url: string;
  provider?: string | null;
  description?: string | null;
  knowledge_point_ids?: string[];
  metadata_json?: Record<string, unknown>;
}

export type ExternalResourceUpdateRequest = Partial<ExternalResourceCreateRequest> & {
  check_status?: ExternalResourceStatus;
};

export interface ExternalResourcePage {
  items: ExternalResource[];
  total: number;
  next_cursor: string | null;
}

export type ResourceItemType =
  | "document"
  | "chapter"
  | "knowledge_point"
  | "question_item"
  | "external_resource";

export interface ResourceListItem {
  id: string;
  course_id: string;
  item_type: ResourceItemType;
  title: string;
  resource_type: ResourceType | "chapter" | "knowledge_point" | null;
  trashed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ResourceListPage {
  items: ResourceListItem[];
  total: number;
  next_cursor: string | null;
}

export interface PermanentDeleteResult {
  id: string;
  item_type: ResourceItemType;
  affected_reference_count: number;
  deleted: boolean;
}

export interface KnowledgeGraphNode {
  id: string;
  type: "course" | "chapter" | "knowledge_point" | "resource";
  label: string;
  parent_id: string | null;
  metadata: Record<string, unknown>;
}

export interface KnowledgeGraphEdge {
  id: string;
  source: string;
  target: string;
  type: "contains" | "prerequisite" | "related" | "assessed_by" | "sourced_from";
  weight: number;
  evidence_count: number;
}

export interface KnowledgeGraph {
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
}

export interface DocumentIndexStatus {
  document_id: string;
  status: string;
  pages_total: number;
  pages_parsed: number;
  chunks_total: number;
  chunks_embedded: number;
  last_indexed_at: string | null;
  error: string | null;
}

export interface DocumentCitationItem {
  id: string;
  message_id: string;
  conversation_id: string;
  student_id: string;
  citation_index: number;
  document_id: string | null;
  chunk_id: string | null;
  page_start: number;
  page_end: number;
  quote: string;
  created_at: string;
}

export interface DocumentCitationPage {
  items: DocumentCitationItem[];
  total: number;
  next_cursor: string | null;
}

export interface DocumentPageBlock {
  chunk_id: string;
  text: string;
  bbox: number[] | null;
}

export interface DocumentPageEvidence {
  page_number: number;
  width: number | null;
  height: number | null;
  text: string;
  blocks: DocumentPageBlock[];
}
export type TeachingStrategyType =
  | "content_adjustment"
  | "teaching_method"
  | "differentiated_instruction"
  | "assignment_design"
  | "classroom_interaction";

export type TeachingStrategyPriority = "high" | "medium" | "low";

export type TeachingStrategyStatus =
  | "suggested"
  | "accepted"
  | "planned"
  | "active"
  | "paused"
  | "completed"
  | "dismissed";

export type TeachingStrategySource = "ai_generated" | "teacher_created";

export type TeachingStrategyHistoryAction =
  | "generated"
  | "created"
  | "updated"
  | "accept"
  | "dismiss"
  | "activate"
  | "pause"
  | "resume"
  | "complete"
  | "plan_created"
  | "plan_published";

export type ExecutionPlanStatus =
  | "draft"
  | "ready"
  | "active"
  | "paused"
  | "completed"
  | "cancelled";

export type PlanTargetScope = "whole_class" | "student_group" | "custom_students";

export type PlanTaskType =
  | "supplementary_practice"
  | "resource_push"
  | "classroom_lecture"
  | "quick_check"
  | "individual_tutoring"
  | "project_task";

export type PlanTaskStatus =
  | "not_started"
  | "in_progress"
  | "completed"
  | "overdue"
  | "cancelled";

export type PlanLearningEventResult = "correct" | "wrong" | "completed" | "unresolved";

export interface PlanningResourceReference {
  id: string;
  title: string;
  resource_type: ResourceType | "chapter" | "knowledge_point" | string;
}

export interface PlanningKnowledgePointReference {
  id: string;
  name: string;
}

export interface PlanningStudentReference {
  id: string;
  display_name: string;
}

export interface ExpectedEffect {
  summary: string;
  impact: number | null;
  metrics: Record<string, unknown>[];
}

export interface TeachingMethodWeight {
  name: string;
  weight: number;
}

export interface TeachingFlowStep {
  order: number;
  title: string;
  description: string;
}

export interface TeachingStrategyListItem {
  id: string;
  course_id: string;
  title: string;
  description: string;
  type: TeachingStrategyType;
  priority: TeachingStrategyPriority;
  status: TeachingStrategyStatus;
  source: TeachingStrategySource;
  target_knowledge_points: PlanningKnowledgePointReference[];
  target_student_count: number;
  expected_effect: ExpectedEffect;
  updated_at: string;
}

export interface TeachingStrategyVersion {
  id: string;
  strategy_id: string;
  version: number;
  action: TeachingStrategyHistoryAction;
  status: TeachingStrategyStatus;
  snapshot: Record<string, unknown>;
  changed_by: string;
  created_at: string;
}

export interface TeachingStrategyPlanReference {
  id: string;
  title: string;
  status: ExecutionPlanStatus;
}

export interface TeachingStrategyDetail {
  id: string;
  course: { id: string; name: string };
  title: string;
  description: string;
  type: TeachingStrategyType;
  priority: TeachingStrategyPriority;
  status: TeachingStrategyStatus;
  source: TeachingStrategySource;
  version: number;
  goals: string[];
  teaching_methods: TeachingMethodWeight[];
  teaching_flow: TeachingFlowStep[];
  personalization_rules: string[];
  ai_rules: string[];
  target_knowledge_points: PlanningKnowledgePointReference[];
  target_students: PlanningStudentReference[];
  resources: PlanningResourceReference[];
  expected_effect: ExpectedEffect;
  generated_context: Record<string, unknown>;
  evidence: {
    learning_event_count: number;
    knowledge_point_count: number;
    student_count: number;
  };
  linked_plans: TeachingStrategyPlanReference[];
  change_history: TeachingStrategyVersion[];
  created_at: string;
  updated_at: string;
}

export interface TeachingStrategyPage {
  items: TeachingStrategyListItem[];
  total: number;
  nextCursor: string | null;
}

export type AIAnalysisType = "initial" | "secondary";

export type AIAnalysisStatus = "analyzing" | "completed" | "failed";

export type AIAnalysisScope =
  | "whole_class"
  | "student_group"
  | "custom_students";

export type AIAnalysisEvidenceSource =
  | "initial_analysis"
  | "learning_event"
  | "mastery_snapshot"
  | "quick_check_attempt"
  | "conversation_message"
  | "review_flag"
  | "message_citation"
  | "knowledge_chunk";

export interface AIAnalysisCreateRequest {
  knowledge_point_id?: string | null;
  scope?: AIAnalysisScope;
  student_ids?: string[];
  time_range_days?: number;
  focus?: string | null;
}

export interface AIAnalysisReanalyzeRequest {
  focus?: string | null;
  time_range_days?: number | null;
}

export interface AIAnalysisFact {
  fact: string;
  evidence_ids: string[];
}

export interface AIAnalysisEvidence {
  id: string;
  source_type: AIAnalysisEvidenceSource;
  source_id: string;
  student_id: string | null;
  knowledge_point_id: string | null;
  label: string;
  description: string | null;
  snapshot: Record<string, unknown>;
  created_at: string;
}

export interface AIAnalysisResult {
  conclusion: string;
  root_cause: string;
  recommendation: string;
  affected_student_ids: string[];
  facts: AIAnalysisFact[];
  evidence_summary: Record<string, unknown>[];
  recommendation_payload: Record<string, unknown>;
  insufficient_evidence: boolean;
  model_name: string | null;
  strategy_id: string | null;
  generated_at: string;
}

export interface AIAnalysis {
  id: string;
  course_id: string;
  knowledge_point_id: string | null;
  previous_analysis_id: string | null;
  analysis_type: AIAnalysisType;
  scope: AIAnalysisScope;
  student_ids: string[];
  time_range_days: number;
  focus: string | null;
  status: AIAnalysisStatus;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  updated_at: string;
  result: AIAnalysisResult | null;
  evidence: AIAnalysisEvidence[];
}

export interface AIAnalysisListItem {
  id: string;
  course_id: string;
  knowledge_point_id: string | null;
  analysis_type: AIAnalysisType;
  scope: AIAnalysisScope;
  status: AIAnalysisStatus;
  student_count: number;
  evidence_count: number;
  insufficient_evidence: boolean;
  conclusion: string | null;
  recommendation: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface AIAnalysisPage {
  items: AIAnalysisListItem[];
  total: number;
  nextCursor: string | null;
}

export interface AIAnalysisStrategyRequest {
  title?: string | null;
  description?: string | null;
  type?: TeachingStrategyType | null;
  priority?: TeachingStrategyPriority | null;
}

export interface TeachingStrategyGenerateRequest {
  knowledgePointIds: string[];
  studentIds: string[];
  insightIds: string[];
  timeRangeDays: number;
}

export interface TeachingStrategyCreateRequest {
  title: string;
  description: string;
  type: TeachingStrategyType;
  priority: TeachingStrategyPriority;
  goals?: string[];
  teaching_methods?: TeachingMethodWeight[];
  teaching_flow?: TeachingFlowStep[];
  personalization_rules?: string[];
  ai_rules?: string[];
  target_knowledge_point_ids?: string[];
  target_student_ids?: string[];
  resource_ids?: string[];
  expected_effect?: ExpectedEffect;
}

export type TeachingStrategyUpdateRequest = Partial<TeachingStrategyCreateRequest>;

export type TeachingStrategyAction =
  | "accept"
  | "dismiss"
  | "activate"
  | "pause"
  | "resume"
  | "complete";

export interface ExecutionPlanCreateRequest {
  strategy_id: string;
  title: string;
  description: string;
  start_date: string;
  end_date: string;
  target_scope: PlanTargetScope;
  target_student_ids?: string[];
  knowledge_point_ids?: string[];
  actions?: PlanTaskType[];
  resource_ids?: string[];
  plan_parameters?: Record<string, unknown>;
  evaluation_metrics?: string[];
  teacher_note?: string | null;
  publish?: boolean;
}

export interface ExecutionPlanUpdateRequest {
  title?: string;
  description?: string;
  start_date?: string;
  end_date?: string;
  target_scope?: PlanTargetScope;
  target_student_ids?: string[];
  knowledge_point_ids?: string[];
  actions?: PlanTaskType[];
  resource_ids?: string[];
  plan_parameters?: Record<string, unknown>;
  evaluation_metrics?: string[];
  teacher_note?: string | null;
  publish?: boolean;
}

export type ExecutionPlanAction = "publish" | "pause" | "resume" | "complete" | "cancel";

export interface PlanTaskCompletion {
  completed: number;
  total: number;
}

export interface PlanTaskItem {
  id: string;
  plan_id: string;
  week_number: number;
  title: string;
  description: string;
  type: PlanTaskType;
  status: PlanTaskStatus;
  due_at: string | null;
  knowledge_point_ids: string[];
  resource_ids: string[];
  resources: PlanningResourceReference[];
  target_student_ids: string[];
  completion: PlanTaskCompletion;
}

export interface PlanTaskPage {
  items: PlanTaskItem[];
  total: number;
  nextCursor: string | null;
}

export interface PlanTaskUpdateRequest {
  title?: string;
  description?: string;
  type?: PlanTaskType;
  status?: PlanTaskStatus;
  due_at?: string | null;
  knowledge_point_ids?: string[];
  resource_ids?: string[];
  target_student_ids?: string[];
}

export interface ExecutionPlanWeekItem {
  id: string;
  week_number: number;
  start_date: string;
  end_date: string;
  content: string;
  knowledge_point_ids: string[];
  resources: PlanningResourceReference[];
  tasks: PlanTaskItem[];
}

export interface PlanProgress {
  percentage: number;
  completed_tasks: number;
  total_tasks: number;
  overdue_tasks: number;
  current_week: number | null;
}

export interface PlanStrategyReference {
  id: string;
  title: string;
  version: number;
}

export interface PlanEffectMetric {
  metric: string;
  label: string;
  before: number | null;
  after: number | null;
  delta: number | null;
  sample_size: number;
  source: string;
}

export interface PlanTaskEffectiveness {
  task_id: string;
  title: string;
  completion_rate: number;
  event_count: number;
  observed_change: number | null;
}

export interface PlanEffect {
  plan_id: string | null;
  strategy_id: string | null;
  period: { start: string; end: string };
  metrics: PlanEffectMetric[];
  task_effectiveness: PlanTaskEffectiveness[];
  remaining_issues: string[];
  facts: string[];
  ai_explanation: string | null;
  insufficient_evidence: boolean;
}

export interface ExecutionPlanListItem {
  id: string;
  course_id: string;
  strategy: PlanStrategyReference;
  title: string;
  description: string;
  status: ExecutionPlanStatus;
  start_date: string;
  end_date: string;
  target_scope: PlanTargetScope;
  target_student_count: number;
  knowledge_point_count: number;
  task_count: number;
  progress: PlanProgress;
  updated_at: string;
}

export interface ExecutionPlanPage {
  items: ExecutionPlanListItem[];
  total: number;
  nextCursor: string | null;
}

export interface ExecutionPlanDetail {
  id: string;
  course: { id: string; name: string };
  strategy: PlanStrategyReference;
  title: string;
  description: string;
  status: ExecutionPlanStatus;
  start_date: string;
  end_date: string;
  target_scope: PlanTargetScope;
  target_students: PlanningStudentReference[];
  knowledge_points: PlanningKnowledgePointReference[];
  resources: PlanningResourceReference[];
  actions: PlanTaskType[];
  plan_parameters: Record<string, unknown>;
  evaluation_metrics: string[];
  teacher_note: string | null;
  progress: PlanProgress;
  weekly_plans: ExecutionPlanWeekItem[];
  tasks: PlanTaskItem[];
  recent_learning_events: PlanLearningEventItem[];
  effect_summary: PlanEffect | null;
  created_at: string;
  updated_at: string;
}

export interface PlanLearningEventItem {
  id: string;
  course_id: string;
  plan_id: string;
  task_id: string | null;
  week_number: number | null;
  student: PlanningStudentReference;
  knowledge_point: PlanningKnowledgePointReference | null;
  event_type: LearningEventType;
  result: PlanLearningEventResult;
  weight: number;
  evidence: string | null;
  metadata_json: Record<string, unknown>;
  created_at: string;
}

export interface PlanLearningEventPage {
  items: PlanLearningEventItem[];
  total: number;
  nextCursor: string | null;
}

export interface WeeklyPlanGenerateRequest {
  teacher_note?: string | null;
  regenerate?: boolean;
}

export interface WeeklyPlanRecommendation {
  id: string;
  content: string;
  status: "pending";
}

export interface WeeklyPlanGeneration {
  status: "draft";
  generation_id: string;
  weeks: ExecutionPlanWeekItem[];
  recommendations: WeeklyPlanRecommendation[];
}

export type ChatStreamEvent =
  | { event: "text_delta"; data: { delta: string } }
  | {
      event: "message_start";
      data: { user_message_id: string; assistant_message_id: string };
    }
  | { event: "block"; data: { block: AIMessageBlock } }
  | {
      event: "interrupted";
      data: { message_id: string; content: string };
    }
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

export interface QuickCheckAttemptRequest {
  attempt_id: string;
  question_id: string;
  selected_option_id: string;
  conversation_id?: string | null;
  message_id?: string | null;
}

export interface QuickCheckAttemptResponse {
  attempt_id: string;
  question_id: string;
  correct: boolean;
  locked: boolean;
  explanation: string | null;
  hint: string | null;
  mastery_update: MasteryUpdateBlock | null;
}

export interface HintRequest {
  level?: number | null;
}

export interface HintResponse {
  message_id: string;
  hint: HintBlock;
}

export interface StudentLearningEventItem {
  id: string;
  course_id: string;
  student_id: string;
  knowledge_point_id: string | null;
  knowledge_point_name: string | null;
  conversation_id: string | null;
  message_id: string | null;
  plan_id: string | null;
  task_id: string | null;
  week_number: number | null;
  event_type: LearningEventType;
  result: "correct" | "wrong" | "completed" | "unresolved";
  weight: number;
  evidence: string | null;
  metadata_json: Record<string, unknown>;
  mastery_before: number | null;
  mastery_after: number | null;
  created_at: string;
}

export interface StudentLearningEventPage {
  items: StudentLearningEventItem[];
  total: number;
  next_cursor: string | null;
}

export interface ChapterProgressItem {
  chapter_id: string;
  title: string;
  order_index: number;
  status: "not_started" | "in_progress" | "completed";
  progress_percent: number;
  knowledge_point_count: number;
  started_knowledge_point_count: number;
  mastered_knowledge_point_count: number;
  average_mastery: number | null;
  last_learning_at: string | null;
  completion_basis: string;
}

export interface StudentCourseProgress {
  course_id: string;
  student_id: string;
  current_chapter_id: string | null;
  current_knowledge_point_id: string | null;
  last_learning_at: string | null;
  overall_progress_percent: number;
  chapters: ChapterProgressItem[];
}

export interface WrongQuestionSummary {
  question_id: string;
  title: string;
  prompt: string;
  question_type: string;
  difficulty: string;
  chapter_id: string | null;
  chapter_title: string | null;
  knowledge_point_id: string | null;
  knowledge_point_name: string | null;
  wrong_count: number;
  latest_wrong_at: string;
  mastery: number | null;
  review_status: "unresolved" | "resolved";
}

export interface WrongQuestionPage {
  items: WrongQuestionSummary[];
  total: number;
  next_cursor: string | null;
}

export interface WrongQuestionDetail {
  question: WrongQuestionSummary;
  options: Array<{ id: string; label: string }>;
  correct_option_id: string | null;
  explanation: string | null;
  selected_option_id: string | null;
  latest_attempt_id: string | null;
  source_document_id: string | null;
  source_page: number | null;
}

export interface KnowledgePointQuickCheckSet {
  course_id: string;
  knowledge_point_id: string;
  knowledge_point_name: string;
  purpose: "consolidation";
  requested_count: number;
  items: QuickCheckBlock[];
  insufficient_questions: boolean;
}

export interface StudentResourceItem {
  id: string;
  title: string;
  resource_type: string;
  status: string;
  summary: string | null;
  chapter_title: string | null;
  mime_type: string | null;
  page_count: number | null;
  external_url: string | null;
  available: boolean;
  updated_at: string;
}

export interface StudentResourcePage {
  items: StudentResourceItem[];
  total: number;
}

export interface KnowledgePointSourceItem {
  document_id: string;
  document_name: string;
  chapter_id: string;
  chapter_title: string;
  chunk_id: string;
  page_start: number;
  page_end: number;
  quote: string;
}

export interface KnowledgePointSourcePage {
  knowledge_point_id: string;
  knowledge_point_name: string;
  items: KnowledgePointSourceItem[];
  total: number;
}

export interface StudentTeacherSummary {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
}

export interface StudentTeacherListResponse {
  course_id: string;
  teachers: StudentTeacherSummary[];
}

export interface StudentPlanTaskItem {
  id: string;
  plan_id: string;
  plan_title: string;
  week_number: number;
  title: string;
  description: string;
  task_type: string;
  status: string;
  due_at: string | null;
  knowledge_point_ids: string[];
  resources: Array<Record<string, unknown>>;
  completed_at: string | null;
  completion_evidence: string | null;
}

export interface StudentPlanTaskPage {
  items: StudentPlanTaskItem[];
  total: number;
}

export interface StudentConversationSummary {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
  matching_message_count: number;
  latest_matching_message_id: string;
  latest_matching_at: string;
}

export interface StudentConversationPage {
  items: StudentConversationSummary[];
  total: number;
}

export interface MisconceptionEvidence {
  knowledge_point_id: string;
  label: string;
  description: string;
  occurrence_count: number;
  affected_student_count: number;
  sample_event_ids: string[];
  insufficient_evidence: boolean;
  window_start: string;
  window_end: string;
}

export interface AnnouncementCreateRequest {
  title: string;
  content: string;
  publish?: boolean;
}

export interface Announcement {
  id: string;
  course_id: string;
  title: string;
  content: string;
  published_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  is_read: boolean;
  read_at: string | null;
}

export interface AnnouncementPage {
  items: Announcement[];
  total: number;
  next_cursor: string | null;
}

export interface AnnouncementReadResponse {
  announcement_id: string;
  read_at: string;
}
