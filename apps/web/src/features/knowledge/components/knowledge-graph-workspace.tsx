"use client";

import type { Chapter, KnowledgeGraph } from "@echo/shared-types";
import {
  Bookmark02Icon,
  File02Icon,
  Layers01Icon,
} from "@hugeicons/core-free-icons";
import {
  AlertTriangle,
  ChevronRight,
  Hash,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
} from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { KnowledgeResourceView } from "@/features/knowledge/types";
import { KnowledgeGraphView } from "@/features/knowledge/graph-v2/knowledge-graph-view";
import {
  filterCourseKnowledgeGraph,
  pointMatchesCourseGraphFilter,
  resolveCourseGraphFilter,
} from "@/features/knowledge/graph-v2/graph-document-filter";
import { cn } from "@/lib/utils";

import { BranchedMenu } from "../browser/branched-menu";
import type { BranchedMenuSection } from "../browser/types";

function resourceTitle(resource: KnowledgeResourceView) {
  return resource.document.display_name?.trim() || resource.document.original_name;
}

function graphScopeUrl({
  courseId,
  resourceId,
  chapterId,
  pointId,
}: {
  courseId: string;
  resourceId: string | null;
  chapterId: string | null;
  pointId: string | null;
}) {
  const params = new URLSearchParams();
  params.set("courseId", courseId);
  params.set("tab", "graph");
  if (resourceId) params.set("resourceId", resourceId);
  if (chapterId) params.set("chapterId", chapterId);
  if (pointId) params.set("pointId", pointId);
  return `/knowledge?${params.toString()}`;
}

