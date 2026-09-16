"use client";

import type { ReviewFlag, ReviewReason } from "@echo/shared-types";
import { useEffect, useState } from "react";

import { apiClient } from "@/lib/api";

const reasonLabels: Record<ReviewReason, string> = {
  missing_course_basis: "缺少课程依据",
  outside_material_heavy: "课程外内容偏多",
  repeated_follow_up: "连续追问",
  student_not_resolved: "学生标记未解决",
  teacher_rule_violation: "可能违反教学规则",
};

function severityClass(severity: ReviewFlag["severity"]): string {
  if (severity === "high") return "border-[#f2b8b5] bg-[#fff4f3] text-[#b42318]";
  if (severity === "medium") return "border-[#f2d19a] bg-[#fff8e8] text-[#92400e]";
  return "border-[#cfd5df] bg-[#f8fafc] text-[#475467]";
}

export function ReviewQueue({
  courseId,
  onChanged,
  userId,
}: {
  courseId: string;
  onChanged: () => void;
  userId: string;
}) {
  const [flags, setFlags] = useState<ReviewFlag[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const items = await apiClient.listReviewFlags(userId, courseId, {
          status: "open",
          limit: 50,
        });
        if (!cancelled) {
          setFlags(items);
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError instanceof Error ? requestError.message : "加载审核队列失败。");
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

  async function handleDecision(
    flag: ReviewFlag,
    decision: "confirm_correct" | "mark_incorrect" | "dismiss",
  ) {
    setPendingId(flag.id);
    setError(null);
    setNotice(null);
    const note = notes[flag.id]?.trim();
    try {
      await apiClient.reviewFlag(userId, courseId, flag.id, {
        decision,
        note: note || undefined,
        corrected_answer: decision === "mark_incorrect" ? note || undefined : undefined,
      });
      setFlags((current) => current.filter((item) => item.id !== flag.id));
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
          onClick={() => setReloadKey((current) => current + 1)}
          type="button"
        >
          刷新
        </button>
      </div>

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
                  {reasonLabels[flag.reason]}
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

              <textarea
                className="field-input mt-4 min-h-20 resize-y"
                onChange={(event) =>
                  setNotes((current) => ({ ...current, [flag.id]: event.target.value }))
                }
                placeholder="教师备注；标记错误时可填写标准回答"
                value={notes[flag.id] ?? ""}
              />

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
