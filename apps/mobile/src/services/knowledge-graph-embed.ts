import { fetch as expoFetch } from "expo/fetch";

import { getApiBaseUrlSync } from "@/services/api-network-config";
import { getAccessTokenSync } from "@/services/auth-session-storage";

const DEFAULT_TEACHER_WEB_PORT = "3000";

export const KNOWLEDGE_GRAPH_EMBED_TICKET_KEY =
  "echo.knowledge-graph.embed-ticket.v1";

interface KnowledgeGraphEmbedSessionResponse {
  ticket?: unknown;
  expires_in_seconds?: unknown;
}

export interface KnowledgeGraphEmbedSession {
  ticket: string;
  expiresInSeconds: number;
}

function normalizeTeacherWebBaseUrl(value: string): string {
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(value)
    ? value
    : `http://${value}`;
  const parsed = new URL(candidate);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("教师端地址仅支持 HTTP 或 HTTPS。");
  }
  parsed.pathname = "";
  parsed.search = "";
  parsed.hash = "";
  return parsed.origin;
}

export function resolveTeacherWebBaseUrl(): string {
  const configured = process.env.EXPO_PUBLIC_TEACHER_WEB_BASE_URL?.trim();
  if (configured) return normalizeTeacherWebBaseUrl(configured);

  const apiBaseUrl = new URL(getApiBaseUrlSync());
  apiBaseUrl.port =
    process.env.EXPO_PUBLIC_TEACHER_WEB_PORT?.trim() ||
    DEFAULT_TEACHER_WEB_PORT;
  apiBaseUrl.pathname = "";
  apiBaseUrl.search = "";
  apiBaseUrl.hash = "";
  return apiBaseUrl.origin;
}

export function buildKnowledgeGraphEmbedUrl(
  courseId: string,
  attempt = 0,
): string {
  const url = new URL("/knowledge", resolveTeacherWebBaseUrl());
  url.searchParams.set("courseId", courseId);
  url.searchParams.set("tab", "graph");
  url.searchParams.set("embed", "1");
  if (attempt > 0) url.searchParams.set("retry", String(attempt));
  return url.toString();
}

export function buildKnowledgeGraphEmbedBootstrapScript(
  courseId: string,
  ticket: string,
): string {
  const payload = JSON.stringify({
    version: 1,
    courseId,
    ticket,
    apiBaseUrl: getApiBaseUrlSync(),
  });
  return [
    "(function(){",
    "try{",
    `window.sessionStorage.setItem(${JSON.stringify(KNOWLEDGE_GRAPH_EMBED_TICKET_KEY)}, ${JSON.stringify(payload)});`,
    "}catch(e){}",
    "return true;",
    "})();",
  ].join("");
}

export async function createKnowledgeGraphEmbedSession(
  courseId: string,
  signal?: AbortSignal,
): Promise<KnowledgeGraphEmbedSession> {
  const accessToken = getAccessTokenSync();
  if (!accessToken) {
    throw new Error("登录状态已失效，请重新登录后再打开知识图谱。");
  }

  const response = await expoFetch(
    `${getApiBaseUrlSync()}/api/v1/courses/${courseId}/knowledge-graph/embed-session`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: "{}",
      signal,
    },
  );

  if (response.status === 404 || response.status === 503) {
    throw new Error("后端尚未提供知识图谱嵌入授权接口。");
  }
  if (!response.ok) {
    throw new Error(`知识图谱授权失败（${response.status}）。`);
  }

  const body = (await response.json()) as KnowledgeGraphEmbedSessionResponse;
  if (typeof body.ticket !== "string" || !body.ticket.trim()) {
    throw new Error("知识图谱授权票据无效。");
  }
  const expiresInSeconds =
    typeof body.expires_in_seconds === "number"
      ? body.expires_in_seconds
      : 300;
  return { ticket: body.ticket, expiresInSeconds };
}
