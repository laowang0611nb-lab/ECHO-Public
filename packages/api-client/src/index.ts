import type {
  Chapter,
  ChapterAnalytics,
  ChapterCreateRequest,
  ChapterUpdateRequest,
  ChatStreamEvent,
  ChatStreamRequest,
  ChunkSearchRequest,
  ChunkSearchResult,
  Conversation,
  Course,
  CourseCreateRequest,
  CourseDashboard,
  CourseDocument,
  CourseMember,
  DevelopmentLoginRequest,
  DocumentUploadSource,
  EmbeddingResult,
  HealthResponse,
  KnowledgeChunk,
  KnowledgePoint,
  KnowledgePointAnalytics,
  KnowledgePointCreateRequest,
  KnowledgePointMergeRequest,
  KnowledgePointUpdateRequest,
  LearningEventCreateRequest,
  LearningEventRecord,
  MasteryState,
  Message,
  NotResolvedRequest,
  ReviewDecisionRequest,
  ReviewFlag,
  ReviewSeverity,
  ReviewStatus,
  StudentLearningDetail,
  TeachingPolicy,
  TeachingPolicyUpdateRequest,
  User,
} from "@echo/shared-types";

export interface ApiClientOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
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

  const message = typeof detail === "string" ? detail : `ECHO API request failed: ${response.status}`;
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

export function createApiClient({ baseUrl, fetchImpl = fetch }: ApiClientOptions) {
  const root = baseUrl.replace(/\/$/, "");

  async function request<T>(path: string, init?: RequestInit, userId?: string): Promise<T> {
    const headers = new Headers(init?.headers);
    const isFormData = typeof FormData !== "undefined" && init?.body instanceof FormData;
    if (init?.body !== undefined && !isFormData && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
    if (userId) {
      headers.set("X-User-Id", userId);
    }

    const response = await fetchImpl(`${root}${path}`, {
      ...init,
      headers,
    });

    if (!response.ok) {
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
    login: (payload: DevelopmentLoginRequest) =>
      request<User>("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    me: (userId: string) => request<User>("/api/v1/auth/me", undefined, userId),
    listCourses: (userId: string) => request<Course[]>("/api/v1/courses", undefined, userId),
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
    ) =>
      request<CourseDocument>(
        `/api/v1/courses/${courseId}/documents`,
        {
          method: "POST",
          body: createDocumentFormData(file, fileName),
        },
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
    getCourseDashboard: (userId: string, courseId: string) =>
      request<CourseDashboard>(`/api/v1/courses/${courseId}/dashboard`, undefined, userId),
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
      options?: { status?: ReviewStatus; severity?: ReviewSeverity; limit?: number },
    ) => {
      const params = new URLSearchParams();
      if (options?.status) params.set("status", options.status);
      if (options?.severity) params.set("severity", options.severity);
      if (options?.limit) params.set("limit", String(options.limit));
      const query = params.toString();
      return request<ReviewFlag[]>(
        `/api/v1/courses/${courseId}/review-flags${query ? `?${query}` : ""}`,
        undefined,
        userId,
      );
    },
    getReviewFlag: (userId: string, courseId: string, flagId: string) =>
      request<ReviewFlag>(
        `/api/v1/courses/${courseId}/review-flags/${flagId}`,
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
    listChapters: (userId: string, courseId: string) =>
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
    streamConversationMessage: async function* (
      userId: string,
      conversationId: string,
      payload: ChatStreamRequest,
    ) {
      const headers = new Headers({ "content-type": "application/json" });
      headers.set("X-User-Id", userId);
      const response = await fetchImpl(`${root}/api/v1/conversations/${conversationId}/messages/stream`, {
        method: "POST",
        headers,
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
  };
}
