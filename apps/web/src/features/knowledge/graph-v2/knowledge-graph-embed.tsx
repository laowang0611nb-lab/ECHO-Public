"use client";

import type { Chapter, KnowledgeGraph } from "@echo/shared-types";
import { useCallback, useEffect, useState } from "react";

import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { KnowledgeGraphView } from "@/features/knowledge/graph-v2/knowledge-graph-view";
import type { GraphPointRecord } from "@/features/knowledge/graph-v2/graph-types";

const EMBED_TICKET_KEY = "echo.knowledge-graph.embed-ticket.v1";
const EMBED_TOKEN_KEY = "echo.knowledge-graph.embed-token.v1";
const EMBED_TOKEN_EXPIRY_SKEW_MS = 5_000;

interface StoredEmbedTicket {
  version: 1;
  courseId: string;
  ticket: string;
  apiBaseUrl: string;
}

interface StoredEmbedToken {
  version: 1;
  courseId: string;
  apiBaseUrl: string;
  accessToken: string;
  expiresAt: number;
}

interface EmbedExchangeResponse {
  access_token: string;
  course_id: string;
  expires_in_seconds: number;
}

interface WebViewBridge {
  postMessage: (message: string) => void;
}

declare global {
  interface Window {
    ReactNativeWebView?: WebViewBridge;
  }
}

function isStoredEmbedTicket(value: unknown): value is StoredEmbedTicket {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<StoredEmbedTicket>;
  return (
    candidate.version === 1 &&
    typeof candidate.courseId === "string" &&
    typeof candidate.ticket === "string" &&
    typeof candidate.apiBaseUrl === "string"
  );
}

function isStoredEmbedToken(value: unknown): value is StoredEmbedToken {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<StoredEmbedToken>;
  return (
    candidate.version === 1 &&
    typeof candidate.courseId === "string" &&
    typeof candidate.apiBaseUrl === "string" &&
    typeof candidate.accessToken === "string" &&
    typeof candidate.expiresAt === "number"
  );
}

function normalizeApiBaseUrl(value: string): string {
  const parsed = new URL(
    /^[a-z][a-z0-9+.-]*:\/\//i.test(value) ? value : `http://${value}`,
  );
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("图谱 API 地址仅支持 HTTP 或 HTTPS。");
  }
  parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  parsed.search = "";
  parsed.hash = "";
  return parsed.toString().replace(/\/$/, "");
}

function readStoredTicket(): StoredEmbedTicket | null {
  const raw = window.sessionStorage.getItem(EMBED_TICKET_KEY);
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    return isStoredEmbedTicket(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function readStoredToken(): StoredEmbedToken | null {
  const raw = window.sessionStorage.getItem(EMBED_TOKEN_KEY);
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isStoredEmbedToken(parsed)) {
      window.sessionStorage.removeItem(EMBED_TOKEN_KEY);
      return null;
    }
    if (parsed.expiresAt <= Date.now() + EMBED_TOKEN_EXPIRY_SKEW_MS) {
      window.sessionStorage.removeItem(EMBED_TOKEN_KEY);
      return null;
    }
    return parsed;
  } catch {
    window.sessionStorage.removeItem(EMBED_TOKEN_KEY);
    return null;
  }
}

function clearEmbedAuthorization(): void {
  window.sessionStorage.removeItem(EMBED_TICKET_KEY);
  window.sessionStorage.removeItem(EMBED_TOKEN_KEY);
}

function authorizationExpiredMessage(): string {
  return "知识图谱授权已失效，请返回学生端重新打开。";
}

async function requestJson<T>(
  url: string,
  init: RequestInit,
  signal: AbortSignal,
  options: { authorizationContext?: "exchange" | "resource" } = {},
): Promise<T> {
  const response = await fetch(url, { ...init, signal });

  if (
    options.authorizationContext === "exchange" &&
    (response.status === 401 || response.status === 403 || response.status === 404 || response.status === 410)
  ) {
    throw new Error(authorizationExpiredMessage());
  }
  if (
    options.authorizationContext === "resource" &&
    (response.status === 401 || response.status === 403 || response.status === 410)
  ) {
    throw new Error(authorizationExpiredMessage());
  }
  if (response.status === 404) {
    throw new Error("知识图谱接口或资源不存在，请返回学生端重新打开。");
  }
  if (!response.ok) {
    throw new Error(`知识图谱请求失败（HTTP ${response.status}）。`);
  }

  return (await response.json()) as T;
}

function emitAskAi(courseId: string, point: GraphPointRecord): void {
  const bridge = window.ReactNativeWebView;
  if (!bridge || typeof bridge.postMessage !== "function") return;

  const payload = {
    type: "echo:ask-ai" as const,
    version: 1 as const,
    courseId,
    knowledgePointId: point.id,
    knowledgePointName: point.label,
  };
  bridge.postMessage(JSON.stringify(payload));
}

