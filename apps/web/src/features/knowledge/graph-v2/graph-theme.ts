import type { GraphRiskLevel } from "./graph-types";

export const GRAPH_THEME = {
  background: "#081527",
  surface: "#0d1d33",
  surfaceStrong: "#122743",
  grid: "rgba(118, 158, 215, 0.10)",
  text: "#eaf2ff",
  textMuted: "#8fa5c2",
  textDim: "#667a98",
  primary: "#4b9cff",
  primaryStrong: "#77b7ff",
  primarySoft: "rgba(75, 156, 255, 0.18)",
  edge: "#46678f",
  edgeSoft: "rgba(87, 126, 177, 0.44)",
  edgePrerequisite: "#72b6ff",
  edgeRelated: "#647b9f",
  focusHalo: "rgba(94, 178, 255, 0.24)",
  risk: {
    normal: "#4b9cff",
    elevated: "#ffad5b",
    medium: "#ff6f78",
    high: "#a98cff",
    unknown: "#71839c",
  },
  riskHalo: {
    normal: "rgba(75, 156, 255, 0.22)",
    elevated: "rgba(255, 173, 91, 0.24)",
    medium: "rgba(255, 111, 120, 0.25)",
    high: "rgba(169, 140, 255, 0.28)",
    unknown: "rgba(113, 131, 156, 0.18)",
  },
  riskLabel: {
    normal: "正常",
    elevated: "关注",
    medium: "中风险",
    high: "高风险",
    unknown: "暂无学情",
  } satisfies Record<GraphRiskLevel, string>,
} as const;

export function riskColor(risk: GraphRiskLevel | undefined) {
  return GRAPH_THEME.risk[risk ?? "unknown"];
}

export function riskHalo(risk: GraphRiskLevel | undefined) {
  return GRAPH_THEME.riskHalo[risk ?? "unknown"];
}

export function riskLabel(risk: GraphRiskLevel | undefined) {
  return GRAPH_THEME.riskLabel[risk ?? "unknown"];
}
