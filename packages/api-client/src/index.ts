import type {
  Course,
  CourseCreateRequest,
  CourseDashboard,
  DevelopmentLoginRequest,
  HealthResponse,
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
  };
}
