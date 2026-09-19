import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import { studentTheme } from "@/constants/student-theme";

export function LoadingState({ message = "正在加载..." }: { message?: string }) {
  return (
    <View style={styles.container}>
      <ActivityIndicator color={studentTheme.color.primary} size="large" />
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

export function EmptyState({
  title,
  description,
  actionLabel,
  secondaryActionLabel,
  onAction,
  onSecondaryAction,
  secondaryActionDisabled,
}: {
  title: string;
  description?: string;
  actionLabel?: string;
  secondaryActionLabel?: string;
  onAction?: () => void;
  onSecondaryAction?: () => void;
  secondaryActionDisabled?: boolean;
}) {
  return (
    <View style={styles.container}>
      <View style={styles.stateMark}>
        <Text style={styles.stateMarkText}>E</Text>
      </View>
      <Text style={styles.title}>{title}</Text>
      {description ? <Text style={styles.description}>{description}</Text> : null}
      {actionLabel && onAction ? (
        <Pressable onPress={onAction} style={styles.button}>
          <Text style={styles.buttonText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
      {secondaryActionLabel ? (
        <Pressable
          disabled={secondaryActionDisabled || !onSecondaryAction}
          onPress={onSecondaryAction}
          style={[
            styles.secondaryButton,
            (secondaryActionDisabled || !onSecondaryAction) && styles.buttonDisabled,
          ]}
        >
          <Text style={styles.secondaryButtonText}>{secondaryActionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function ErrorState({
  title = "内容加载失败",
  description = "请稍后重试。",
  actionLabel = "重新加载",
  onAction,
}: {
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.container}>
      <View style={[styles.stateMark, styles.errorMark]}>
        <Text style={styles.errorMarkText}>!</Text>
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
      {onAction ? (
        <Pressable onPress={onAction} style={styles.button}>
          <Text style={styles.buttonText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function OfflineState({
  onRetry,
  cachedContent,
}: {
  onRetry: () => void;
  cachedContent?: ReactNode;
}) {
  return (
    <View style={styles.offlineContainer}>
      <OfflineBanner onRetry={onRetry} />
      {cachedContent}
    </View>
  );
}

export function OfflineBanner({
  onRetry,
  description = "已加载的内容仍可查看。",
}: {
  onRetry: () => void;
  description?: string;
}) {
  return (
    <View style={styles.offlineBanner}>
      <Text style={styles.offlineTitle}>ECHO 服务暂时不可用</Text>
      <Text style={styles.offlineDescription}>{description}</Text>
      <Pressable onPress={onRetry} style={styles.offlineButton}>
        <Text style={styles.offlineButtonText}>重试</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    padding: 28,
  },
  stateMark: {
    alignItems: "center",
    backgroundColor: studentTheme.color.surfaceBlue,
    borderRadius: 999,
    height: 52,
    justifyContent: "center",
    width: 52,
  },
  stateMarkText: {
    color: studentTheme.color.primary,
    fontSize: 20,
    fontWeight: "900",
  },
  message: {
    color: studentTheme.color.textMuted,
    fontSize: 14,
    marginTop: 12,
  },
  errorMark: {
    backgroundColor: "#fff1f0",
  },
  errorMarkText: {
    color: studentTheme.color.danger,
    fontSize: 24,
    fontWeight: "900",
  },
  title: {
    color: studentTheme.color.text,
    fontSize: 19,
    fontWeight: "800",
    marginTop: 16,
    textAlign: "center",
  },
  description: {
    color: studentTheme.color.textMuted,
    fontSize: 14,
    lineHeight: 22,
    marginTop: 8,
    maxWidth: 420,
    textAlign: "center",
  },
  button: {
    backgroundColor: studentTheme.color.primary,
    borderRadius: studentTheme.radius.medium,
    marginTop: 18,
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "800",
  },
  secondaryButton: {
    borderColor: studentTheme.color.border,
    borderRadius: studentTheme.radius.medium,
    borderWidth: 1,
    marginTop: 10,
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  secondaryButtonText: {
    color: studentTheme.color.text,
    fontSize: 14,
    fontWeight: "800",
  },
  buttonDisabled: {
    opacity: 0.48,
  },
  offlineContainer: {
    flex: 1,
    padding: 16,
  },
  offlineBanner: {
    alignItems: "center",
    backgroundColor: "#fff7ed",
    borderColor: "#fed7aa",
    borderRadius: studentTheme.radius.medium,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    padding: 12,
  },
  offlineTitle: {
    color: studentTheme.color.warning,
    fontSize: 13,
    fontWeight: "800",
  },
  offlineDescription: {
    color: studentTheme.color.textMuted,
    flex: 1,
    fontSize: 12,
  },
  offlineButton: {
    borderColor: studentTheme.color.warning,
    borderRadius: studentTheme.radius.small,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  offlineButtonText: {
    color: studentTheme.color.warning,
    fontSize: 12,
    fontWeight: "800",
  },
});
