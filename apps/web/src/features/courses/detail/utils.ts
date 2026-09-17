import type { ChapterAnalytics } from "@echo/shared-types";

export function formatDate(value: string | null | undefined) {
  if (!value) return "暂无";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "暂无";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(parsed);
}

export function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function masteryTone(value: number | null) {
  if (value === null) return "neutral" as const;
  if (value < 50) return "danger" as const;
  if (value < 70) return "warning" as const;
  return "success" as const;
}

export function chapterStatus(chapter: ChapterAnalytics) {
  if (chapter.average_mastery !== null && chapter.average_mastery < 60) return "需要关注";
  if (chapter.active_learner_count > 0) return "进行中";
  return "未开始";
}

export function referenceChapter(chapters: ChapterAnalytics[]) {
  const activeChapters = chapters.filter((chapter) => chapter.active_learner_count > 0);
  return activeChapters.at(-1) ?? chapters.at(-1) ?? null;
}

export function referenceProgress(chapters: ChapterAnalytics[]) {
  const current = referenceChapter(chapters);
  if (!current || !chapters.length) return 0;
  return Math.round(((current.order_index + 1) / chapters.length) * 100);
}
