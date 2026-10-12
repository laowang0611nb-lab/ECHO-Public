"use client";

import { ApiClientError } from "@echo/api-client";
import type {
  TeacherAssistantCapabilities,
  TeacherAssistantSuggestedAction,
} from "@echo/shared-types";
import { useQuery } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { apiClient } from "@/lib/api";
import { useCourseWorkspace } from "@/providers/course-workspace-provider";
import { useTeacherSession } from "@/providers/teacher-session-provider";
import { useTeacherAssistantPageContext } from "./page-context";
import {
  clearTeacherAssistantMessages,
  clearTeacherAssistantUserCache,
  loadTeacherAssistantMessages,
  saveTeacherAssistantMessages,
  type TeacherAssistantUiMessage,
} from "./session-cache";

type TeacherAssistantContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  messages: TeacherAssistantUiMessage[];
  capabilities: TeacherAssistantCapabilities | null;
  capabilitiesLoading: boolean;
  unavailableReason: string | null;
  sending: boolean;
  statusLabel: string | null;
  courseId: string | null;
  pageLabel: string;
  sendMessage: (content: string) => Promise<void>;
  stop: () => void;
  clear: () => void;
  retryCapabilities: () => void;
};

const TeacherAssistantContext = createContext<TeacherAssistantContextValue | null>(null);

const MAX_HISTORY_MESSAGES = 16;
const MAX_HISTORY_CONTENT_CHARS = 1500;

function createId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizedContent(value: string) {
  return value.trim().replace(/\s+/g, " ").slice(0, MAX_HISTORY_CONTENT_CHARS);
}

function historyFrom(messages: TeacherAssistantUiMessage[]) {
  return messages
    .filter((message) => message.status === "complete" && message.content.trim())
    .slice(-MAX_HISTORY_MESSAGES)
    .map((message) => ({ role: message.role, content: normalizedContent(message.content) }));
}

function withActions(messages: TeacherAssistantUiMessage[], id: string, actions: TeacherAssistantSuggestedAction[]) {
  return messages.map((message) => (message.id === id ? { ...message, suggestedActions: actions } : message));
}

function errorText(error: unknown) {
  if (error instanceof ApiClientError) {
    if (error.status === 401 || error.status === 403) return "当前账号没有访问该课程 AI 助手的权限。";
    if (error.status === 429) return "请求过于频繁，请稍后再试。";
    if (error.status === 503) return "AI 助手服务暂时不可用。";
    return error.message || "AI 助手请求失败。";
  }
  if (error instanceof Error && error.name === "AbortError") return "已停止。";
  return error instanceof Error ? error.message : "AI 助手请求失败。";
}

function pageLabel(page: string) {
  const labels: Record<string, string> = {
    dashboard: "Dashboard",
    ai_insights: "AI 教学洞察",
    student_analytics: "学生学情",
    student_detail: "学生详情",
    student_conversation: "学生对话",
    knowledge_base: "知识库",
    knowledge_point_detail: "知识点详情",
    ai_review: "AI 审核",
    teaching_strategy: "教学策略",
    execution_plan: "执行计划",
    courses: "课程管理",
    unknown: "当前页面",
  };
  return labels[page] ?? "当前页面";
}

