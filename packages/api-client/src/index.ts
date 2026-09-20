import type {
  Announcement,
  AnnouncementCreateRequest,
  AnnouncementPage,
  AnnouncementReadResponse,
  KnowledgePointQuickCheckSet,
  KnowledgePointSourcePage,
  MisconceptionEvidence,
  StudentConversationPage,
  StudentCourseProgress,
  StudentLearningEventPage,
  StudentPlanTaskPage,
  StudentResourcePage,
  StudentTeacherListResponse,
  WrongQuestionDetail,
  WrongQuestionPage,
  AuthSessionResponse,
  Chapter,
  ChapterAnalytics,
  ChapterCreateRequest,
  ChapterUpdateRequest,
  AvatarUploadResponse,
  ChatContinueRequest,
  ChatStreamEvent,
  ChatStreamRequest,
  ChunkSearchRequest,
  ChunkSearchResult,
  Conversation,
  Course,
  CourseCreateRequest,
  CourseDashboard,
  CourseUpdateRequest,
  CourseDocument,
  CourseMember,
  DocumentMetadataUpdateRequest,
  DevelopmentLoginRequest,
  DemoDatasetStatus,
  DocumentCitationPage,
  DocumentIndexStatus,
  DocumentPageEvidence,
  DocumentUploadSource,
  PasswordChangeRequest,
  PasswordChangeResponse,
  PasswordLoginRequest,
  PasswordResetRequest,
  PasswordResetResponse,
  SessionRefreshRequest,
  TeacherProfile,
  TeacherProfileUpdateRequest,
  ExecutionPlanAction,
  ExecutionPlanCreateRequest,
  ExecutionPlanDetail,
  ExecutionPlanListItem,
  ExecutionPlanPage,
  ExecutionPlanStatus,
  ExecutionPlanUpdateRequest,
  ErrorPatternReport,
  ExternalResource,
  ExternalResourceCreateRequest,
  ExternalResourcePage,
  ExternalResourceStatus,
  ExternalResourceUpdateRequest,
  KnowledgeGraph,
  MasteryTrend,
  PlanEffect,
  PlanLearningEventPage,
  PlanTaskItem,
  PlanTaskPage,
  PlanTaskStatus,
  PlanTaskUpdateRequest,
  TeachingStrategyAction,
  TeachingStrategyCreateRequest,
  TeachingStrategyDetail,
  TeachingStrategyGenerateRequest,
  TeachingStrategyPage,
  TeachingStrategyPriority,
  TeachingStrategyStatus,
  TeachingStrategyType,
  TeachingStrategyUpdateRequest,
  TeachingStrategyVersion,
  WeeklyPlanGenerateRequest,
  WeeklyPlanGeneration,
  PermanentDeleteResult,
  QuestionItem,
  QuestionItemCreateRequest,
  QuestionItemPage,
  QuestionItemUpdateRequest,
  ResourceListPage,
  ResourceListItem,
  ResourceType,
  EmbeddingResult,
  HealthResponse,
  HintRequest,
  HintResponse,
  KnowledgeChunk,
  KnowledgePoint,
  KnowledgePointAnalytics,
  KnowledgePointCreateRequest,
  KnowledgePointMergeRequest,
  KnowledgePointUpdateRequest,
  LearningEventCreateRequest,
  LearningEventType,
  LearningEventRecord,
  MasteryState,
  Message,
  Notification,
  NotificationMarkAllReadResponse,
  NotificationPage,
  NotificationUnreadCount,
  NotResolvedRequest,
  QuickCheckAttemptRequest,
  QuickCheckAttemptResponse,
  ReviewContext,
  ReviewDecisionRequest,
  ReviewFlag,
  ReviewFlagQuery,
  ReviewFlagSummary,
  ReviewHistoryEntry,
  ReviewReason,
  ReviewRegeneration,
  ReviewRegenerationRequest,
  ReviewRegenerationStatus,
  ReviewSeverity,
  ReviewStatus,
  ReviewVersion,
  SmsSendRequest,
  SmsRegistrationRequest,
  SmsSendResponse,
  SmsVerifyRequest,
  SmsVerifyResponse,
  StudentLearningDetail,
  SystemStatusResponse,
  TeacherMessage,
  TeachingPolicy,
  TeachingPolicyUpdateRequest,
  TeacherDashboardOverview,
  User,
} from "@echo/shared-types";

export interface ApiClientOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  getAccessToken?: () => string | null | undefined;
  getRefreshToken?: () => string | null | undefined;
  onAuthSessionUpdate?: (
    session: AuthSessionResponse,
  ) => Promise<void> | void;
  onAuthSessionExpired?: () => Promise<void> | void;
}

export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly detail?: unknown,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

async function readError(response: Response): Promise<ApiClientError> {
  let detail: unknown;
  try {
    const body = (await response.json()) as { detail?: unknown };
    detail = body.detail;
  } catch {
    detail = undefined;
  }

  const structuredMessage =
    typeof detail === "object" && detail !== null && "message" in detail
      ? String((detail as { message?: unknown }).message || "")
      : "";
  const message =
    typeof detail === "string"
      ? detail
      : structuredMessage || `ECHO API request failed: ${response.status}`;
  return new ApiClientError(response.status, message, detail);
}

function createDocumentFormData(file: DocumentUploadSource, fileName?: string): FormData {
  const formData = new FormData();
  if ("uri" in file) {
    formData.append("file", file as unknown as Blob, file.name);
  } else {
    formData.append("file", file, fileName);
  }
  return formData;
}

function parseSseBlock(block: string): ChatStreamEvent | null {
  let eventName: string | null = null;
  const dataLines: string[] = [];

  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) {
      eventName = line.slice("event:".length).trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice("data:".length).trimStart());
    }
  }

  if (!eventName || dataLines.length === 0) {
    return null;
  }

  return {
    event: eventName,
    data: JSON.parse(dataLines.join("\n")) as Record<string, unknown>,
  } as ChatStreamEvent;
}

