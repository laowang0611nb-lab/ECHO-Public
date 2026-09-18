"use client";

import type { ReviewFlag } from "@echo/shared-types";
import { useState } from "react";

import { useReviewDecision, useReviewQueue } from "@/features/ai-review/queries";
import { reviewReasonLabels } from "@/features/ai-review/view-model";


function severityClass(severity: ReviewFlag["severity"]): string {
  if (severity === "high") return "border-[#f2b8b5] bg-[#fff4f3] text-[#b42318]";
  if (severity === "medium") return "border-[#f2d19a] bg-[#fff8e8] text-[#92400e]";
  return "border-[#cfd5df] bg-[#f8fafc] text-[#475467]";
}

export function ReviewQueue({
  courseId,
  onChanged,
}: {
  courseId: string;
  onChanged: () => void;
}) {
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [correctedAnswers, setCorrectedAnswers] = useState<Record<string, string>>({});
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const queueQuery = useReviewQueue(courseId, { status: "open" });
  const decisionMutation = useReviewDecision(courseId);
  const flags = queueQuery.data ?? [];
  const loading = queueQuery.isLoading;
  const queueError = queueQuery.isError ? (queueQuery.error instanceof Error ? queueQuery.error.message : "加载审核队列失败。") : null;

  async function handleDecision(
    flag: ReviewFlag,
    decision: "confirm_correct" | "mark_incorrect" | "dismiss",
  ) {
    setPendingId(flag.id);
    setError(null);
    setNotice(null);
    const note = notes[flag.id]?.trim();
    const correctedAnswer = correctedAnswers[flag.id]?.trim();
    try {
      await decisionMutation.mutateAsync({ flagId: flag.id, payload: {
        decision,
        note: note || undefined,
        corrected_answer:
          decision === "mark_incorrect" ? correctedAnswer || undefined : undefined,
      } });
      void queueQuery.refetch();
      setNotice("审核结果已保存。");
      onChanged();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "保存审核结果失败。");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <section className="border border-[#dde3eb] bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-[#e5e9ef] px-5 py-4">
        <div>
          <h2 className="text-base font-semibold text-[#101828]">AI 回答审核</h2>
          <p className="mt-1 text-sm text-[#667085]">待处理 {flags.length} 项</p>
        </div>
        <button
          className="border border-[#cfd5df] bg-white px-3 py-2 text-sm font-medium text-[#344054] hover:bg-[#f8fafc]"
          disabled={queueQuery.isFetching}
          onClick={() => void queueQuery.refetch()}
          type="button"
        >
          刷新
        </button>
      </div>

      {queueError ? (
        <p className="border-b border-[#f2b8b5] bg-[#fff4f3] px-4 py-3 text-sm text-[#b42318]">
          {queueError}
        </p>
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
        <p className="px-5 py-10 text-center text-sm text-[#667085]">正在加载审核队列...</p>
      ) : flags.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-[#667085]">当前没有待审核回答。</p>
      ) : (
        <div className="divide-y divide-[#e5e9ef]">
          {flags.map((flag) => (
            <article className="p-5" key={flag.id}>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`border px-2 py-1 text-xs font-medium ${severityClass(flag.severity)}`}>
                  {flag.severity.toUpperCase()}
                </span>
                <span className="text-sm font-semibold text-[#1d2939]">
                  {reviewReasonLabels[flag.reason]}
                </span>
                <span className="text-xs text-[#667085]">{flag.student_display_name}</span>
              </div>

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div className="border-l-2 border-[#98a2b3] pl-3">
                  <p className="text-xs font-semibold text-[#667085]">学生问题</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#344054]">
                    {flag.question || "无问题文本"}
                  </p>
                </div>
                <div className="border-l-2 border-[#2563eb] pl-3">
                  <p className="text-xs font-semibold text-[#667085]">AI 回答</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[#344054]">
                    {flag.answer}
                  </p>
                </div>
              </div>

              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                <textarea
                  aria-label="教师内部备注"
                  className="field-input min-h-24 resize-y"
                  onChange={(event) =>
                    setNotes((current) => ({ ...current, [flag.id]: event.target.value }))
                  }
                  placeholder="教师内部备注"
                  value={notes[flag.id] ?? ""}
                />
                <textarea
                  aria-label="修正后的标准回答"
                  className="field-input min-h-24 resize-y"
                  disabled={pendingId !== null}
                  onChange={(event) =>
                    setCorrectedAnswers((current) => ({
                      ...current,
                      [flag.id]: event.target.value,
                    }))
                  }
                  placeholder="标记错误时填写标准回答（可选）"
                  value={correctedAnswers[flag.id] ?? ""}
                />
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  className="border border-[#b7dfc2] bg-[#f1fbf4] px-3 py-2 text-sm font-semibold text-[#166534] hover:bg-[#e4f7ea] disabled:opacity-40"
                  disabled={pendingId !== null}
                  onClick={() => void handleDecision(flag, "confirm_correct")}
                  type="button"
                >
                  确认正确
                </button>
                <button
                  className="border border-[#f2b8b5] bg-[#fff4f3] px-3 py-2 text-sm font-semibold text-[#b42318] hover:bg-[#ffe9e7] disabled:opacity-40"
                  disabled={pendingId !== null}
                  onClick={() => void handleDecision(flag, "mark_incorrect")}
                  type="button"
                >
                  标记错误
                </button>
                <button
                  className="border border-[#cfd5df] bg-white px-3 py-2 text-sm font-medium text-[#344054] hover:bg-[#f8fafc] disabled:opacity-40"
                  disabled={pendingId !== null}
                  onClick={() => void handleDecision(flag, "dismiss")}
                  type="button"
                >
                  忽略
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