export function KnowledgeGraphWorkspace({
  courseId,
  courseName,
  resources,
  chapters,
  graph,
  isLoading,
  isError,
  onRetry,
}: {
  courseId: string;
  courseName: string;
  resources: KnowledgeResourceView[];
  chapters: Chapter[];
  graph: KnowledgeGraph | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [directoryOpen, setDirectoryOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const deferredQuery = useDeferredValue(searchQuery.trim().toLowerCase());
  const [openKeys, setOpenKeys] = useState<ReadonlySet<string> | null>(null);

  const rawResourceId = searchParams.get("resourceId");
  const rawChapterId = searchParams.get("chapterId");
  const rawPointId = searchParams.get("pointId");
  const availableResourceIds = useMemo(
    () =>
      new Set(resources.map((resource) => resource.document.id)),
    [resources],
  );
  const resolvedFilter = useMemo(
    () =>
      resolveCourseGraphFilter(chapters, {
        resourceId: rawResourceId,
        chapterId: rawChapterId,
      }, availableResourceIds),
    [availableResourceIds, chapters, rawChapterId, rawResourceId],
  );
  const validPointId = pointMatchesCourseGraphFilter(
    rawPointId,
    chapters,
    resolvedFilter,
  )
    ? rawPointId
    : null;
  const shouldNormalize =
    (rawResourceId ?? null) !== resolvedFilter.resourceId ||
    (rawChapterId ?? null) !== resolvedFilter.chapterId ||
    (rawPointId ?? null) !== validPointId;

  const filtered = useMemo(
    () =>
      graph
        ? filterCourseKnowledgeGraph(graph, chapters, {
            resourceId: resolvedFilter.resourceId,
            chapterId: resolvedFilter.chapterId,
          })
        : null,
    [chapters, graph, resolvedFilter.chapterId, resolvedFilter.resourceId],
  );

  const defaultOpenKeys = useMemo(
    () =>
      new Set(
        resources.map((resource) => `resource:${resource.document.id}`),
      ),
    [resources],
  );
  const effectiveOpenKeys = openKeys ?? defaultOpenKeys;
  const pointSearchMatches = useMemo(() => {
    if (!deferredQuery) {
      return [];
    }
    return chapters
      .flatMap((chapter) =>
        chapter.knowledge_points.map((point) => ({ chapter, point })),
      )
      .filter(
        ({ point }) =>
          point.name.toLowerCase().includes(deferredQuery) ||
          (point.description ?? "").toLowerCase().includes(deferredQuery),
      )
      .slice(0, 6);
  }, [chapters, deferredQuery]);

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
      emptyLabel: "全课程范围不需要展开",
    };
    const resourceSections = resources
      .map((resource) => {
        const resourceMatches =
          !deferredQuery ||
          resourceTitle(resource).toLowerCase().includes(deferredQuery) ||
          resource.kind.toLowerCase().includes(deferredQuery);
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
            value: `resource:${resource.document.id}`,
            label: resourceTitle(resource),
            meta: `${resource.statusLabel} · ${visibleChapters.length} 章`,
            icon: File02Icon,
            emptyLabel:
              resource.document.status === "parsing"
                ? "资源仍在解析，章节稍后可用"
                : "当前 PDF 还没有章节",
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
    : effectiveOpenKeys.has("scope:all")
      ? effectiveOpenKeys
      : new Set(["scope:all", ...effectiveOpenKeys]);
  const activeValue = resolvedFilter.chapterId
    ? `chapter:${resolvedFilter.chapterId}`
    : resolvedFilter.resourceId
      ? `resource:${resolvedFilter.resourceId}`
      : "scope:all";

  useEffect(() => {
    if (!chapters.length || !shouldNormalize) {
      return;
    }
    const nextUrl = graphScopeUrl({
      courseId,
      resourceId: resolvedFilter.resourceId,
      chapterId: resolvedFilter.chapterId,
      pointId: validPointId,
    });
    if (`/knowledge?${searchParams.toString()}` !== nextUrl) {
      router.replace(nextUrl, { scroll: false });
    }
  }, [
    chapters.length,
    courseId,
    resolvedFilter.chapterId,
    resolvedFilter.resourceId,
    router,
    searchParams,
    shouldNormalize,
    validPointId,
  ]);

  function navigateScope(
    resourceId: string | null,
    chapterId: string | null,
    pointId: string | null,
  ) {
    const nextUrl = graphScopeUrl({
      courseId,
      resourceId,
      chapterId,
      pointId,
    });
    if (`/knowledge?${searchParams.toString()}` !== nextUrl) {
      router.push(nextUrl, { scroll: false });
    }
  }

  function selectMenuValue(value: string) {
    if (value === "scope:all") {
      if (!resolvedFilter.resourceId && !resolvedFilter.chapterId) {
        return;
      }
      navigateScope(null, null, validPointId);
      return;
    }
    const [kind, id] = value.split(":", 2);
    if (kind === "resource") {
      const nextPoint = pointMatchesCourseGraphFilter(rawPointId, chapters, {
        resourceId: id,
        chapterId: null,
      })
        ? rawPointId
        : null;
      if (resolvedFilter.resourceId === id && !resolvedFilter.chapterId) {
        return;
      }
      navigateScope(id, null, nextPoint);
      return;
    }
    if (kind === "chapter") {
      const chapter = chapters.find((item) => item.id === id);
      if (!chapter) {
        return;
      }
      const nextPoint = pointMatchesCourseGraphFilter(rawPointId, chapters, {
        resourceId: chapter.document_id,
        chapterId: chapter.id,
      })
        ? rawPointId
        : null;
      if (resolvedFilter.chapterId === id) {
        return;
      }
      navigateScope(chapter.document_id, chapter.id, nextPoint);
    }
  }

  return (
    <div
      className={cn(
        "grid h-full min-h-0 overflow-hidden rounded-xl border border-[#213c62] bg-[#081527]",
        directoryOpen
          ? "grid-rows-[auto_minmax(0,1fr)] lg:grid-cols-[284px_minmax(0,1fr)] lg:grid-rows-1"
          : "grid-rows-1",
      )}
    >
      {directoryOpen ? (
        <aside className="flex min-h-0 max-h-[42dvh] flex-col border-b border-[#21405f] bg-[#071423] lg:max-h-none lg:border-b-0 lg:border-r">
          <div className="flex items-start justify-between gap-3 px-4 pb-3 pt-4">
            <div className="min-w-0">
              <p className="text-[11px] font-medium tracking-[0.12em] text-[#6482a3]">
                图谱范围
              </p>
              <h2
                className="mt-1 truncate text-sm font-semibold text-[#eaf4ff]"
                title={courseName}
              >
                {courseName}
              </h2>
              <p className="mt-1 text-[11px] text-[#7893b2]">
                {filtered?.selectedPointIds.size ?? 0} 个可见知识点 ·{" "}
                {filtered?.graph.edges.length ?? 0} 条真实边
              </p>
            </div>
            <button
              aria-label="收起图谱范围"
              className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.035] text-[#8aa4c4] transition-colors hover:bg-white/[0.07] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#65b6ff]"
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
                className="h-9 border-white/10 bg-white/[0.045] pl-9 text-xs text-[#dce9fa] placeholder:text-[#627d9c] focus-visible:border-[#65b6ff]/45 focus-visible:ring-[#65b6ff]/20"
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="搜索 PDF、章节或知识点"
                value={searchQuery}
              />
              {deferredQuery && pointSearchMatches.length ? (
                <div className="absolute left-0 right-0 top-10 z-50 rounded-lg border border-white/12 bg-[#0a192b]/98 p-1.5 shadow-[0_18px_45px_rgba(2,8,23,0.46)] backdrop-blur-xl">
                  {pointSearchMatches.map(({ chapter, point }) => (
                    <button
                      className="flex w-full items-start gap-2 rounded-md px-2.5 py-2 text-left text-[#c7dcf4] transition-colors hover:bg-white/7 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#65b6ff]"
                      key={point.id}
                      onClick={() => {
                        setSearchQuery("");
                        navigateScope(
                          chapter.document_id,
                          chapter.id,
                          point.id,
                        );
                      }}
                      type="button"
                    >
                      <Hash className="mt-0.5 size-3.5 shrink-0 text-[#72b6ff]" />
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-medium">
                          {point.name}
                        </span>
                        <span className="mt-0.5 block truncate text-[10px] text-[#7893b2]">
                          {chapter.title}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
          {resolvedFilter.invalidResourceId ||
          resolvedFilter.invalidChapterId ? (
            <div className="mx-4 mb-3 flex items-start gap-2 rounded-lg border border-amber-300/20 bg-amber-400/10 px-3 py-2 text-[11px] leading-5 text-amber-100">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              链接中的图谱范围已失效，已安全回到全部课程图谱。
            </div>
          ) : null}
          <div className="knowledge-scope-scrollbar min-h-0 flex-1 overflow-y-auto px-3 pb-4">
            <BranchedMenu
              accentColor="#7cc4ff"
              activeValue={activeValue}
              className="mx-auto"
              color="#dce9fa"
              defaultOpenValues={[
                "scope:all",
                ...resources.map(
                  (resource) => `resource:${resource.document.id}`,
                ),
              ]}
              emptyLabel="没有匹配的图谱范围"
              items={menuSections}
              lineColor="rgba(124, 196, 255, 0.28)"
              onOpenChange={(next) => setOpenKeys(next)}
              onSelect={(value) => selectMenuValue(value)}
              openValues={filteredOpenKeys}
              rowHeight={38}
              width={260}
            />
          </div>
        </aside>
      ) : null}

      <section className="relative min-h-[420px] min-w-0">
        {!directoryOpen ? (
          <Button
            aria-label="打开图谱范围"
            className="absolute left-3 top-3 z-40 border-white/15 bg-[#0d1d33]/80 text-[#dce9fa] backdrop-blur-xl hover:bg-[#173152] hover:text-white"
            onClick={() => setDirectoryOpen(true)}
            size="icon-sm"
            title="打开图谱范围"
            type="button"
            variant="outline"
          >
            <PanelLeftOpen />
          </Button>
        ) : null}
        {!directoryOpen ? (
          <div className="absolute left-14 top-3 z-30 hidden items-center gap-1 rounded-full border border-white/10 bg-[#0d1d33]/62 px-2.5 py-1 text-[10px] text-[#9fb5d0] backdrop-blur-xl md:flex">
            <span>{activeValue === "scope:all" ? "全部 PDF" : "当前范围"}</span>
            <ChevronRight className="size-3" />
            <span className="max-w-40 truncate">
              {resolvedFilter.chapterId
                ? chapters.find(
                    (chapter) => chapter.id === resolvedFilter.chapterId,
                  )?.title
                : resolvedFilter.resourceId
                  ? resources.find(
                      (resource) =>
                        resource.document.id === resolvedFilter.resourceId,
                    )?.document.original_name
                  : courseName}
            </span>
          </div>
        ) : null}
        <KnowledgeGraphView
          chapters={filtered?.chapters ?? []}
          courseId={courseId}
          courseName={courseName}
          graph={filtered?.graph}
          isError={isError}
          isLoading={isLoading}
          onRetry={onRetry}
        />
      </section>
    </div>
  );
}
