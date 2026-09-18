"use client";

import { ApiClientError } from "@echo/api-client";
import type { Chapter, CourseDocument, KnowledgePoint } from "@echo/shared-types";
import { useEffect, useState } from "react";

import { apiClient } from "@/lib/api";

const MAX_MERGE_SOURCES = 20;
const MAX_MERGE_SELECTION = MAX_MERGE_SOURCES + 1;

function editorError(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.status === 409) {
      return "同一章节内不能出现同名知识点。";
    }
    return error.message;
  }
  return error instanceof Error ? error.message : "保存失败，请稍后重试。";
}

function SmallButton({
  children,
  disabled,
  onClick,
  title,
}: {
  children: string;
  disabled?: boolean;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      aria-label={title}
      className="min-h-8 min-w-8 border border-[#cfd5df] bg-white px-2 text-sm text-[#344054] hover:bg-[#f8fafc] disabled:opacity-40"
      disabled={disabled}
      onClick={onClick}
      title={title}
      type="button"
    >
      {children}
    </button>
  );
}

export function KnowledgeEditor({
  courseId,
  userId,
}: {
  courseId: string;
  userId: string;
}) {
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [documents, setDocuments] = useState<CourseDocument[]>([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [newChapterTitle, setNewChapterTitle] = useState("");
  const [chapterDrafts, setChapterDrafts] = useState<Record<string, string>>({});
  const [pointDrafts, setPointDrafts] = useState<Record<string, string>>({});
  const [newPoints, setNewPoints] = useState<Record<string, string>>({});
  const [selectedPointIds, setSelectedPointIds] = useState<string[]>([]);
  const [mergeTargetId, setMergeTargetId] = useState<string | null>(null);
  const [mergeName, setMergeName] = useState("");
  const [mergeDescription, setMergeDescription] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const [items, documentItems] = await Promise.all([
          apiClient.listChapters(userId, courseId),
          apiClient.listCourseDocuments(userId, courseId),
        ]);
        if (cancelled) {
          return;
        }
        const documentIds = new Set(documentItems.map((document) => document.id));
        const chapterOnlyDocumentIds = Array.from(
          new Set(
            items
              .map((chapter) => chapter.document_id)
              .filter((documentId) => !documentIds.has(documentId)),
          ),
        );
        const chapterOnlyDocuments: CourseDocument[] = chapterOnlyDocumentIds.map((id) => ({
          id,
          course_id: courseId,
          uploaded_by: "",
          original_name: "历史教材",
          content_type: "application/pdf",
          size_bytes: 0,
          status: "ready",
          resource_type: "textbook",
          page_count: null,
          trashed_at: null,
          created_at: "",
          updated_at: "",
        }));
        setDocuments([...documentItems, ...chapterOnlyDocuments]);
        const availableDocumentIds = new Set([
          ...documentItems.map((document) => document.id),
          ...chapterOnlyDocumentIds,
        ]);
        setSelectedDocumentId((current) =>
          current && availableDocumentIds.has(current)
            ? current
            : (documentItems[0]?.id ?? chapterOnlyDocumentIds[0] ?? null),
        );
        setChapters(items);
        const pointIds = new Set(
          items.flatMap((chapter) =>
            chapter.knowledge_points.map((point) => point.id),
          ),
        );
        setSelectedPointIds((current) => current.filter((pointId) => pointIds.has(pointId)));
        setMergeTargetId((current) => (current && pointIds.has(current) ? current : null));
        setChapterDrafts(Object.fromEntries(items.map((chapter) => [chapter.id, chapter.title])));
        setPointDrafts(
          Object.fromEntries(
            items.flatMap((chapter) =>
              chapter.knowledge_points.map((point) => [point.id, point.name]),
            ),
          ),
        );
      } catch (requestError) {
        if (!cancelled) {
          setError(editorError(requestError));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [courseId, reloadKey, userId]);

  function refresh() {
    setReloadKey((current) => current + 1);
  }

  async function runAction(key: string, action: () => Promise<unknown>, message: string) {
    setSavingKey(key);
    setError(null);
    setNotice(null);
    try {
      await action();
      setNotice(message);
      refresh();
      return true;
    } catch (requestError) {
      setError(editorError(requestError));
      return false;
    } finally {
      setSavingKey(null);
    }
  }

  const activeDocumentId =
    selectedDocumentId && documents.some((document) => document.id === selectedDocumentId)
      ? selectedDocumentId
      : (documents[0]?.id ?? null);
  const documentChapters = activeDocumentId
    ? chapters.filter((chapter) => chapter.document_id === activeDocumentId)
    : [];
  const allPoints = chapters.flatMap((chapter) => chapter.knowledge_points);
  const selectedPoints = allPoints.filter((point) => selectedPointIds.includes(point.id));

  function handleAddChapter() {
    if (!activeDocumentId || !newChapterTitle.trim()) {
      return;
    }

    void runAction(
      "new-chapter",
      () =>
        apiClient.createChapter(userId, activeDocumentId, {
          title: newChapterTitle.trim(),
          order_index: documentChapters.length,
        }),
      "章节已创建。",
    ).then((saved) => {
      if (saved) {
        setNewChapterTitle("");
      }
    });
  }

  function handleRenameChapter(chapter: Chapter) {
    const title = chapterDrafts[chapter.id]?.trim();
    if (!title || title === chapter.title) {
      return;
    }
    void runAction(
      `chapter-${chapter.id}`,
      () => apiClient.updateChapter(userId, chapter.id, { title }),
      "章节已更新。",
    );
  }

  function handleDeleteChapter(chapter: Chapter) {
    if (!window.confirm(`删除章节“${chapter.title}”及其全部知识点？`)) {
      return;
    }
    void runAction(
      `chapter-${chapter.id}`,
      () => apiClient.deleteChapter(userId, chapter.id),
      "章节已删除。",
    );
  }

  function handleMoveChapter(chapter: Chapter, direction: -1 | 1) {
    const targetIndex = chapter.order_index + direction;
    if (targetIndex < 0 || targetIndex >= documentChapters.length) {
      return;
    }
    void runAction(
      `chapter-${chapter.id}`,
      () => apiClient.updateChapter(userId, chapter.id, { order_index: targetIndex }),
      "章节顺序已更新。",
    );
  }

  function handleAddPoint(chapter: Chapter) {
    const name = newPoints[chapter.id]?.trim();
    if (!name) {
      return;
    }
    void runAction(
      `new-point-${chapter.id}`,
      () =>
        apiClient.createKnowledgePoint(userId, chapter.id, {
          name,
          order_index: chapter.knowledge_points.length,
        }),
      "知识点已创建。",
    ).then((saved) => {
      if (saved) {
        setNewPoints((current) => ({ ...current, [chapter.id]: "" }));
      }
    });
  }

  function handleRenamePoint(point: KnowledgePoint) {
    const name = pointDrafts[point.id]?.trim();
    if (!name || name === point.name) {
      return;
    }
    void runAction(
      `point-${point.id}`,
      () => apiClient.updateKnowledgePoint(userId, point.id, { name }),
      "知识点已更新。",
    );
  }

  function handleDeletePoint(point: KnowledgePoint) {
    if (!window.confirm(`删除知识点“${point.name}”？`)) {
      return;
    }
    void runAction(
      `point-${point.id}`,
      () => apiClient.deleteKnowledgePoint(userId, point.id),
      "知识点已删除。",
    );
  }

  function handleMovePoint(chapter: Chapter, point: KnowledgePoint, direction: -1 | 1) {
    const targetIndex = point.order_index + direction;
    if (targetIndex < 0 || targetIndex >= chapter.knowledge_points.length) {
      return;
    }
    void runAction(
      `point-${point.id}`,
      () =>
        apiClient.updateKnowledgePoint(userId, point.id, {
          order_index: targetIndex,
        }),
      "知识点顺序已更新。",
    );
  }

  function handleMovePointToChapter(point: KnowledgePoint, targetChapterId: string) {
    if (point.chapter_id === targetChapterId) {
      return;
    }
    const targetChapter = documentChapters.find((chapter) => chapter.id === targetChapterId);
    if (!targetChapter) {
      return;
    }
    void runAction(
      `point-${point.id}`,
      () =>
        apiClient.updateKnowledgePoint(userId, point.id, {
          chapter_id: targetChapterId,
          order_index: targetChapter.knowledge_points.length,
        }),
      "知识点已移动。",
    );
  }

  function handleTogglePoint(pointId: string) {
    const selected = selectedPointIds.includes(pointId);
    if (!selected && selectedPointIds.length >= MAX_MERGE_SELECTION) {
      setError(`最多选择 ${MAX_MERGE_SOURCES} 个来源知识点。`);
      return;
    }
    const point = allPoints.find((item) => item.id === pointId);
    if (!selected && selectedPointIds.length === 0 && point) {
      setMergeTargetId(point.id);
      setMergeName(point.name);
    }
    setSelectedPointIds((current) => {
      const next = current.includes(pointId)
        ? current.filter((item) => item !== pointId)
        : [...current, pointId];
      if (mergeTargetId && !next.includes(mergeTargetId)) {
        setMergeTargetId(next[0] ?? null);
        setMergeName(
          allPoints.find((item) => item.id === next[0])?.name ?? "",
        );
        if (!next.length) {
          setMergeDescription("");
        }
      }
      return next;
    });
  }

  function handleDocumentChange(documentId: string) {
    setSelectedDocumentId(documentId);
    setSelectedPointIds([]);
    setMergeTargetId(null);
    setMergeName("");
    setMergeDescription("");
  }

  function handleMergeTargetChange(pointId: string) {
    setMergeTargetId(pointId);
    setMergeName(allPoints.find((point) => point.id === pointId)?.name ?? "");
  }

  function handleMergePoints() {
    if (selectedPointIds.length < 2) {
      return;
    }
    const targetId =
      mergeTargetId && selectedPointIds.includes(mergeTargetId)
        ? mergeTargetId
        : selectedPointIds[0];
    const sourceIds = selectedPointIds.filter((pointId) => pointId !== targetId);
    if (!window.confirm(`将 ${sourceIds.length} 个知识点合并到目标知识点？`)) {
      return;
    }
    void runAction(
      "merge-points",
      () =>
        apiClient.mergeKnowledgePoints(userId, courseId, {
          target_knowledge_point_id: targetId,
          source_knowledge_point_ids: sourceIds,
          name: mergeName.trim() || undefined,
          description: mergeDescription.trim() || undefined,
        }),
      "知识点已合并。",
    ).then((saved) => {
      if (saved) {
        setSelectedPointIds([]);
        setMergeTargetId(null);
        setMergeName("");
        setMergeDescription("");
      }
    });
  }
  return (
    <section className="border border-[#dde3eb] bg-white">
      <div className="border-b border-[#e5e9ef] px-5 py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-[#101828]">课程结构</h2>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {documents.length > 0 ? (
                <select
                  aria-label="选择教材"
                  className="field-input max-w-sm"
                  onChange={(event) => handleDocumentChange(event.target.value)}
                  value={activeDocumentId ?? ""}
                >
                  {documents.map((document) => (
                    <option key={document.id} value={document.id}>
                      {document.original_name}
                    </option>
                  ))}
                </select>
              ) : null}
              <p className="text-sm text-[#667085]">
                {documentChapters.length} 个章节 ·{" "}
                {documentChapters.reduce(
                  (count, chapter) => count + chapter.knowledge_points.length,
                  0,
                )}{" "}
                个知识点
              </p>
            </div>
          </div>

          {activeDocumentId ? (
            <div className="flex gap-2">
              <input
                aria-label="新章节名称"
                className="field-input min-w-0 sm:w-56"
                onChange={(event) => setNewChapterTitle(event.target.value)}
                placeholder="新章节名称"
                value={newChapterTitle}
              />
              <button
                className="shrink-0 bg-[#182131] px-3 py-2 text-sm font-semibold text-white hover:bg-[#273449]"
                disabled={!newChapterTitle.trim() || savingKey === "new-chapter"}
                onClick={handleAddChapter}
                type="button"
              >
                新建
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {selectedPointIds.length > 0 ? (
        <div className="border-b border-[#e5e9ef] bg-[#f8fafc] px-5 py-4">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-[#475467]">
              已选择 {selectedPointIds.length} 个知识点
            </p>
            <select
              aria-label="合并目标知识点"
              className="field-input max-w-xs"
              onChange={(event) => handleMergeTargetChange(event.target.value)}
              value={mergeTargetId ?? selectedPointIds[0]}
            >
              {selectedPoints.map((point) => (
                <option key={point.id} value={point.id}>
                  {point.name}
                </option>
              ))}
            </select>
            <button
              className="bg-[#2563eb] px-3 py-2 text-sm font-semibold text-white hover:bg-[#1d4ed8] disabled:opacity-40"
              disabled={selectedPointIds.length < 2 || savingKey !== null}
              onClick={handleMergePoints}
              type="button"
            >
              合并知识点
            </button>
            <button
              className="border border-[#cfd5df] bg-white px-3 py-2 text-sm font-medium text-[#344054] hover:bg-[#f8fafc]"
              onClick={() => {
                setSelectedPointIds([]);
                setMergeTargetId(null);
                setMergeName("");
                setMergeDescription("");
              }}
              type="button"
            >
              取消选择
            </button>
            <p className="text-xs text-[#667085]">
              最多选择 {MAX_MERGE_SOURCES} 个来源知识点
            </p>
          </div>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            <input
              aria-label="合并后知识点名称"
              className="field-input"
              disabled={savingKey !== null}
              onChange={(event) => setMergeName(event.target.value)}
              placeholder="合并后名称"
              value={mergeName}
            />
            <textarea
              aria-label="合并后知识点说明"
              className="field-input min-h-20 resize-y"
              disabled={savingKey !== null}
              onChange={(event) => setMergeDescription(event.target.value)}
              placeholder="合并后说明（可选）"
              value={mergeDescription}
            />
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="border-b border-[#f2b8b5] bg-[#fff4f3] px-4 py-3 text-sm text-[#b42318]">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="border-b border-[#b7dfc2] bg-[#f1fbf4] px-4 py-3 text-sm text-[#166534]">
          {notice}
        </p>
      ) : null}

      {loading ? (
        <p className="px-5 py-10 text-center text-sm text-[#667085]">正在加载课程结构...</p>
      ) : documentChapters.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-[#667085]">
          当前课程尚未生成章节结构。
        </p>
      ) : (
        <div className="divide-y divide-[#e5e9ef]">
          {documentChapters.map((chapter) => (
            <section className="p-4 sm:p-5" key={chapter.id}>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center bg-[#eef2f7] text-xs font-bold text-[#475467]">
                  {chapter.order_index + 1}
                </span>
                <input
                  aria-label={`章节名称 ${chapter.order_index + 1}`}
                  className="field-input min-w-0 flex-1"
                  onChange={(event) =>
                    setChapterDrafts((current) => ({
                      ...current,
                      [chapter.id]: event.target.value,
                    }))
                  }
                  value={chapterDrafts[chapter.id] ?? chapter.title}
                />
                <div className="flex gap-1">
                  <SmallButton
                    disabled={chapter.order_index === 0 || savingKey !== null}
                    onClick={() => handleMoveChapter(chapter, -1)}
                    title="章节上移"
                  >
                    ↑
                  </SmallButton>
                  <SmallButton
                    disabled={chapter.order_index === documentChapters.length - 1 || savingKey !== null}
                    onClick={() => handleMoveChapter(chapter, 1)}
                    title="章节下移"
                  >
                    ↓
                  </SmallButton>
                  <button
                    aria-label={`保存章节 ${chapter.title}`}
                    className="min-h-8 whitespace-nowrap border border-[#cfd5df] bg-white px-2 text-xs font-medium text-[#344054] hover:bg-[#f8fafc] disabled:opacity-40"
                    disabled={
                      savingKey !== null ||
                      (chapterDrafts[chapter.id] ?? chapter.title).trim() === chapter.title
                    }
                    onClick={() => handleRenameChapter(chapter)}
                    type="button"
                  >
                    保存
                  </button>
                  <button
                    aria-label={`删除章节 ${chapter.title}`}
                    className="min-h-8 whitespace-nowrap border border-[#f2b8b5] bg-white px-2 text-xs font-medium text-[#b42318] hover:bg-[#fff4f3] disabled:opacity-40"
                    disabled={savingKey !== null}
                    onClick={() => handleDeleteChapter(chapter)}
                    type="button"
                  >
                    删除
                  </button>
                </div>
              </div>

              <div className="mt-3 divide-y divide-[#edf0f4] border-y border-[#edf0f4] pl-10">
                {chapter.knowledge_points.map((point) => (
                  <div
                    className="flex flex-col gap-2 py-3 lg:flex-row lg:items-center"
                    key={point.id}
                  >
                    <input
                      aria-label={`选择合并 ${point.name}`}
                      checked={selectedPointIds.includes(point.id)}
                      className="h-4 w-4 shrink-0"
                      disabled={
                        savingKey !== null ||
                        (selectedPointIds.length >= MAX_MERGE_SELECTION &&
                          !selectedPointIds.includes(point.id))
                      }
                      onChange={() => handleTogglePoint(point.id)}
                      type="checkbox"
                    />
                    <input
                      aria-label={`知识点名称 ${point.name}`}
                      className="field-input min-w-0 flex-1"
                      onChange={(event) =>
                        setPointDrafts((current) => ({
                          ...current,
                          [point.id]: event.target.value,
                        }))
                      }
                      value={pointDrafts[point.id] ?? point.name}
                    />
                    <select
                      aria-label="移动到章节"
                      className="field-input lg:max-w-44"
                      disabled={savingKey !== null}
                      onChange={(event) => handleMovePointToChapter(point, event.target.value)}
                      value={point.chapter_id}
                    >
                      {documentChapters.map((target) => (
                        <option key={target.id} value={target.id}>
                          {target.title}
                        </option>
                      ))}
                    </select>
                    <div className="flex gap-1">
                      <SmallButton
                        disabled={point.order_index === 0 || savingKey !== null}
                        onClick={() => handleMovePoint(chapter, point, -1)}
                        title="知识点上移"
                      >
                        ↑
                      </SmallButton>
                      <SmallButton
                        disabled={
                          point.order_index === chapter.knowledge_points.length - 1 ||
                          savingKey !== null
                        }
                        onClick={() => handleMovePoint(chapter, point, 1)}
                        title="知识点下移"
                      >
                        ↓
                      </SmallButton>
                      <button
                        aria-label={`保存知识点 ${point.name}`}
                        className="min-h-8 whitespace-nowrap border border-[#cfd5df] bg-white px-2 text-xs font-medium text-[#344054] hover:bg-[#f8fafc] disabled:opacity-40"
                        disabled={
                          savingKey !== null ||
                          (pointDrafts[point.id] ?? point.name).trim() === point.name
                        }
                        onClick={() => handleRenamePoint(point)}
                        type="button"
                      >
                        保存
                      </button>
                      <button
                        aria-label={`删除知识点 ${point.name}`}
                        className="min-h-8 whitespace-nowrap border border-[#f2b8b5] bg-white px-2 text-xs font-medium text-[#b42318] hover:bg-[#fff4f3] disabled:opacity-40"
                        disabled={savingKey !== null}
                        onClick={() => handleDeletePoint(point)}
                        type="button"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-3 flex gap-2 pl-10">
                <input
                  aria-label={`在 ${chapter.title} 新增知识点`}
                  className="field-input min-w-0 flex-1"
                  onChange={(event) =>
                    setNewPoints((current) => ({
                      ...current,
                      [chapter.id]: event.target.value,
                    }))
                  }
                  placeholder="新增知识点"
                  value={newPoints[chapter.id] ?? ""}
                />
                <button
                  aria-label={`添加知识点到 ${chapter.title}`}
                  className="shrink-0 bg-[#2563eb] px-3 py-2 text-sm font-semibold text-white hover:bg-[#1d4ed8] disabled:opacity-40"
                  disabled={!newPoints[chapter.id]?.trim() || savingKey !== null}
                  onClick={() => handleAddPoint(chapter)}
                  type="button"
                >
                  添加
                </button>
              </div>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}