async function* parseSseEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<ChatStreamEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      buffer = buffer.replace(/\r\n/g, "\n");
      let boundary = buffer.indexOf("\n\n");
      while (boundary >= 0) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const event = parseSseBlock(block);
        if (event) {
          yield event;
        }
        boundary = buffer.indexOf("\n\n");
      }
    }

    buffer += decoder.decode();
    buffer = buffer.replace(/\r\n/g, "\n");
    const finalEvent = parseSseBlock(buffer);
    if (finalEvent) {
      yield finalEvent;
    }
  } finally {
    reader.releaseLock();
  }
}

export function createApiClient({
  baseUrl,
  fetchImpl = fetch,
  getAccessToken,
  getRefreshToken,
  onAuthSessionUpdate,
  onAuthSessionExpired,
}: ApiClientOptions) {
  const root = baseUrl.replace(/\/$/, "");
  let refreshPromise: Promise<string | null> | null = null;

  function canRefresh(path: string): boolean {
    return ![
      "/api/v1/auth/sms/",
      "/api/v1/auth/register/",
      "/api/v1/auth/login/",
      "/api/v1/auth/password/reset",
      "/api/v1/auth/refresh",
      "/api/v1/auth/logout",
    ].some((prefix) => path.startsWith(prefix));
  }

  async function refreshAccessToken(): Promise<string | null> {
    if (!getRefreshToken || !onAuthSessionUpdate) return null;
    if (refreshPromise) return refreshPromise;
    refreshPromise = (async () => {
      const refreshToken = getRefreshToken();
      if (!refreshToken) {
        await onAuthSessionExpired?.();
        return null;
      }
      try {
        const response = await fetchImpl(`${root}/api/v1/auth/refresh`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });
        if (!response.ok) {
          await onAuthSessionExpired?.();
          return null;
        }
        const session = (await response.json()) as AuthSessionResponse;
        await onAuthSessionUpdate(session);
        return session.access_token;
      } catch {
        return null;
      } finally {
        refreshPromise = null;
      }
    })();
    return refreshPromise;
  }

  async function request<T>(path: string, init?: RequestInit, userId?: string): Promise<T> {
    const headers = new Headers(init?.headers);
    const isFormData = typeof FormData !== "undefined" && init?.body instanceof FormData;
    if (init?.body !== undefined && !isFormData && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
    let accessToken = getAccessToken?.();
    if (accessToken) {
      headers.set("Authorization", `Bearer ${accessToken}`);
    } else if (userId) {
      headers.set("X-User-Id", userId);
    }

    let response = await fetchImpl(`${root}${path}`, {
      ...init,
      headers,
    });

    if (response.status === 401 && canRefresh(path)) {
      accessToken = await refreshAccessToken();
      if (accessToken) {
        headers.set("Authorization", `Bearer ${accessToken}`);
        headers.delete("X-User-Id");
        response = await fetchImpl(`${root}${path}`, {
          ...init,
          headers,
        });
      } else {
        await onAuthSessionExpired?.();
      }
    }

    if (!response.ok) {
      if (response.status === 401) {
        await onAuthSessionExpired?.();
      }
      throw await readError(response);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json() as Promise<T>;
  }

  function reviewFlagRequest(
    userId: string,
    courseId: string,
    flagId: string,
    payload: ReviewDecisionRequest,
  ) {
    return request<ReviewFlag>(
      `/api/v1/courses/${courseId}/review-flags/${flagId}/review`,
      {
        method: "POST",
        body: JSON.stringify(payload),
      },
      userId,
    );
  }

  return {
    health: () => request<HealthResponse>("/api/v1/health"),
    getSystemStatus: (userId: string) =>
      request<SystemStatusResponse>("/api/v1/system/status", undefined, userId),
    getDemoStatus: (userId: string) =>
      request<DemoDatasetStatus>("/api/v1/demo/status", undefined, userId),
    resetDemoData: (userId: string) =>
      request<DemoDatasetStatus>("/api/v1/demo/reset", { method: "POST" }, userId),
    login: (payload: DevelopmentLoginRequest) =>
      request<User>("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    sendSmsCode: (payload: SmsSendRequest) =>
      request<SmsSendResponse>("/api/v1/auth/sms/send", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    verifySmsCode: (payload: SmsVerifyRequest) =>
      request<SmsVerifyResponse>("/api/v1/auth/sms/verify", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    registerWithSms: (payload: SmsRegistrationRequest) =>
      request<AuthSessionResponse>("/api/v1/auth/register/sms", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    loginWithPassword: (payload: PasswordLoginRequest) =>
      request<AuthSessionResponse>("/api/v1/auth/login/password", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    resetPassword: (payload: PasswordResetRequest) =>
      request<PasswordResetResponse>("/api/v1/auth/password/reset", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    refreshSession: (payload: SessionRefreshRequest) =>
      request<AuthSessionResponse>("/api/v1/auth/refresh", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    logout: (refreshToken: string) =>
      request<void>("/api/v1/auth/logout", {
        method: "POST",
        body: JSON.stringify({ refresh_token: refreshToken }),
      }),
    getStudentLearningEvents: (
      userId: string,
      courseId: string,
      studentId: string,
      options?: {
        cursor?: string;
        limit?: number;
        eventType?: LearningEventType;
        knowledgePointId?: string;
        from?: string;
        to?: string;
      },
    ) => {
      const params = new URLSearchParams();
      if (options?.cursor) params.set("cursor", options.cursor);
      if (options?.limit) params.set("limit", String(options.limit));
      if (options?.eventType) params.set("eventType", options.eventType);
      if (options?.knowledgePointId)
        params.set("knowledgePointId", options.knowledgePointId);
      if (options?.from) params.set("from", options.from);
      if (options?.to) params.set("to", options.to);
      const query = params.toString();
      return request<StudentLearningEventPage>(
        `/api/v1/courses/${courseId}/students/${studentId}/learning-events${query ? `?${query}` : ""}`,
        undefined,
        userId,
      );
    },
    getStudentCourseProgress: (userId: string, courseId: string, studentId: string) =>
      request<StudentCourseProgress>(
        `/api/v1/courses/${courseId}/students/${studentId}/progress`,
        undefined,
        userId,
      ),
    listWrongQuestions: (
      userId: string,
      courseId: string,
      studentId: string,
      options?: { cursor?: string; limit?: number; knowledgePointId?: string; status?: string },
    ) => {
      const params = new URLSearchParams();
      if (options?.cursor) params.set("cursor", options.cursor);
      if (options?.limit) params.set("limit", String(options.limit));
      if (options?.knowledgePointId)
        params.set("knowledgePointId", options.knowledgePointId);
      if (options?.status) params.set("status", options.status);
      const query = params.toString();
      return request<WrongQuestionPage>(
        `/api/v1/courses/${courseId}/students/${studentId}/wrong-questions${query ? `?${query}` : ""}`,
        undefined,
        userId,
      );
    },
    getWrongQuestion: (
      userId: string,
      courseId: string,
      studentId: string,
      questionId: string,
    ) =>
      request<WrongQuestionDetail>(
        `/api/v1/courses/${courseId}/students/${studentId}/wrong-questions/${questionId}`,
        undefined,
        userId,
      ),
    getKnowledgePointQuickChecks: (
      userId: string,
      courseId: string,
      knowledgePointId: string,
      count = 3,
    ) =>
      request<KnowledgePointQuickCheckSet>(
        `/api/v1/courses/${courseId}/knowledge-points/${knowledgePointId}/quick-checks?count=${count}&purpose=consolidation`,
        undefined,
        userId,
      ),
    getStudentCourseResources: (userId: string, courseId: string) =>
      request<StudentResourcePage>(
        `/api/v1/courses/${courseId}/student-resources`,
        undefined,
        userId,
      ),
    getKnowledgePointSources: (
      userId: string,
      courseId: string,
      knowledgePointId: string,
    ) =>
      request<KnowledgePointSourcePage>(
        `/api/v1/courses/${courseId}/knowledge-points/${knowledgePointId}/sources`,
        undefined,
        userId,
      ),
    getStudentRelatedConversations: (
      userId: string,
      courseId: string,
      studentId: string,
      knowledgePointId: string,
    ) =>
      request<StudentConversationPage>(
        `/api/v1/courses/${courseId}/students/${studentId}/knowledge-points/${knowledgePointId}/conversations`,
        undefined,
        userId,
      ),
    getCourseTeachers: (userId: string, courseId: string) =>
      request<StudentTeacherListResponse>(
        `/api/v1/courses/${courseId}/teachers`,
        undefined,
        userId,
      ),
    getStudentPlanTasks: (userId: string, courseId: string, studentId: string) =>
      request<StudentPlanTaskPage>(
        `/api/v1/courses/${courseId}/students/${studentId}/plan-tasks`,
        undefined,
        userId,
      ),
    getStudentMisconceptions: (
      userId: string,
      courseId: string,
      studentId: string,
      knowledgePointId: string,
      days = 30,
    ) =>
      request<MisconceptionEvidence>(
        `/api/v1/courses/${courseId}/students/${studentId}/knowledge-points/${knowledgePointId}/misconceptions?days=${days}`,
        undefined,
        userId,
      ),
    createAnnouncement: (
      userId: string,
      courseId: string,
      payload: AnnouncementCreateRequest,
    ) =>
      request<Announcement>(`/api/v1/courses/${courseId}/announcements`, {
        method: "POST",
        body: JSON.stringify(payload),
      }, userId),
    listAnnouncements: (
      userId: string,
      courseId: string,
      options?: { includeDrafts?: boolean; cursor?: string; limit?: number },
    ) => {
      const params = new URLSearchParams();
      if (options?.includeDrafts !== undefined)
        params.set("includeDrafts", String(options.includeDrafts));
      if (options?.cursor) params.set("cursor", options.cursor);
      if (options?.limit) params.set("limit", String(options.limit));
      const query = params.toString();
      return request<AnnouncementPage>(
        `/api/v1/courses/${courseId}/announcements${query ? `?${query}` : ""}`,
        undefined,
        userId,
      );
    },
    markAnnouncementRead: (userId: string, courseId: string, announcementId: string) =>
      request<AnnouncementReadResponse>(
        `/api/v1/courses/${courseId}/announcements/${announcementId}/read`,
        { method: "POST" },
        userId,
      ),
    me: (userId: string) => request<User>("/api/v1/auth/me", undefined, userId),
    getTeacherProfile: (userId: string) =>
      request<TeacherProfile>("/api/v1/auth/me/profile", undefined, userId),
    updateTeacherProfile: (
      userId: string,
      payload: TeacherProfileUpdateRequest,
    ) =>
      request<TeacherProfile>(
        "/api/v1/auth/me/profile",
        { method: "PATCH", body: JSON.stringify(payload) },
        userId,
      ),
    changePassword: (userId: string, payload: PasswordChangeRequest) =>
      request<PasswordChangeResponse>(
        "/api/v1/auth/change-password",
        { method: "POST", body: JSON.stringify(payload) },
        userId,
      ),
    uploadAvatar: (userId: string, file: DocumentUploadSource, fileName?: string) =>
      request<AvatarUploadResponse>(
        "/api/v1/auth/me/avatar",
        { method: "POST", body: createDocumentFormData(file, fileName) },
        userId,
      ),
    deleteAvatar: (userId: string) =>
      request<void>("/api/v1/auth/me/avatar", { method: "DELETE" }, userId),
    listNotifications: (
      userId: string,
      options?: { unread?: boolean; cursor?: string; limit?: number },
    ) => {
      const params = new URLSearchParams();
      if (options?.unread !== undefined) params.set("unread", String(options.unread));
      if (options?.cursor) params.set("cursor", options.cursor);
      if (options?.limit) params.set("limit", String(options.limit));
      const query = params.toString();
      return request<NotificationPage>(
        `/api/v1/notifications${query ? `?${query}` : ""}`,
        undefined,
        userId,
      );
    },
    getUnreadNotificationCount: (userId: string) =>
      request<NotificationUnreadCount>(
        "/api/v1/notifications/unread-count",
        undefined,
        userId,
      ),
    markNotificationRead: (userId: string, notificationId: string) =>
      request<Notification>(
        `/api/v1/notifications/${notificationId}/read`,
        { method: "POST" },
        userId,
      ),
    markAllNotificationsRead: (userId: string) =>
      request<NotificationMarkAllReadResponse>(
        "/api/v1/notifications/read-all",
        { method: "POST" },
        userId,
      ),
    listCourses: (userId: string) => request<Course[]>("/api/v1/courses", undefined, userId),
    getCourse: (userId: string, courseId: string) =>
      request<Course>(`/api/v1/courses/${courseId}`, undefined, userId),
    joinCourse: (userId: string, code: string) =>
      request<Course>(
        "/api/v1/courses/join",
        {
          method: "POST",
          body: JSON.stringify({ code }),
        },
        userId,
      ),
    createCourse: (userId: string, payload: CourseCreateRequest) =>
      request<Course>(
        "/api/v1/courses",
        {
          method: "POST",
          body: JSON.stringify(payload),
        },
        userId,
      ),
    updateCourse: (userId: string, courseId: string, payload: CourseUpdateRequest) =>
      request<Course>(
        `/api/v1/courses/${courseId}`,
        { method: "PATCH", body: JSON.stringify(payload) },
        userId,
      ),
    archiveCourse: (userId: string, courseId: string) =>
      request<Course>(
        `/api/v1/courses/${courseId}/archive`,
        { method: "POST" },
        userId,
      ),
    restoreCourse: (userId: string, courseId: string) =>
      request<Course>(
        `/api/v1/courses/${courseId}/restore`,
        { method: "POST" },
        userId,
      ),
    publishCourse: (userId: string, courseId: string) =>
      request<Course>(
        `/api/v1/courses/${courseId}/publish`,
        {
          method: "POST",
        },
        userId,
      ),
    listCourseMembers: (userId: string, courseId: string) =>
      request<CourseMember[]>(
        `/api/v1/courses/${courseId}/members`,
        undefined,
        userId,
      ),
    listCourseDocuments: (userId: string, courseId: string) =>
      request<CourseDocument[]>(
        `/api/v1/courses/${courseId}/documents`,
        undefined,
        userId,
      ),
    uploadCourseDocument: (
      userId: string,
      courseId: string,
      file: DocumentUploadSource,
      fileName?: string,
      resourceType: ResourceType = "textbook",
    ) =>
      request<CourseDocument>(
        `/api/v1/courses/${courseId}/documents?resource_type=${resourceType}`,
        {
          method: "POST",
          body: createDocumentFormData(file, fileName),
        },
        userId,
      ),
    updateDocumentMetadata: (
      userId: string,
      courseId: string,
      documentId: string,
      payload: DocumentMetadataUpdateRequest,
    ) =>
      request<CourseDocument>(
        `/api/v1/courses/${courseId}/documents/${documentId}/metadata`,
        { method: "PATCH", body: JSON.stringify(payload) },
        userId,
      ),
    parseCourseDocument: (userId: string, documentId: string) =>
      request<CourseDocument>(
        `/api/v1/documents/${documentId}/parse`,
        { method: "POST" },
        userId,
      ),
    generateKnowledgeStructure: (userId: string, documentId: string) =>
      request<Chapter[]>(
        `/api/v1/documents/${documentId}/generate-structure`,
        { method: "POST" },
        userId,
      ),
    createDocumentChunks: (userId: string, documentId: string) =>
      request<KnowledgeChunk[]>(
        `/api/v1/documents/${documentId}/chunks`,
        { method: "POST" },
        userId,
      ),
    createDocumentEmbeddings: (userId: string, documentId: string) =>
      request<EmbeddingResult>(
        `/api/v1/documents/${documentId}/embeddings`,
        { method: "POST" },
        userId,
      ),
    searchCourse: (userId: string, courseId: string, payload: ChunkSearchRequest) =>
      request<ChunkSearchResult[]>(
        `/api/v1/courses/${courseId}/search`,
        {
          method: "POST",
          body: JSON.stringify(payload),
        },
        userId,
      ),
    getTeachingPolicy: (userId: string, courseId: string) =>
      request<TeachingPolicy>(
        `/api/v1/courses/${courseId}/teaching-policy`,
        undefined,
        userId,
      ),
    updateTeachingPolicy: (
      userId: string,
      courseId: string,
      payload: TeachingPolicyUpdateRequest,
    ) =>
      request<TeachingPolicy>(
        `/api/v1/courses/${courseId}/teaching-policy`,
        {
          method: "PUT",
          body: JSON.stringify(payload),
        },
        userId,
      ),
    listTeachingStrategies: (
      userId: string,
      courseId: string,
      options?: {
        status?: TeachingStrategyStatus;
        type?: TeachingStrategyType;
        priority?: TeachingStrategyPriority;
        cursor?: string;
        limit?: number;
      },
    ) => {
      const params = new URLSearchParams();
      if (options?.status) params.set("status", options.status);
      if (options?.type) params.set("type", options.type);
      if (options?.priority) params.set("priority", options.priority);
      if (options?.cursor) params.set("cursor", options.cursor);
      if (options?.limit) params.set("limit", String(options.limit));
      const query = params.toString();
      return request<TeachingStrategyPage>(
        `/api/v1/courses/${courseId}/teaching-strategies${query ? `?${query}` : ""}`,
        undefined,
        userId,
      );
    },
    generateTeachingStrategy: (
      userId: string,
      courseId: string,
      payload: TeachingStrategyGenerateRequest,
    ) =>
      request<TeachingStrategyDetail>(
        `/api/v1/courses/${courseId}/teaching-strategies/generate`,
        { method: "POST", body: JSON.stringify(payload) },
        userId,
      ),
    createTeachingStrategy: (
      userId: string,
      courseId: string,
      payload: TeachingStrategyCreateRequest,
    ) =>
      request<TeachingStrategyDetail>(
        `/api/v1/courses/${courseId}/teaching-strategies`,
        { method: "POST", body: JSON.stringify(payload) },
        userId,
      ),
    getTeachingStrategy: (userId: string, strategyId: string) =>
      request<TeachingStrategyDetail>(
        `/api/v1/teaching-strategies/${strategyId}`,
        undefined,
        userId,
      ),
    updateTeachingStrategy: (
      userId: string,
      strategyId: string,
      payload: TeachingStrategyUpdateRequest,
    ) =>
      request<TeachingStrategyDetail>(
        `/api/v1/teaching-strategies/${strategyId}`,
        { method: "PATCH", body: JSON.stringify(payload) },
        userId,
      ),
    actOnTeachingStrategy: (
      userId: string,
      strategyId: string,
      action: TeachingStrategyAction,
    ) =>
      request<TeachingStrategyDetail>(
        `/api/v1/teaching-strategies/${strategyId}/actions`,
        { method: "POST", body: JSON.stringify({ action }) },
        userId,
      ),
    listTeachingStrategyVersions: (userId: string, strategyId: string) =>
      request<TeachingStrategyVersion[]>(
        `/api/v1/teaching-strategies/${strategyId}/versions`,
        undefined,
        userId,
      ),
    getTeachingStrategyEffect: (userId: string, strategyId: string) =>
      request<PlanEffect>(
        `/api/v1/teaching-strategies/${strategyId}/effect`,
        undefined,
        userId,
      ),
    listExecutionPlans: (
      userId: string,
      courseId: string,
      options?: {
        strategyId?: string;
        status?: ExecutionPlanStatus;
        cursor?: string;
        limit?: number;
      },
    ) => {
      const params = new URLSearchParams();
      if (options?.strategyId) params.set("strategyId", options.strategyId);
      if (options?.status) params.set("status", options.status);
      if (options?.cursor) params.set("cursor", options.cursor);
      if (options?.limit) params.set("limit", String(options.limit));
      const query = params.toString();
      return request<ExecutionPlanPage>(
        `/api/v1/courses/${courseId}/execution-plans${query ? `?${query}` : ""}`,
        undefined,
        userId,
      );
    },
    createExecutionPlan: (
      userId: string,
      courseId: string,
      payload: ExecutionPlanCreateRequest,
    ) =>
      request<ExecutionPlanDetail>(
        `/api/v1/courses/${courseId}/execution-plans`,
        { method: "POST", body: JSON.stringify(payload) },
        userId,
      ),
    getExecutionPlan: (userId: string, planId: string) =>
      request<ExecutionPlanDetail>(
        `/api/v1/execution-plans/${planId}`,
        undefined,
        userId,
      ),
    updateExecutionPlan: (
      userId: string,
      planId: string,
      payload: ExecutionPlanUpdateRequest,
    ) =>
      request<ExecutionPlanDetail>(
        `/api/v1/execution-plans/${planId}`,
        { method: "PATCH", body: JSON.stringify(payload) },
        userId,
      ),
    actOnExecutionPlan: (
      userId: string,
      planId: string,
      action: ExecutionPlanAction,
    ) =>
      request<ExecutionPlanDetail>(
        `/api/v1/execution-plans/${planId}/actions`,
        { method: "POST", body: JSON.stringify({ action }) },
        userId,
      ),
    generateExecutionPlanWeeklyPlan: (
      userId: string,
      planId: string,
      payload: WeeklyPlanGenerateRequest,
    ) =>
      request<WeeklyPlanGeneration>(
        `/api/v1/execution-plans/${planId}/generate-weekly-plan`,
        { method: "POST", body: JSON.stringify(payload) },
        userId,
      ),
    listPlanTasks: (
      userId: string,
      planId: string,
      options?: { status?: PlanTaskStatus; week?: number; cursor?: string; limit?: number },
    ) => {
      const params = new URLSearchParams();
      if (options?.status) params.set("status", options.status);
      if (options?.week) params.set("week", String(options.week));
      if (options?.cursor) params.set("cursor", options.cursor);
      if (options?.limit) params.set("limit", String(options.limit));
      const query = params.toString();
      return request<PlanTaskPage>(
        `/api/v1/execution-plans/${planId}/tasks${query ? `?${query}` : ""}`,
        undefined,
        userId,
      );
    },
    updatePlanTask: (
      userId: string,
      taskId: string,
      payload: PlanTaskUpdateRequest,
    ) =>
      request<PlanTaskItem>(
        `/api/v1/plan-tasks/${taskId}`,
        { method: "PATCH", body: JSON.stringify(payload) },
        userId,
      ),
    listPlanLearningEvents: (
      userId: string,
      planId: string,
      options?: {
        studentId?: string;
        taskId?: string;
        knowledgePointId?: string;
        eventType?: LearningEventType;
        cursor?: string;
        limit?: number;
      },
    ) => {
      const params = new URLSearchParams();
      if (options?.studentId) params.set("studentId", options.studentId);
      if (options?.taskId) params.set("taskId", options.taskId);
      if (options?.knowledgePointId)
        params.set("knowledgePointId", options.knowledgePointId);
      if (options?.eventType) params.set("eventType", options.eventType);
      if (options?.cursor) params.set("cursor", options.cursor);
      if (options?.limit) params.set("limit", String(options.limit));
      const query = params.toString();
      return request<PlanLearningEventPage>(
        `/api/v1/execution-plans/${planId}/learning-events${query ? `?${query}` : ""}`,
        undefined,
        userId,
      );
    },
    getExecutionPlanEffect: (userId: string, planId: string) =>
      request<PlanEffect>(
        `/api/v1/execution-plans/${planId}/effect`,
        undefined,
        userId,
      ),
    getCourseDashboard: (userId: string, courseId: string) =>
      request<CourseDashboard>(`/api/v1/courses/${courseId}/dashboard`, undefined, userId),
    getDashboardOverview: (userId: string, courseId: string) =>
      request<TeacherDashboardOverview>(
        `/api/v1/dashboard/overview?courseId=${courseId}`,
        undefined,
        userId,
      ),
    getChapterAnalytics: (userId: string, courseId: string) =>
      request<ChapterAnalytics[]>(
        `/api/v1/courses/${courseId}/chapters/analytics`,
        undefined,
        userId,
      ),
    getKnowledgePointAnalytics: (
      userId: string,
      courseId: string,
      knowledgePointId: string,
    ) =>
      request<KnowledgePointAnalytics>(
        `/api/v1/courses/${courseId}/knowledge-points/${knowledgePointId}/analytics`,
        undefined,
        userId,
      ),
    getStudentLearningDetail: (
      userId: string,
      courseId: string,
      studentId: string,
    ) =>
      request<StudentLearningDetail>(
        `/api/v1/courses/${courseId}/students/${studentId}/learning`,
        undefined,
        userId,
      ),
    createLearningEvent: (
      userId: string,
      courseId: string,
      payload: LearningEventCreateRequest,
    ) =>
      request<LearningEventRecord>(
        `/api/v1/courses/${courseId}/learning-events`,
        {
          method: "POST",
          body: JSON.stringify(payload),
        },
        userId,
      ),
    getStudentMastery: (userId: string, courseId: string, studentId: string) =>
      request<MasteryState[]>(
        `/api/v1/courses/${courseId}/students/${studentId}/mastery`,
        undefined,
        userId,
      ),
    listReviewFlags: (
      userId: string,
      courseId: string,
      options?: {
        status?: ReviewStatus;
        severity?: ReviewSeverity;
        reason?: ReviewReason;
        studentId?: string;
        knowledgePointId?: string;
        q?: string;
        sort?: "newest" | "oldest" | "priority" | "severity";
        cursor?: string;
        limit?: number;
      },
    ) => {
      const params = new URLSearchParams();
      if (options?.status) params.set("status", options.status);
      if (options?.severity) params.set("severity", options.severity);
      if (options?.reason) params.set("reason", options.reason);
      if (options?.studentId) params.set("studentId", options.studentId);
      if (options?.knowledgePointId)
        params.set("knowledgePointId", options.knowledgePointId);
      if (options?.q) params.set("q", options.q);
      if (options?.sort) params.set("sort", options.sort);
      if (options?.cursor) params.set("cursor", options.cursor);
      if (options?.limit) params.set("limit", String(options.limit));
      const query = params.toString();
      return request<ReviewFlag[]>(
        `/api/v1/courses/${courseId}/review-flags${query ? `?${query}` : ""}`,
        undefined,
        userId,
      );
    },
    queryReviewFlags: (
      userId: string,
      courseId: string,
      options?: {
        status?: ReviewStatus;
        severity?: ReviewSeverity;
        reason?: ReviewReason;
        studentId?: string;
        knowledgePointId?: string;
        q?: string;
        sort?: "newest" | "oldest" | "priority" | "severity";
        cursor?: string;
        limit?: number;
      },
    ) => {
      const params = new URLSearchParams();
      if (options?.status) params.set("status", options.status);
      if (options?.severity) params.set("severity", options.severity);
      if (options?.reason) params.set("reason", options.reason);
      if (options?.studentId) params.set("studentId", options.studentId);
      if (options?.knowledgePointId)
        params.set("knowledgePointId", options.knowledgePointId);
      if (options?.q) params.set("q", options.q);
      if (options?.sort) params.set("sort", options.sort);
      if (options?.cursor) params.set("cursor", options.cursor);
      if (options?.limit) params.set("limit", String(options.limit));
      const query = params.toString();
      return request<ReviewFlagQuery>(
        `/api/v1/courses/${courseId}/review-flags/query${query ? `?${query}` : ""}`,
        undefined,
        userId,
      );
    },
    getReviewSummary: (userId: string, courseId: string) =>
      request<ReviewFlagSummary>(
        `/api/v1/courses/${courseId}/review-flags/summary`,
        undefined,
        userId,
      ),
    getReviewFlag: (userId: string, courseId: string, flagId: string) =>
      request<ReviewFlag>(
        `/api/v1/courses/${courseId}/review-flags/${flagId}`,
        undefined,
        userId,
      ),
    getReviewContext: (userId: string, courseId: string, flagId: string) =>
      request<ReviewContext>(
        `/api/v1/courses/${courseId}/review-flags/${flagId}/context`,
        undefined,
        userId,
      ),
    regenerateReview: (
      userId: string,
      courseId: string,
      flagId: string,
      payload: ReviewRegenerationRequest,
    ) =>
      request<ReviewRegeneration>(
        `/api/v1/courses/${courseId}/review-flags/${flagId}/regenerate`,
        { method: "POST", body: JSON.stringify(payload) },
        userId,
      ),
    getReviewRegeneration: (userId: string, courseId: string, flagId: string) =>
      request<ReviewRegenerationStatus>(
        `/api/v1/courses/${courseId}/review-flags/${flagId}/regeneration`,
        undefined,
        userId,
      ),
    listReviewVersions: (userId: string, courseId: string, flagId: string) =>
      request<ReviewVersion[]>(
        `/api/v1/courses/${courseId}/review-flags/${flagId}/versions`,
        undefined,
        userId,
      ),
    getReviewHistory: (userId: string, courseId: string, flagId: string) =>
      request<ReviewHistoryEntry[]>(
        `/api/v1/courses/${courseId}/review-flags/${flagId}/history`,
        undefined,
        userId,
      ),
    reportMessageNotResolved: (
      userId: string,
      courseId: string,
      messageId: string,
      payload: NotResolvedRequest,
    ) =>
      request<ReviewFlag>(
        `/api/v1/courses/${courseId}/messages/${messageId}/not-resolved`,
        {
          method: "POST",
          body: JSON.stringify(payload),
        },
        userId,
      ),
    getKnowledgePointMasteryTrend: (
      userId: string,
      courseId: string,
      knowledgePointId: string,
      days = 30,
    ) =>
      request<MasteryTrend>(
        `/api/v1/courses/${courseId}/knowledge-points/${knowledgePointId}/mastery-trend?days=${days}`,
        undefined,
        userId,
      ),
    getKnowledgePointErrorPatterns: (
      userId: string,
      courseId: string,
      knowledgePointId: string,
      days = 30,
    ) =>
      request<ErrorPatternReport>(
        `/api/v1/courses/${courseId}/knowledge-points/${knowledgePointId}/error-patterns?days=${days}`,
        undefined,
        userId,
      ),
    getStudentMasteryTrend: (userId: string, courseId: string, studentId: string, days = 90) =>
      request<MasteryTrend>(
        `/api/v1/courses/${courseId}/students/${studentId}/mastery-trend?days=${days}`,
        undefined,
        userId,
      ),
    getStudentErrorPatterns: (userId: string, courseId: string, studentId: string, days = 90) =>
      request<ErrorPatternReport>(
        `/api/v1/courses/${courseId}/students/${studentId}/error-patterns?days=${days}`,
        undefined,
        userId,
      ),
    listQuestionItems: (
      userId: string,
      courseId: string,
      options?: { knowledgePointId?: string; cursor?: string; limit?: number },
    ) => {
      const params = new URLSearchParams();
      if (options?.knowledgePointId)
        params.set("knowledgePointId", options.knowledgePointId);
      if (options?.cursor) params.set("cursor", options.cursor);
      if (options?.limit) params.set("limit", String(options.limit));
      const query = params.toString();
      return request<QuestionItemPage>(
        `/api/v1/courses/${courseId}/question-items${query ? `?${query}` : ""}`,
        undefined,
        userId,
      );
    },
    getQuestionItem: (userId: string, courseId: string, questionItemId: string) =>
      request<QuestionItem>(
        `/api/v1/courses/${courseId}/question-items/${questionItemId}`,
        undefined,
        userId,
      ),
    createQuestionItem: (
      userId: string,
      courseId: string,
      payload: QuestionItemCreateRequest,
    ) =>
      request<QuestionItem>(
        `/api/v1/courses/${courseId}/question-items`,
        { method: "POST", body: JSON.stringify(payload) },
        userId,
      ),
    updateQuestionItem: (
      userId: string,
      courseId: string,
      questionItemId: string,
      payload: QuestionItemUpdateRequest,
    ) =>
      request<QuestionItem>(
        `/api/v1/courses/${courseId}/question-items/${questionItemId}`,
        { method: "PATCH", body: JSON.stringify(payload) },
        userId,
      ),
    deleteQuestionItem: (userId: string, courseId: string, questionItemId: string) =>
      request<void>(
        `/api/v1/courses/${courseId}/question-items/${questionItemId}`,
        { method: "DELETE" },
        userId,
      ),
    listExternalResources: (
      userId: string,
      courseId: string,
      options?: {
        knowledgePointId?: string;
        status?: ExternalResourceStatus;
        cursor?: string;
        limit?: number;
      },
    ) => {
      const params = new URLSearchParams();
      if (options?.knowledgePointId)
        params.set("knowledgePointId", options.knowledgePointId);
      if (options?.status) params.set("status", options.status);
      if (options?.cursor) params.set("cursor", options.cursor);
      if (options?.limit) params.set("limit", String(options.limit));
      const query = params.toString();
      return request<ExternalResourcePage>(
        `/api/v1/courses/${courseId}/external-resources${query ? `?${query}` : ""}`,
        undefined,
        userId,
      );
    },
    createExternalResource: (
      userId: string,
      courseId: string,
      payload: ExternalResourceCreateRequest,
    ) =>
      request<ExternalResource>(
        `/api/v1/courses/${courseId}/external-resources`,
        { method: "POST", body: JSON.stringify(payload) },
        userId,
      ),
    updateExternalResource: (
      userId: string,
      courseId: string,
      resourceId: string,
      payload: ExternalResourceUpdateRequest,
    ) =>
      request<ExternalResource>(
        `/api/v1/courses/${courseId}/external-resources/${resourceId}`,
        { method: "PATCH", body: JSON.stringify(payload) },
        userId,
      ),
    deleteExternalResource: (userId: string, courseId: string, resourceId: string) =>
      request<void>(
        `/api/v1/courses/${courseId}/external-resources/${resourceId}`,
        { method: "DELETE" },
        userId,
      ),
    listResources: (
      userId: string,
      courseId: string,
      options?: { trashed?: boolean; cursor?: string; limit?: number },
    ) => {
      const params = new URLSearchParams();
      if (options?.trashed) params.set("trashed", "true");
      if (options?.cursor) params.set("cursor", options.cursor);
      if (options?.limit) params.set("limit", String(options.limit));
      const query = params.toString();
      return request<ResourceListPage>(
        `/api/v1/courses/${courseId}/resources${query ? `?${query}` : ""}`,
        undefined,
        userId,
      );
    },
    trashResource: (userId: string, courseId: string, resourceId: string) =>
      request<ResourceListItem>(
        `/api/v1/courses/${courseId}/resources/${resourceId}/trash`,
        { method: "POST" },
        userId,
      ),
    restoreResource: (userId: string, courseId: string, resourceId: string) =>
      request<ResourceListItem>(
        `/api/v1/courses/${courseId}/resources/${resourceId}/restore`,
        { method: "POST" },
        userId,
      ),
    permanentlyDeleteResource: (userId: string, courseId: string, resourceId: string) =>
      request<PermanentDeleteResult>(
        `/api/v1/courses/${courseId}/resources/${resourceId}?permanent=true`,
        { method: "DELETE" },
        userId,
      ),
    getKnowledgeGraph: (
      userId: string,
      courseId: string,
      options?: { chapterId?: string; pointId?: string },
    ) => {
      const params = new URLSearchParams();
      if (options?.chapterId) params.set("chapterId", options.chapterId);
      if (options?.pointId) params.set("pointId", options.pointId);
      const query = params.toString();
      return request<KnowledgeGraph>(
        `/api/v1/courses/${courseId}/knowledge-graph${query ? `?${query}` : ""}`,
        undefined,
        userId,
      );
    },
    getDocumentIndexStatus: (userId: string, courseId: string, documentId: string) =>
      request<DocumentIndexStatus>(
        `/api/v1/courses/${courseId}/documents/${documentId}/index-status`,
        undefined,
        userId,
      ),
    listDocumentCitations: (
      userId: string,
      courseId: string,
      documentId: string,
      options?: { cursor?: string; limit?: number },
    ) => {
      const params = new URLSearchParams();
      if (options?.cursor) params.set("cursor", options.cursor);
      if (options?.limit) params.set("limit", String(options.limit));
      const query = params.toString();
      return request<DocumentCitationPage>(
        `/api/v1/courses/${courseId}/documents/${documentId}/citations${query ? `?${query}` : ""}`,
        undefined,
        userId,
      );
    },
    getDocumentPageEvidence: (
      userId: string,
      courseId: string,
      documentId: string,
      pageNumber: number,
    ) =>
      request<DocumentPageEvidence>(
        `/api/v1/courses/${courseId}/documents/${documentId}/pages/${pageNumber}`,
        undefined,
        userId,
      ),
    getDocumentFileBlob: async (userId: string, courseId: string, documentId: string) => {
      const headers = new Headers({ "X-User-Id": userId });
      const response = await fetchImpl(
        `${root}/api/v1/courses/${courseId}/documents/${documentId}/file`,
        { headers },
      );
      if (!response.ok) {
        throw await readError(response);
      }
      return response.blob();
    },    listChapters: (userId: string, courseId: string) =>
      request<Chapter[]>(`/api/v1/courses/${courseId}/chapters`, undefined, userId),
    createChapter: (userId: string, documentId: string, payload: ChapterCreateRequest) =>
      request<Chapter>(
        `/api/v1/documents/${documentId}/chapters`,
        {
          method: "POST",
          body: JSON.stringify(payload),
        },
        userId,
      ),
    updateChapter: (userId: string, chapterId: string, payload: ChapterUpdateRequest) =>
      request<Chapter>(
        `/api/v1/chapters/${chapterId}`,
        {
          method: "PATCH",
          body: JSON.stringify(payload),
        },
        userId,
      ),
    deleteChapter: (userId: string, chapterId: string) =>
      request<void>(`/api/v1/chapters/${chapterId}`, { method: "DELETE" }, userId),
    createKnowledgePoint: (
      userId: string,
      chapterId: string,
      payload: KnowledgePointCreateRequest,
    ) =>
      request<KnowledgePoint>(
        `/api/v1/chapters/${chapterId}/knowledge-points`,
        {
          method: "POST",
          body: JSON.stringify(payload),
        },
        userId,
      ),
    updateKnowledgePoint: (
      userId: string,
      pointId: string,
      payload: KnowledgePointUpdateRequest,
    ) =>
      request<KnowledgePoint>(
        `/api/v1/knowledge-points/${pointId}`,
        {
          method: "PATCH",
          body: JSON.stringify(payload),
        },
        userId,
      ),
    deleteKnowledgePoint: (userId: string, pointId: string) =>
      request<void>(`/api/v1/knowledge-points/${pointId}`, { method: "DELETE" }, userId),
    mergeKnowledgePoints: (
      userId: string,
      courseId: string,
      payload: KnowledgePointMergeRequest,
    ) =>
      request<KnowledgePoint>(
        `/api/v1/courses/${courseId}/knowledge-points/merge`,
        {
          method: "POST",
          body: JSON.stringify(payload),
        },
        userId,
      ),
    reviewFlag: reviewFlagRequest,
    decideReviewFlag: reviewFlagRequest,
    listConversations: (userId: string, courseId: string) =>
      request<Conversation[]>(`/api/v1/courses/${courseId}/conversations`, undefined, userId),
    createConversation: (userId: string, courseId: string, title?: string) =>
      request<Conversation>(
        `/api/v1/courses/${courseId}/conversations`,
        {
          method: "POST",
          body: JSON.stringify({ title: title || null }),
        },
        userId,
      ),
    listMessages: (userId: string, conversationId: string) =>
      request<Message[]>(`/api/v1/conversations/${conversationId}/messages`, undefined, userId),
    submitQuickCheck: (
      userId: string,
      questionId: string,
      payload: QuickCheckAttemptRequest,
    ) =>
      request<QuickCheckAttemptResponse>(
        `/api/v1/quick-checks/${questionId}/attempts`,
        {
          method: "POST",
          body: JSON.stringify(payload),
        },
        userId,
      ),
    requestHint: (userId: string, messageId: string, payload: HintRequest = {}) =>
      request<HintResponse>(
        `/api/v1/messages/${messageId}/hints`,
        {
          method: "POST",
          body: JSON.stringify(payload),
        },
        userId,
      ),
    listStudentConversations: (userId: string, courseId: string, studentId: string) =>
      request<Conversation[]>(
        `/api/v1/courses/${courseId}/students/${studentId}/conversations`,
        undefined,
        userId,
      ),
    listTeacherConversationMessages: (
      userId: string,
      courseId: string,
      conversationId: string,
    ) =>
      request<TeacherMessage[]>(
        `/api/v1/courses/${courseId}/conversations/${conversationId}/messages`,
        undefined,
        userId,
      ),
    streamConversationMessage: async function* (
      userId: string,
      conversationId: string,
      payload: ChatStreamRequest,
      options?: { signal?: AbortSignal },
    ) {
      const headers = new Headers({ "content-type": "application/json" });
      headers.set("X-User-Id", userId);
      const response = await fetchImpl(`${root}/api/v1/conversations/${conversationId}/messages/stream`, {
        method: "POST",
        headers,
        signal: options?.signal,
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw await readError(response);
      }
      if (!response.body) {
        throw new Error("Streaming response body is unavailable");
      }

      yield* parseSseEvents(response.body);
    },
    continueConversationMessage: async function* (
      userId: string,
      conversationId: string,
      messageId: string,
      payload: ChatContinueRequest = {},
      options?: { signal?: AbortSignal },
    ) {
      const headers = new Headers({ "content-type": "application/json" });
      headers.set("X-User-Id", userId);
      const response = await fetchImpl(
        `${root}/api/v1/conversations/${conversationId}/messages/${messageId}/continue`,
        {
          method: "POST",
          headers,
          signal: options?.signal,
          body: JSON.stringify(payload),
        },
      );

      if (!response.ok) {
        throw await readError(response);
      }
      if (!response.body) {
        throw new Error("Streaming response body is unavailable");
      }

      yield* parseSseEvents(response.body);
    },
  };
}