export function KnowledgeGraphEmbedContent({
  courseId,
}: {
  courseId: string;
}) {
  const [attempt, setAttempt] = useState(0);
  const [graph, setGraph] = useState<KnowledgeGraph | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [chapterId, setChapterId] = useState<string | null>(null);
  const graphScope = chapterId
    ? "chapter"
    : documentId
      ? "document"
      : "overview";

  const [hasWebViewBridge, setHasWebViewBridge] = useState(false);

  useEffect(() => {
    const updateBridgeAvailability = () => {
      setHasWebViewBridge(
        typeof window.ReactNativeWebView?.postMessage === "function",
      );
    };

    updateBridgeAvailability();
    const timer = window.setInterval(updateBridgeAvailability, 250);
    window.addEventListener("focus", updateBridgeAvailability);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", updateBridgeAvailability);
    };
  }, []);

  const load = useCallback(
    async (signal: AbortSignal) => {
      setLoading(true);
      setError(null);

      const storedToken = readStoredToken();
      let apiBaseUrl: string;
      let accessToken: string;

      if (storedToken) {
        if (storedToken.courseId !== courseId) {
          clearEmbedAuthorization();
          throw new Error(authorizationExpiredMessage());
        }
        apiBaseUrl = normalizeApiBaseUrl(storedToken.apiBaseUrl);
        accessToken = storedToken.accessToken;
      } else {
        const storedTicket = readStoredTicket();
        if (!storedTicket) {
          throw new Error(authorizationExpiredMessage());
        }
        if (storedTicket.courseId !== courseId) {
          clearEmbedAuthorization();
          throw new Error("图谱课程与授权课程不一致，请返回学生端重新打开。");
        }

        apiBaseUrl = normalizeApiBaseUrl(storedTicket.apiBaseUrl);
        const exchanged = await requestJson<EmbedExchangeResponse>(
          `${apiBaseUrl}/api/v1/knowledge-graph/embed-sessions/exchange`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ticket: storedTicket.ticket, courseId }),
          },
          signal,
          { authorizationContext: "exchange" },
        );

        if (
          exchanged.course_id !== courseId ||
          typeof exchanged.access_token !== "string" ||
          !exchanged.access_token
        ) {
          clearEmbedAuthorization();
          throw new Error("图谱授权会话无效，请返回学生端重新打开。");
        }

        const expiresInSeconds =
          typeof exchanged.expires_in_seconds === "number" &&
          Number.isFinite(exchanged.expires_in_seconds)
            ? exchanged.expires_in_seconds
            : 300;
        const nextToken: StoredEmbedToken = {
          version: 1,
          courseId,
          apiBaseUrl,
          accessToken: exchanged.access_token,
          expiresAt: Date.now() + Math.max(0, expiresInSeconds) * 1000,
        };

        window.sessionStorage.setItem(EMBED_TOKEN_KEY, JSON.stringify(nextToken));
        window.sessionStorage.removeItem(EMBED_TICKET_KEY);
        accessToken = nextToken.accessToken;
      }

      const headers = {
        Authorization: `Bearer ${accessToken}`,
      };

      try {
        const graphParams = new URLSearchParams({
          scope: graphScope,
          maxNodes: graphScope === "chapter" ? "80" : "40",
        });
        if (documentId) graphParams.set("documentId", documentId);
        if (chapterId) graphParams.set("chapterId", chapterId);
        const [nextGraph, nextChapters] = await Promise.all([
          requestJson<KnowledgeGraph>(
            `${apiBaseUrl}/api/v1/courses/${courseId}/knowledge-graph?${graphParams.toString()}`,
            { headers },
            signal,
            { authorizationContext: "resource" },
          ),
          requestJson<Chapter[]>(
            `${apiBaseUrl}/api/v1/courses/${courseId}/chapters`,
            { headers },
            signal,
            { authorizationContext: "resource" },
          ),
        ]);

        setGraph(nextGraph);
        setChapters(nextChapters);
      } catch (loadError) {
        if (
          loadError instanceof Error &&
          loadError.message === authorizationExpiredMessage()
        ) {
          clearEmbedAuthorization();
        }
        throw loadError;
      }
    },
    [chapterId, courseId, documentId, graphScope],
  );

  useEffect(() => {
    const controller = new AbortController();
    const run = async () => {
      await Promise.resolve();
      try {
        await load(controller.signal);
      } catch (loadError) {
        if (!controller.signal.aborted) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "知识图谱暂时无法加载。",
          );
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void run();
    return () => controller.abort();
  }, [attempt, load]);

  const askAi = useCallback(
    (point: GraphPointRecord) => {
      emitAskAi(courseId, point);
    },
    [courseId],
  );

  if (loading) {
    return <LoadingState label="正在连接真实课程知识图谱..." />;
  }

  if (error) {
    return (
      <ErrorState
        description={error}
        onRetry={() => setAttempt((current) => current + 1)}
        title="知识图谱加载失败"
      />
    );
  }

  return (
    <div className="h-[100dvh] w-screen overflow-hidden bg-[#06101f]">
      <KnowledgeGraphView
        chapters={chapters}
        courseId={courseId}
        courseName="课程知识图谱"
        embedMode
        graph={graph ?? undefined}
        isError={false}
        isLoading={false}
        key={courseId}
        onBack={() => {
          if (chapterId) {
            setChapterId(null);
          } else if (documentId) {
            setDocumentId(null);
          }
        }}
        onOpenChapter={setChapterId}
        onOpenDocument={(nextDocumentId) => {
          setDocumentId(nextDocumentId);
          setChapterId(null);
        }}
        onAskAi={hasWebViewBridge ? askAi : undefined}
        onRetry={() => setAttempt((current) => current + 1)}
      />
    </div>
  );
}
