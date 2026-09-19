import { colors, motion, radii } from "@echo/design-tokens";

export const studentTheme = {
  color: {
    background: "#f1f6fc",
    surface: colors.surface,
    surfaceSoft: "#f6f9fd",
    surfaceBlue: "#eaf3ff",
    border: "#d7e2ef",
    text: colors.text,
    textMuted: colors.textMuted,
    primary: colors.primary,
    primaryDark: "#1557c7",
    success: colors.success,
    warning: colors.warning,
    danger: colors.danger,
    violet: "#7357c8",
    orange: "#d97706",
    cyan: "#0891b2",
  },
  radius: {
    small: radii.small,
    medium: radii.medium,
    large: radii.large,
    card: 16,
    hero: 20,
    pill: 999,
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 28,
  },
  motion,
} as const;