export function TeacherAssistantProvider({ children }: { children: ReactNode }) {
  const { user } = useTeacherSession();
  const { selectedCourseId } = useCourseWorkspace();
  const pageContext = useTeacherAssistantPageContext();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<TeacherAssistantUiMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [statusLabel, setStatusLabel] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const identityRef = useRef<string | null>(null);
  const previousUserIdRef = useRef<string | null>(null);

  const capabilitiesQuery = useQuery({
    queryKey: ["teacher", "assistant", "capabilities", user?.id, selectedCourseId],
    queryFn: () => apiClient.getTeacherAssistantCapabilities(user!.id, selectedCourseId!),
    enabled: Boolean(user && selectedCourseId),
    retry: false,
    staleTime: 30_000,
  });

  const identity = user && selectedCourseId ? `${user.id}:${selectedCourseId}` : null;

  useEffect(() => {
    const previousUserId = previousUserIdRef.current;
    if (previousUserId && previousUserId !== user?.id) {
      clearTeacherAssistantUserCache(previousUserId);
    }
    previousUserIdRef.current = user?.id ?? null;
  }, [user?.id]);

  useEffect(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    identityRef.current = identity;
    const nextMessages = identity && user && selectedCourseId
      ? loadTeacherAssistantMessages(user.id, selectedCourseId)
      : [];
    const timer = window.setTimeout(() => {
      setSending(false);
      setStatusLabel(null);
      setMessages(nextMessages);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [identity, selectedCourseId, user]);

  const capabilities = capabilitiesQuery.data ?? null;
  const unavailableReason = !user
    ? "正在恢复教师会话。"
    : !selectedCourseId
      ? "请先选择课程，再向 AI 助手提问。"
      : capabilitiesQuery.isPending
        ? null
        : capabilitiesQuery.isError
          ? "AI 助手服务尚未就绪，请稍后重试。"
          : !capabilities?.enabled
            ? "当前课程暂未开放 AI 助手。"
            : null;

  const persist = useCallback((nextMessages: TeacherAssistantUiMessage[]) => {
    if (!user || !selectedCourseId) return;
    saveTeacherAssistantMessages(user.id, selectedCourseId, nextMessages);
  }, [selectedCourseId, user]);

  const stop = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setSending(false);
    setStatusLabel("已停止");
  }, []);

  const clear = useCallback(() => {
    if (!user || !selectedCourseId) return;
    clearTeacherAssistantMessages(user.id, selectedCourseId);
    setMessages([]);
    setStatusLabel(null);
  }, [selectedCourseId, user]);

  const sendMessage = useCallback(async (content: string) => {
    const trimmed = content.trim();
    if (!user || !selectedCourseId || !trimmed || sending || unavailableReason) return;
    const maxChars = capabilities?.max_message_chars ?? 4000;
    const normalized = trimmed.slice(0, maxChars);
    const requestIdentity = identityRef.current;
    if (!requestIdentity) return;

    const userMessage: TeacherAssistantUiMessage = {
      id: createId(),
      role: "user",
      content: normalized,
      createdAt: new Date().toISOString(),
      status: "complete",
      insufficientEvidence: false,
      suggestedActions: [],
    };
    const draftId = createId();
    const draft: TeacherAssistantUiMessage = {
      id: draftId,
      role: "assistant",
      content: "",
      createdAt: new Date().toISOString(),
      status: "streaming",
      insufficientEvidence: false,
      suggestedActions: [],
    };
    const baseMessages = messages;
    const initial = [...baseMessages, userMessage, draft].slice(-20);
    setMessages(initial);
    persist(initial);
    setSending(true);
    setStatusLabel("正在准备…");

    const controller = new AbortController();
    controllerRef.current = controller;
    let currentDraft = draft;

    try {
      const stream = apiClient.streamTeacherAssistantMessage(
        user.id,
        selectedCourseId,
        {
          client_message_id: userMessage.id,
          content: normalized,
          history: historyFrom(baseMessages),
          page_context: pageContext,
          locale: "zh-CN",
        },
        { signal: controller.signal },
      );

      for await (const event of stream) {
        if (identityRef.current !== requestIdentity) {
          controller.abort();
          break;
        }

        if (event.event === "message_start") {
          currentDraft = { ...currentDraft, id: event.data.assistant_message_id };
          setMessages((current) => current.map((message) => message.id === draftId ? currentDraft : message));
          continue;
        }

        if (event.event === "status") {
          setStatusLabel(event.data.label);
          continue;
        }

        if (event.event === "text_delta") {
          currentDraft = { ...currentDraft, content: `${currentDraft.content}${event.data.delta}` };
          setMessages((current) => current.map((message) => message.id === currentDraft.id ? currentDraft : message));
          continue;
        }

        if (event.event === "suggested_actions") {
          currentDraft = { ...currentDraft, suggestedActions: event.data.items };
          setMessages((current) => withActions(current, currentDraft.id, event.data.items));
          continue;
        }

        if (event.event === "done") {
          currentDraft = {
            ...currentDraft,
            ...event.data.assistant_message,
            status: event.data.assistant_message.status,
            insufficientEvidence: event.data.assistant_message.insufficient_evidence,
            suggestedActions: event.data.assistant_message.suggested_actions,
          };
          const finalMessages = baseMessages.length
            ? [...baseMessages, userMessage, currentDraft].slice(-20)
            : [userMessage, currentDraft];
          setMessages(finalMessages);
          persist(finalMessages);
          setStatusLabel(event.data.assistant_message.insufficient_evidence ? "证据不足" : null);
        }

        if (event.event === "error") {
          currentDraft = { ...currentDraft, status: "failed", content: currentDraft.content || event.data.message };
          const failedMessages = [...baseMessages, userMessage, currentDraft].slice(-20);
          setMessages(failedMessages);
          persist(failedMessages);
          setStatusLabel(event.data.retryable ? `${event.data.message}（可重试）` : event.data.message);
        }
      }
    } catch (error) {
      const interrupted = controller.signal.aborted;
      currentDraft = {
        ...currentDraft,
        status: interrupted ? "interrupted" : "failed",
        content: currentDraft.content || (interrupted ? "" : errorText(error)),
      };
      const failedMessages = [...baseMessages, userMessage, currentDraft].slice(-20);
      setMessages(failedMessages);
      persist(failedMessages);
      setStatusLabel(interrupted ? "已停止" : errorText(error));
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
      setSending(false);
    }
  }, [capabilities?.max_message_chars, messages, pageContext, persist, selectedCourseId, sending, unavailableReason, user]);

  const value = useMemo<TeacherAssistantContextValue>(() => ({
    open,
    setOpen,
    messages,
    capabilities,
    capabilitiesLoading: capabilitiesQuery.isPending,
    unavailableReason,
    sending,
    statusLabel,
    courseId: selectedCourseId,
    pageLabel: pageLabel(pageContext.page),
    sendMessage,
    stop,
    clear,
    retryCapabilities: () => void capabilitiesQuery.refetch(),
  }), [
    capabilities,
    capabilitiesQuery,
    clear,
    messages,
    open,
    pageContext.page,
    selectedCourseId,
    sendMessage,
    sending,
    statusLabel,
    stop,
    unavailableReason,
  ]);

  return <TeacherAssistantContext.Provider value={value}>{children}</TeacherAssistantContext.Provider>;
}

export function useTeacherAssistant() {
  const context = useContext(TeacherAssistantContext);
  if (!context) throw new Error("useTeacherAssistant must be used within TeacherAssistantProvider");
  return context;
}
