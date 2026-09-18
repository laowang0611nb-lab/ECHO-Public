import type { ServiceState } from "@echo/shared-types";

export type ServerStatusTone = "success" | "warning" | "danger" | "neutral" | "info";

export function serviceStateLabel(state: ServiceState) {
  const labels: Record<ServiceState, string> = {
    healthy: "正常",
    warning: "警告",
    offline: "异常",
    unconfigured: "未配置",
  };
  return labels[state];
}

export function serviceStateTone(state: ServiceState): ServerStatusTone {
  if (state === "healthy") return "success";
  if (state === "warning") return "warning";
  if (state === "offline") return "danger";
  return "neutral";
}

export function formatCheckedAt(value?: string) {
  if (!value) return "尚未检测";
  return value.slice(0, 19).replace("T", " ");
}
