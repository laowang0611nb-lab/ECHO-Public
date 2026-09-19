import type {
  LearningEventType,
  StudentLearningEventItem,
} from "@echo/shared-types";

const eventTitles: Record<LearningEventType, string> = {
  question_asked: "AI 提问",
  hint_requested: "请求提示",
  quiz_correct: "快速验证答对",
  quiz_wrong: "快速验证需要复习",
  concept_confusion: "发现概念混淆",
  repeated_error: "重复错误",
  resolved: "问题已解决",
  teacher_adjustment: "教师调整学习状态",
};

export function learningEventTitle(event: StudentLearningEventItem): string {
  if (event.event_type === "question_asked" && event.evidence?.trim()) {
    const evidence = event.evidence.trim();
    if (evidence.length <= 48 && !evidence.includes("验收证据")) {
      return evidence;
    }
  }
  return eventTitles[event.event_type];
}

export function learningEventDescription(
  event: StudentLearningEventItem,
): string {
  const point = event.knowledge_point_name?.trim();
  if (event.event_type === "quiz_correct") {
    return point ? `${point} · 回答正确` : "快速验证回答正确";
  }
  if (event.event_type === "quiz_wrong") {
    return point ? `${point} · 回答错误` : "快速验证回答错误";
  }
  if (event.event_type === "resolved") {
    return point ? `${point} · 已解决` : "相关问题已经解决";
  }
  if (event.event_type === "teacher_adjustment") {
    return point ? `${point} · 教师已调整` : "教师调整了学习状态";
  }
  if (point) return point;
  if (event.event_type === "hint_requested") return "查看了一条学习提示";
  if (event.event_type === "concept_confusion") return "需要进一步区分相关概念";
  if (event.event_type === "repeated_error") return "同一知识点再次出现错误";
  return "完成了一次学习活动";
}

export type LearningEventIconName =
  | "chat_bubble"
  | "quiz"
  | "person"
  | "check_circle"
  | "trending_up";

export function learningEventIcon(
  eventType: LearningEventType,
): LearningEventIconName {
  if (eventType === "question_asked" || eventType === "hint_requested") {
    return "chat_bubble";
  }
  if (eventType === "quiz_correct" || eventType === "quiz_wrong") {
    return "quiz";
  }
  if (eventType === "teacher_adjustment") return "person";
  if (eventType === "resolved") return "check_circle";
  return "trending_up";
}

export function isConversationEvent(eventType: LearningEventType): boolean {
  return eventType === "question_asked" || eventType === "hint_requested";
}

export function isQuizEvent(eventType: LearningEventType): boolean {
  return eventType === "quiz_correct" || eventType === "quiz_wrong";
}

export function isChapterEvent(eventType: LearningEventType): boolean {
  return (
    eventType === "concept_confusion" ||
    eventType === "repeated_error" ||
    eventType === "resolved" ||
    eventType === "teacher_adjustment"
  );
}

export function masteryDeltaLabel(event: StudentLearningEventItem): string | null {
  if (event.mastery_before === null && event.mastery_after === null) return null;
  if (event.mastery_before === null && event.mastery_after !== null) {
    return `首次记录 ${Math.round(event.mastery_after)}%`;
  }
  if (event.mastery_before !== null && event.mastery_after === null) {
    return `此前 ${Math.round(event.mastery_before)}%`;
  }
  return `${Math.round(event.mastery_before ?? 0)}% → ${Math.round(
    event.mastery_after ?? 0,
  )}%`;
}
