"use client";

import type { TeacherAssistantSuggestedAction } from "@echo/shared-types";

export type TeacherAssistantUiMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  status: "complete" | "streaming" | "failed" | "interrupted";
  insufficientEvidence: boolean;
  suggestedActions: TeacherAssistantSuggestedAction[];
};

const CACHE_PREFIX = "echo.teacher.assistant.v2";
const CACHE_TTL_MS = 2 * 60 * 60 * 1000;
const MAX_MESSAGES = 20;
const MAX_CACHE_BYTES = 100 * 1024;
const encoder = new TextEncoder();

type CachedConversation = {
  version: 2;
  updatedAt: number;
  messages: TeacherAssistantUiMessage[];
};

function cacheKey(userId: string, courseId: string) {
  return `${CACHE_PREFIX}:${userId}:${courseId}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isSuggestedAction(value: unknown): value is TeacherAssistantSuggestedAction {
  if (!isRecord(value) || !isRecord(value.target)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.label === "string" &&
    typeof value.target.type === "string" &&
    typeof value.target.course_id === "string"
  );
}

function isUiMessage(value: unknown): value is TeacherAssistantUiMessage {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    (value.role === "user" || value.role === "assistant") &&
    typeof value.content === "string" &&
    typeof value.createdAt === "string" &&
    ["complete", "streaming", "failed", "interrupted"].includes(String(value.status)) &&
    typeof value.insufficientEvidence === "boolean" &&
    Array.isArray(value.suggestedActions) &&
    value.suggestedActions.every(isSuggestedAction)
  );
}

function trimForCache(messages: TeacherAssistantUiMessage[]) {
  let next = messages.slice(-MAX_MESSAGES);
  while (next.length > 0 && encoder.encode(JSON.stringify(next)).byteLength > MAX_CACHE_BYTES) {
    next = next.slice(1);
  }
  return next;
}

export function loadTeacherAssistantMessages(userId: string, courseId: string) {
  if (typeof window === "undefined") return [];
  const key = cacheKey(userId, courseId);
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Partial<CachedConversation>;
    if (
      parsed.version !== 2 ||
      typeof parsed.updatedAt !== "number" ||
      Date.now() - parsed.updatedAt > CACHE_TTL_MS ||
      !Array.isArray(parsed.messages)
    ) {
      window.sessionStorage.removeItem(key);
      return [];
    }
    return trimForCache(parsed.messages.filter(isUiMessage));
  } catch {
    window.sessionStorage.removeItem(key);
    return [];
  }
}

export function saveTeacherAssistantMessages(
  userId: string,
  courseId: string,
  messages: TeacherAssistantUiMessage[],
) {
  if (typeof window === "undefined") return;
  const payload: CachedConversation = {
    version: 2,
    updatedAt: Date.now(),
    messages: trimForCache(messages),
  };
  window.sessionStorage.setItem(cacheKey(userId, courseId), JSON.stringify(payload));
}

export function clearTeacherAssistantMessages(userId: string, courseId: string) {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(cacheKey(userId, courseId));
}

export function clearTeacherAssistantUserCache(userId: string) {
  if (typeof window === "undefined") return;
  const prefix = `${CACHE_PREFIX}:${userId}:`;
  const keys: string[] = [];
  for (let index = 0; index < window.sessionStorage.length; index += 1) {
    const key = window.sessionStorage.key(index);
    if (key?.startsWith(prefix)) keys.push(key);
  }
  keys.forEach((key) => window.sessionStorage.removeItem(key));
}
