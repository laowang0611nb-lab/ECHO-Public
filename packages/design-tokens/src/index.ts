export const colors = {
  background: "#f7f8fc",
  surface: "#ffffff",
  text: "#172033",
  textMuted: "#667085",
  primary: "#2563eb",
  success: "#15803d",
  warning: "#b45309",
  danger: "#b42318",
} as const;

export const radii = {
  small: 6,
  medium: 8,
  large: 12,
} as const;

export const motion = {
  duration: {
    micro: 120,
    fast: 220,
    normal: 360,
    slow: 600,
  },
  spring: {
    gentle: { damping: 18, stiffness: 180 },
    snappy: { damping: 22, stiffness: 260 },
  },
} as const;
