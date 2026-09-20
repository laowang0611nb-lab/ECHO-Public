import { useQueryClient } from "@tanstack/react-query";
import { router } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { DetailHeader } from "@/components/student/detail-header";
import { PageFade } from "@/components/student/page-fade";
import { studentTheme } from "@/constants/student-theme";
import {
  clearAuthSession,
  getCachedAuthSession,
} from "@/services/auth-session-storage";
import {
  getApiBaseUrlSync,
  getDefaultApiBaseUrl,
  persistApiBaseUrl,
  resetApiBaseUrl,
  testApiBaseUrl,
} from "@/services/api-network-config";

type NetworkMode = "adb" | "lan";

const ADB_URL = "http://127.0.0.1:8000";
const HOTSPOT_PLACEHOLDER = "http://192.168.137.1:8000";

export default function NetworkSettingsScreen() {
  const queryClient = useQueryClient();
  const [currentUrl, setCurrentUrl] = useState(getApiBaseUrlSync());
  const [mode, setMode] = useState<NetworkMode>(
    currentUrl === ADB_URL ? "adb" : "lan",
  );
  const [value, setValue] = useState(
    currentUrl === ADB_URL ? ADB_URL : currentUrl,
  );
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function chooseMode(next: NetworkMode) {
    setMode(next);
    setError(null);
    setMessage(null);
    if (next === "adb") {
      setValue(ADB_URL);
    } else if (value === ADB_URL) {
      setValue(HOTSPOT_PLACEHOLDER);
    }
  }

  async function testConnection() {
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const result = await testApiBaseUrl(value);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setMessage(
        result.version ? `连接成功，服务版本 ${result.version}。` : result.message,
      );
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "无法连接，请检查服务器地址。",
      );
    } finally {
      setPending(false);
    }
  }

  async function applySavedUrl(normalized: string, prefix?: string) {
    const changed = normalized !== currentUrl;
    const hadSession = getCachedAuthSession() !== null;
    if (changed && hadSession) {
      await clearAuthSession();
    }
    queryClient.clear();
    setCurrentUrl(normalized);
    setValue(normalized);
    if (changed && hadSession) {
      setMessage("地址已保存，请使用新服务器重新登录。");
      return;
    }
    setMessage(prefix ?? "地址已保存，后续接口将使用新的连接地址。");
  }

  async function save() {
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const normalized = await persistApiBaseUrl(value);
      await applySavedUrl(normalized);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "地址保存失败，请检查后重试。",
      );
    } finally {
      setPending(false);
    }
  }

  async function restoreDefault() {
    setPending(true);
    setError(null);
    setMessage(null);
    try {
      const defaultUrl = await resetApiBaseUrl();
      setMode(defaultUrl === ADB_URL ? "adb" : "lan");
      await applySavedUrl(defaultUrl, "已恢复构建时默认地址。");
    } finally {
      setPending(false);
    }
  }

  return (
    <SafeAreaView edges={["top"]} style={styles.screen}>
      <PageFade>
        <DetailHeader
          onBack={() => router.back()}
          subtitle="ADB 与本机热点联调"
          title="网络与连接"
        />
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>当前连接地址</Text>
            <Text selectable style={styles.currentUrl}>
              {currentUrl}
            </Text>
            <Text style={styles.infoText}>
              ADB 模式使用 127.0.0.1；热点模式使用电脑热点网卡 IP。
            </Text>
          </View>

          <View style={styles.modeRow}>
            <ModeButton
              active={mode === "adb"}
              label="ADB / USB"
              onPress={() => chooseMode("adb")}
            />
            <ModeButton
              active={mode === "lan"}
              label="热点 / 局域网"
              onPress={() => chooseMode("lan")}
            />
          </View>

          <Text style={styles.label}>服务器地址</Text>
          <TextInput
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={(next) => {
              setValue(next);
              setError(null);
              setMessage(null);
            }}
            placeholder={mode === "adb" ? ADB_URL : HOTSPOT_PLACEHOLDER}
            placeholderTextColor="#98a3b5"
            style={[styles.input, error && styles.inputError]}
            value={value}
          />
          <Text style={styles.hint}>
            热点模式下填写电脑热点 IPv4，例如 192.168.137.1:8000。
          </Text>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          {message ? <Text style={styles.successText}>{message}</Text> : null}

          <Pressable
            disabled={pending}
            onPress={() => void testConnection()}
            style={({ pressed }) => [
              styles.secondaryButton,
              pending && styles.disabled,
              pressed && styles.pressed,
            ]}
          >
            {pending ? (
              <ActivityIndicator color={studentTheme.color.primary} />
            ) : (
              <Text style={styles.secondaryButtonText}>测试连接</Text>
            )}
          </Pressable>

          <Pressable
            disabled={pending}
            onPress={() => void save()}
            style={({ pressed }) => [
              styles.primaryButton,
              pending && styles.disabled,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.primaryButtonText}>保存并应用</Text>
          </Pressable>

          <Pressable
            disabled={pending}
            onPress={() => void restoreDefault()}
            style={styles.linkButton}
          >
            <Text style={styles.linkButtonText}>
              恢复默认 {getDefaultApiBaseUrl()}
            </Text>
          </Pressable>

          <View style={styles.tipCard}>
            <Text style={styles.tipTitle}>热点联调检查</Text>
            <Text style={styles.tipText}>
              API 监听 0.0.0.0:8000，手机连接电脑热点，并允许 Windows 防火墙访问 TCP 8000。
            </Text>
          </View>
        </ScrollView>
      </PageFade>
    </SafeAreaView>
  );
}

