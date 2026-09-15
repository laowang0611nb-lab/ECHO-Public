import type {
  Course,
  CourseCreateRequest,
  CourseDashboard,
  ChatStreamEvent,
  ChatStreamRequest,
  Conversation,
  DevelopmentLoginRequest,
  HealthResponse,
  Message,
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
    if (init?.body !== undefined && !headers.has("content-type")) {
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

    return response.json() as Promise<T>;
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
    getCourseDashboard: (userId: string, courseId: string) =>
      request<CourseDashboard>(`/api/v1/courses/${courseId}/dashboard`, undefined, userId),
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
