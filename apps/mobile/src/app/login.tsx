import { useQuery } from "@tanstack/react-query";
import { Redirect, router } from "expo-router";
import { useState, type FormEvent } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { studentTheme } from "@/constants/student-theme";
import { apiClient } from "@/lib/api-client";
import { useStudentSession } from "@/providers/student-session-provider";
import {
  BackendCapabilityMissingError,
  PENDING_COURSE_CODE_KEY,
  isDevelopmentAuth,
  studentReadableAuthError,
} from "@/services/student-auth";
import { studentStorage } from "@/services/student-storage";

export default function LoginScreen() {
  const { user, login } = useStudentSession();
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const healthQuery = useQuery({
    queryKey: ["service-health"],
    queryFn: () => apiClient.health(),
    retry: false,
    staleTime: 15_000,
  });

  const serviceReady = healthQuery.isSuccess;

  if (user) {
    return <Redirect href="/(tabs)/ai" />;
  }

  async function handleSubmit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!account.trim() || !password || pending) {
      return;
    }

    setPending(true);
    setError(null);
    try {
      await login({ account: account.trim(), password });
      const pendingCourseCode = await studentStorage.getItem(PENDING_COURSE_CODE_KEY);
      if (pendingCourseCode) {
        router.replace({ pathname: "/join-course", params: { code: pendingCourseCode } });
      } else {
        router.replace("/(tabs)/ai");
      }
    } catch (requestError) {
      if (requestError instanceof BackendCapabilityMissingError) {
        setError("正式账号密码登录尚未接入，当前请使用开发登录模式。");
      } else {
        setError(studentReadableAuthError(requestError));
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.screen}
    >
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.brandRow}>
          <View style={styles.logo}>
            <Text style={styles.logoText}>E</Text>
          </View>
          <View>
            <Text style={styles.brandTitle}>ECHO</Text>
            <Text style={styles.brandSubtitle}>让 AI 陪伴你的每一次学习进步</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.eyebrow}>学生登录</Text>
          <Text style={styles.title}>欢迎使用 ECHO</Text>
          <Text style={styles.description}>输入学号或账号，进入课程学习空间。</Text>

          {isDevelopmentAuth ? (
            <View style={styles.devBanner}>
              <Text style={styles.devBannerText}>开发登录模式</Text>
            </View>
          ) : null}

          <Text style={styles.label}>学号 / 账号</Text>
          <TextInput
            autoCapitalize="none"
            onChangeText={setAccount}
            placeholder="请输入学号或账号"
            placeholderTextColor="#98a3b5"
            style={styles.input}
            value={account}
          />

          <Text style={styles.label}>密码</Text>
          <TextInput
            onChangeText={setPassword}
            placeholder="请输入密码"
            placeholderTextColor="#98a3b5"
            secureTextEntry
            style={styles.input}
            value={password}
          />

          <View style={styles.serviceRow}>
            <View
              style={[
                styles.statusDot,
                healthQuery.isSuccess && styles.statusOnline,
                healthQuery.isError && styles.statusOffline,
              ]}
            />
            <Text style={styles.serviceText}>
              {healthQuery.isPending
                ? "正在连接 ECHO 服务"
                : healthQuery.isSuccess
                  ? "ECHO 服务已连接"
                  : "ECHO 服务暂时不可用"}
            </Text>
            {healthQuery.isError ? (
              <Pressable onPress={() => void healthQuery.refetch()}>
                <Text style={styles.retryText}>重试</Text>
              </Pressable>
            ) : null}
          </View>

          {error ? <Text style={styles.errorBanner}>{error}</Text> : null}

          <Pressable
            disabled={pending || !serviceReady || !account.trim() || !password}
            onPress={() => void handleSubmit()}
            style={[
              styles.primaryButton,
              (pending || !serviceReady || !account.trim() || !password) && styles.disabled,
            ]}
          >
            {pending ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.primaryButtonText}>登录</Text>
            )}
          </Pressable>

          <Pressable onPress={() => router.push("/join-course")} style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>首次使用，先加入课程</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: studentTheme.color.background,
    flex: 1,
  },
  safeArea: {
    flex: 1,
    justifyContent: "center",
    padding: 20,
  },
  brandRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    marginBottom: 24,
  },
  logo: {
    alignItems: "center",
    backgroundColor: studentTheme.color.text,
    borderRadius: 12,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  logoText: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "900",
  },
  brandTitle: {
    color: studentTheme.color.text,
    fontSize: 24,
    fontWeight: "900",
  },
  brandSubtitle: {
    color: studentTheme.color.textMuted,
    fontSize: 13,
    marginTop: 3,
  },
  card: {
    alignSelf: "center",
    backgroundColor: studentTheme.color.surface,
    borderColor: studentTheme.color.border,
    borderRadius: studentTheme.radius.card,
    borderWidth: 1,
    maxWidth: 460,
    padding: 24,
    shadowColor: "#17345c",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    width: "100%",
  },
  eyebrow: {
    color: studentTheme.color.primary,
    fontSize: 12,
    fontWeight: "900",
  },
  title: {
    color: studentTheme.color.text,
    fontSize: 28,
    fontWeight: "900",
    marginTop: 7,
  },
  description: {
    color: studentTheme.color.textMuted,
    fontSize: 14,
    lineHeight: 22,
    marginTop: 8,
  },
  devBanner: {
    alignSelf: "flex-start",
    backgroundColor: studentTheme.color.surfaceBlue,
    borderRadius: studentTheme.radius.pill,
    marginTop: 14,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  devBannerText: {
    color: studentTheme.color.primary,
    fontSize: 11,
    fontWeight: "800",
  },
  label: {
    color: studentTheme.color.text,
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 7,
    marginTop: 18,
  },
  input: {
    backgroundColor: studentTheme.color.surfaceSoft,
    borderColor: studentTheme.color.border,
    borderRadius: studentTheme.radius.medium,
    borderWidth: 1,
    color: studentTheme.color.text,
    fontSize: 15,
    minHeight: 48,
    paddingHorizontal: 13,
  },
  serviceRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 7,
    marginTop: 15,
  },
  statusDot: {
    backgroundColor: "#aeb8c7",
    borderRadius: 999,
    height: 9,
    width: 9,
  },
  statusOnline: {
    backgroundColor: studentTheme.color.success,
  },
  statusOffline: {
    backgroundColor: studentTheme.color.danger,
  },
  serviceText: {
    color: studentTheme.color.textMuted,
    flex: 1,
    fontSize: 12,
  },
  retryText: {
    color: studentTheme.color.primary,
    fontSize: 12,
    fontWeight: "800",
  },
  errorBanner: {
    backgroundColor: "#fff5f4",
    borderColor: "#efb4af",
    borderRadius: studentTheme.radius.medium,
    borderWidth: 1,
    color: studentTheme.color.danger,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 14,
    padding: 10,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: studentTheme.color.primary,
    borderRadius: studentTheme.radius.medium,
    justifyContent: "center",
    marginTop: 20,
    minHeight: 48,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
  },
  secondaryButton: {
    alignItems: "center",
    marginTop: 14,
    padding: 8,
  },
  secondaryButtonText: {
    color: studentTheme.color.primary,
    fontSize: 13,
    fontWeight: "800",
  },
  disabled: {
    opacity: 0.5,
  },
});
