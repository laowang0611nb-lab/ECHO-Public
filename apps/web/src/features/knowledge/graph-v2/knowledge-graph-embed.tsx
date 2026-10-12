"use client";

import type { Chapter, KnowledgeGraph } from "@echo/shared-types";
import { useCallback, useEffect, useState } from "react";

import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { KnowledgeGraphView } from "@/features/knowledge/graph-v2/knowledge-graph-view";

const EMBED_TICKET_KEY = "echo.knowledge-graph.embed-ticket.v1";

interface StoredEmbedTicket {
  version: 1;
  courseId: string;
  ticket: string;
  apiBaseUrl: string;
}

interface EmbedExchangeResponse {
  access_token: string;
  course_id: string;
  expires_in_seconds: number;
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

async function requestJson<T>(
  url: string,
  init: RequestInit,
  signal: AbortSignal,
): Promise<T> {
  const response = await fetch(url, { ...init, signal });
  if (response.status === 404 || response.status === 503) {
    throw new Error("后端尚未提供知识图谱嵌入授权接口。");
  }
  if (!response.ok) {
    throw new Error(`知识图谱请求失败（HTTP ${response.status}）。`);
  }
  return (await response.json()) as T;
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

  const load = useCallback(
    async (signal: AbortSignal) => {
      setLoading(true);
      setError(null);

      const raw = window.sessionStorage.getItem(EMBED_TICKET_KEY);
      if (!raw) {
        throw new Error("缺少图谱授权票据，请返回学生端重新打开。");
      }

      let stored: StoredEmbedTicket;
      try {
        const parsed: unknown = JSON.parse(raw);
        if (!isStoredEmbedTicket(parsed)) {
          throw new Error("invalid ticket");
        }
        stored = parsed;
      } catch {
        throw new Error("图谱授权票据已失效，请返回学生端重试。");
      }

      if (stored.courseId !== courseId) {
        throw new Error("图谱课程与授权课程不一致，请返回学生端重新打开。");
      }

      const apiBaseUrl = normalizeApiBaseUrl(stored.apiBaseUrl);
      const exchanged = await requestJson<EmbedExchangeResponse>(
        `${apiBaseUrl}/api/v1/knowledge-graph/embed-sessions/exchange`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ticket: stored.ticket, courseId }),
        },
        signal,
      );

      if (exchanged.course_id !== courseId || !exchanged.access_token) {
        throw new Error("图谱授权会话无效，请返回学生端重试。");
      }

      const headers = {
        Authorization: `Bearer ${exchanged.access_token}`,
      };
      const [nextGraph, nextChapters] = await Promise.all([
        requestJson<KnowledgeGraph>(
          `${apiBaseUrl}/api/v1/courses/${courseId}/knowledge-graph`,
          { headers },
          signal,
        ),
        requestJson<Chapter[]>(
          `${apiBaseUrl}/api/v1/courses/${courseId}/chapters`,
          { headers },
          signal,
        ),
      ]);

      window.sessionStorage.removeItem(EMBED_TICKET_KEY);
      setGraph(nextGraph);
      setChapters(nextChapters);
    },
    [courseId],
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
        graph={graph ?? undefined}
        isError={false}
        isLoading={false}
        key={courseId}
        onRetry={() => setAttempt((current) => current + 1)}
      />
    </div>
  );
}
