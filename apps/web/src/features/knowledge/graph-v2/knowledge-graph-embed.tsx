"use client";

import type { Chapter, KnowledgeGraph } from "@echo/shared-types";
import {
  Bookmark02Icon,
  File02Icon,
  Layers01Icon,
} from "@hugeicons/core-free-icons";
import {
  PanelLeftClose,
  PanelLeftOpen,
  Search,
} from "lucide-react";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";

import { ErrorState } from "@/components/common/error-state";
import { LoadingState } from "@/components/common/loading-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BranchedMenu } from "@/features/knowledge/browser/branched-menu";
import type { BranchedMenuSection } from "@/features/knowledge/browser/types";
import {
  filterCourseKnowledgeGraph,
  resolveCourseGraphFilter,
} from "@/features/knowledge/graph-v2/graph-document-filter";
import {
  graphPointCoverage,
  MAX_GRAPH_POINT_COMPLETION_REQUESTS,
  mergeKnowledgeGraphs,
} from "@/features/knowledge/graph-v2/graph-query-completion";
import { KnowledgeGraphView } from "@/features/knowledge/graph-v2/knowledge-graph-view";
import type { GraphPointRecord } from "@/features/knowledge/graph-v2/graph-types";
import { cn } from "@/lib/utils";

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

interface EmbedScopeResource {
  id: string;
  title: string;
  chapters: Chapter[];
  knowledgePointCount: number;
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

function buildScopeResources(
  graph: KnowledgeGraph | null,
  chapters: Chapter[],
): EmbedScopeResource[] {
  const labels = new Map<string, string>();
  const resourceOrder = new Map<string, number>();

  for (const node of graph?.nodes ?? []) {
    if (node.type !== "resource") continue;
    const documentId = node.metadata?.document_id;
    if (typeof documentId !== "string") continue;
    const resourceType = node.metadata?.resource_type;
    if (
      resourceType === "question_item" ||
      resourceType === "external_resource"
    ) {
      continue;
    }
    if (!resourceOrder.has(documentId)) {
      resourceOrder.set(documentId, resourceOrder.size);
    }
    labels.set(documentId, node.label);
  }

  const resources = new Map<string, Chapter[]>();
  for (const chapter of chapters) {
    const documentChapters = resources.get(chapter.document_id) ?? [];
    documentChapters.push(chapter);
    resources.set(chapter.document_id, documentChapters);
  }

  return [...resources.entries()]
    .map(([id, documentChapters]) => ({
      id,
      title: labels.get(id) ?? `课程资料 ${id.slice(0, 6)}`,
      chapters: documentChapters,
      knowledgePointCount: documentChapters.reduce(
        (total, chapter) => total + chapter.knowledge_points.length,
        0,
      ),
    }))
    .sort((left, right) => {
      const leftIndex = resourceOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER;
      const rightIndex =
        resourceOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER;
      return leftIndex - rightIndex || left.title.localeCompare(right.title);
    });
}

function EmbedGraphScopeWorkspace({
  chapters,
  courseId,
  graph,
  hasWebViewBridge,
  onAskAi,
  resources,
}: {
  chapters: Chapter[];
  courseId: string;
  graph: KnowledgeGraph;
  hasWebViewBridge: boolean;
  onAskAi: (point: GraphPointRecord) => void;
  resources: EmbedScopeResource[];
}) {
  const firstResourceId = resources[0]?.id ?? null;
  const [directoryOpen, setDirectoryOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const deferredQuery = useDeferredValue(searchQuery.trim().toLowerCase());
  const [openKeys, setOpenKeys] = useState<ReadonlySet<string>>(new Set());
  const [selectedResourceId, setSelectedResourceId] = useState<string | null>(
    firstResourceId,
  );
  const [selectedChapterId, setSelectedChapterId] = useState<string | null>(
    null,
  );

  const resolvedFilter = useMemo(
    () =>
      resolveCourseGraphFilter(
        chapters,
        {
          resourceId: selectedResourceId,
          chapterId: selectedChapterId,
        },
        new Set(resources.map((resource) => resource.id)),
      ),
    [chapters, resources, selectedChapterId, selectedResourceId],
  );
  const filtered = useMemo(
    () =>
      filterCourseKnowledgeGraph(graph, chapters, {
        resourceId: resolvedFilter.resourceId,
        chapterId: resolvedFilter.chapterId,
      }),
    [
      chapters,
      graph,
      resolvedFilter.chapterId,
      resolvedFilter.resourceId,
    ],
  );
  const menuSections = useMemo<BranchedMenuSection[]>(() => {
    const allSection: BranchedMenuSection = {
      value: "scope:all",
      label: "全部 PDF",
      meta: `全课程 · ${chapters.reduce(
        (total, chapter) => total + chapter.knowledge_points.length,
        0,
      )} 点`,
      icon: Layers01Icon,
      children: [],
      emptyLabel: null,
    };
    const resourceSections = resources
      .map((resource) => {
        const resourceMatches =
          !deferredQuery ||
          resource.title.toLowerCase().includes(deferredQuery);
        const visibleChapters = resource.chapters.filter(
          (chapter) =>
            resourceMatches ||
            chapter.title.toLowerCase().includes(deferredQuery) ||
            chapter.knowledge_points.some(
              (point) =>
                point.name.toLowerCase().includes(deferredQuery) ||
                (point.description ?? "")
                  .toLowerCase()
                  .includes(deferredQuery),
            ),
        );
        return {
          matches: resourceMatches || visibleChapters.length > 0,
          section: {
            value: `resource:${resource.id}`,
            label: resource.title,
            meta: `已解析 · ${visibleChapters.length} 章`,
            icon: File02Icon,
            emptyLabel: "当前 PDF 还没有章节",
            children: visibleChapters.map((chapter) => ({
              value: `chapter:${chapter.id}`,
              label: chapter.title,
              meta: `${chapter.knowledge_points.length} 点`,
              icon: Bookmark02Icon,
            })),
          } satisfies BranchedMenuSection,
        };
      })
      .filter((item) => item.matches)
      .map((item) => item.section);
    return [allSection, ...resourceSections];
  }, [chapters, deferredQuery, resources]);
  const filteredOpenKeys = deferredQuery
    ? new Set(menuSections.map((section) => section.value))
    : openKeys;
  const activeValue = resolvedFilter.chapterId
    ? `chapter:${resolvedFilter.chapterId}`
    : resolvedFilter.resourceId
      ? `resource:${resolvedFilter.resourceId}`
      : "scope:all";

  function selectScope(value: string) {
    if (value === "scope:all") {
      setSelectedResourceId(null);
      setSelectedChapterId(null);
      return;
    }
    const [kind, id] = value.split(":", 2);
    if (kind === "resource") {
      setSelectedResourceId(id);
      setSelectedChapterId(null);
      return;
    }
    if (kind === "chapter") {
      const chapter = chapters.find((item) => item.id === id);
      if (chapter) {
        setSelectedResourceId(chapter.document_id);
        setSelectedChapterId(chapter.id);
      }
    }
  }

  return (
    <div
      className={cn(
        "grid h-full min-h-0 overflow-hidden bg-[#06101f] transition-[grid-template-columns] duration-300",
        directoryOpen
          ? "grid-cols-[284px_minmax(0,1fr)]"
          : "grid-cols-[0px_minmax(0,1fr)]",
      )}
    >
      <aside
        aria-hidden={!directoryOpen}
        className={cn(
          "flex min-h-0 min-w-0 flex-col overflow-hidden border-[#21405f] bg-[#071423] transition-opacity duration-200",
          directoryOpen
            ? "border-r opacity-100"
            : "pointer-events-none border-transparent opacity-0",
        )}
        inert={!directoryOpen}
      >
        <div className="flex items-start justify-between gap-3 px-4 pb-3 pt-14">
          <div className="min-w-0">
            <p className="text-[11px] font-medium tracking-[0.12em] text-[#6482a3]">
              图谱范围
            </p>
            <h2 className="mt-1 truncate text-sm font-semibold text-[#eaf4ff]">
              课程知识图谱
            </h2>
            <p className="mt-1 text-[11px] text-[#7893b2]">
              {filtered.selectedPointIds.size} 个可见知识点 ·{" "}
              {filtered.graph.edges.length} 条真实边
            </p>
          </div>
          <button
            aria-label="收起图谱范围"
            className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.035] text-[#8aa4c4]"
            onClick={() => setDirectoryOpen(false)}
            title="收起图谱范围"
            type="button"
          >
            <PanelLeftClose className="size-4" />
          </button>
        </div>

        <div className="px-4 pb-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[#6d87a6]" />
            <Input
              aria-label="搜索图谱范围"
              className="h-9 border-white/10 bg-white/[0.045] pl-9 text-xs text-[#dce9fa] placeholder:text-[#627d9c]"
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="搜索 PDF、章节或知识点"
              value={searchQuery}
            />
          </div>
        </div>

        <div className="knowledge-scope-scrollbar min-h-0 flex-1 overflow-y-auto px-3 pb-4">
          <BranchedMenu
            accentColor="#7cc4ff"
            activeValue={activeValue}
            className="mx-auto"
            color="#dce9fa"
            defaultOpenValues={[]}
            emptyLabel="没有匹配的图谱范围"
            items={menuSections}
            lineColor="rgba(124, 196, 255, 0.28)"
            onOpenChange={setOpenKeys}
            onSelect={selectScope}
            openValues={filteredOpenKeys}
            rowHeight={38}
            width={260}
          />
        </div>
      </aside>

      <section className="relative min-h-0 min-w-0">
        {!directoryOpen ? (
          <Button
            aria-label="打开图谱范围"
            className="absolute left-3 top-3 z-40 border-white/15 bg-[#0d1d33]/85 text-[#dce9fa] backdrop-blur-xl"
            onClick={() => setDirectoryOpen(true)}
            size="icon-sm"
            title="打开图谱范围"
            type="button"
            variant="outline"
          >
            <PanelLeftOpen />
          </Button>
        ) : null}
        <KnowledgeGraphView
          chapters={filtered.chapters}
          courseId={courseId}
          courseName="课程知识图谱"
          embedMode
          graph={filtered.graph}
          isError={false}
          isLoading={false}
          key={`${courseId}:${resolvedFilter.resourceId ?? "all"}:${resolvedFilter.chapterId ?? "all"}`}
          onAskAi={hasWebViewBridge ? onAskAi : undefined}
          onRetry={() => undefined}
        />
      </section>
    </div>
  );
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
        const [nextGraph, nextChapters] = await Promise.all([
          requestJson<KnowledgeGraph>(
            `${apiBaseUrl}/api/v1/courses/${courseId}/knowledge-graph`,
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

        const coverage = graphPointCoverage(nextGraph, nextChapters, null);
        let completedGraph = nextGraph;
        if (nextGraph.truncated && coverage.missing > 0) {
          const supplementResults = await Promise.allSettled(
            coverage.missingPointIds
              .slice(0, MAX_GRAPH_POINT_COMPLETION_REQUESTS)
              .map((pointId) =>
                requestJson<KnowledgeGraph>(
                  `${apiBaseUrl}/api/v1/courses/${courseId}/knowledge-graph?pointId=${encodeURIComponent(pointId)}`,
                  { headers },
                  signal,
                  { authorizationContext: "resource" },
                ),
              ),
          );
          completedGraph = mergeKnowledgeGraphs(
            nextGraph,
            supplementResults.flatMap((result) =>
              result.status === "fulfilled" ? [result.value] : [],
            ),
          );
        }

        setGraph(completedGraph);
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

  const askAi = useCallback(
    (point: GraphPointRecord) => {
      emitAskAi(courseId, point);
    },
    [courseId],
  );
  const scopeResources = useMemo(
    () => buildScopeResources(graph, chapters),
    [chapters, graph],
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
      <EmbedGraphScopeWorkspace
        chapters={chapters}
        courseId={courseId}
        graph={graph!}
        hasWebViewBridge={hasWebViewBridge}
        onAskAi={askAi}
        resources={scopeResources}
      />
    </div>
  );
}