function ModeButton({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.modeButton, active && styles.modeButtonActive]}
    >
      <Text style={[styles.modeText, active && styles.modeTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: studentTheme.color.background,
    flex: 1,
  },
  content: {
    gap: 14,
    padding: 16,
    paddingBottom: 36,
  },
  infoCard: {
    backgroundColor: studentTheme.color.surface,
    borderColor: studentTheme.color.border,
    borderRadius: studentTheme.radius.card,
    borderWidth: 1,
    padding: 16,
  },
  infoTitle: {
    color: studentTheme.color.text,
    fontSize: 14,
    fontWeight: "900",
  },
  currentUrl: {
    color: studentTheme.color.primary,
    fontSize: 13,
    fontWeight: "800",
    marginTop: 9,
  },
  infoText: {
    color: studentTheme.color.textMuted,
    fontSize: 12,
    lineHeight: 19,
    marginTop: 7,
  },
  modeRow: {
    flexDirection: "row",
    gap: 9,
  },
  modeButton: {
    alignItems: "center",
    backgroundColor: studentTheme.color.surface,
    borderColor: studentTheme.color.border,
    borderRadius: studentTheme.radius.medium,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 46,
  },
  modeButtonActive: {
    backgroundColor: studentTheme.color.primarySoft,
    borderColor: studentTheme.color.primaryBorder,
  },
  modeText: {
    color: studentTheme.color.textMuted,
    fontSize: 13,
    fontWeight: "800",
  },
  modeTextActive: {
    color: studentTheme.color.primary,
  },
  label: {
    color: studentTheme.color.text,
    fontSize: 13,
    fontWeight: "800",
  },
  input: {
    backgroundColor: studentTheme.color.surface,
    borderColor: studentTheme.color.border,
    borderRadius: studentTheme.radius.medium,
    borderWidth: 1,
    color: studentTheme.color.text,
    fontSize: 15,
    minHeight: 50,
    paddingHorizontal: 13,
  },
  inputError: {
    borderColor: studentTheme.color.danger,
  },
  hint: {
    color: studentTheme.color.textMuted,
    fontSize: 11,
    lineHeight: 18,
  },
  errorText: {
    color: studentTheme.color.danger,
    fontSize: 12,
    lineHeight: 19,
  },
  successText: {
    color: studentTheme.color.success,
    fontSize: 12,
    lineHeight: 19,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: studentTheme.color.primary,
    borderRadius: studentTheme.radius.medium,
    justifyContent: "center",
    minHeight: 50,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900",
  },
  secondaryButton: {
    alignItems: "center",
    borderColor: studentTheme.color.primaryBorder,
    borderRadius: studentTheme.radius.medium,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 50,
  },
  secondaryButtonText: {
    color: studentTheme.color.primary,
    fontSize: 14,
    fontWeight: "900",
  },
  linkButton: {
    alignItems: "center",
    minHeight: 40,
    justifyContent: "center",
  },
  linkButtonText: {
    color: studentTheme.color.textMuted,
    fontSize: 11,
  },
  tipCard: {
    backgroundColor: studentTheme.color.surfaceBlue,
    borderRadius: studentTheme.radius.card,
    padding: 15,
  },
  tipTitle: {
    color: studentTheme.color.text,
    fontSize: 13,
    fontWeight: "900",
  },
  tipText: {
    color: studentTheme.color.textMuted,
    fontSize: 12,
    lineHeight: 19,
    marginTop: 7,
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.76,
  },
});
