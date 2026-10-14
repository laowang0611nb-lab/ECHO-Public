import { router, useLocalSearchParams } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { CourseQrScanner } from "@/features/courses/course-qr-scanner";
import { studentReadableAuthError } from "@/services/student-auth";
import {
  clearPendingCourseCode,
  savePendingCourseCode,
} from "@/services/pending-course-storage";
import { studentTheme } from "@/constants/student-theme";
import { useCurrentCourse } from "@/providers/current-course-provider";
import { useStudentSession } from "@/providers/student-session-provider";

export default function JoinCourseScreen() {
  const { user } = useStudentSession();
  const { joinCourse } = useCurrentCourse();
  const params = useLocalSearchParams<{ code?: string | string[] }>();
  const initialCode = Array.isArray(params.code) ? params.code[0] : params.code;
  const [code, setCode] = useState(initialCode?.toUpperCase() ?? "");
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [scannerVisible, setScannerVisible] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normalizedCode = code.trim().toUpperCase();
  const valid = /^[A-Z0-9]{8}$/.test(normalizedCode);

  async function confirmJoin() {
    setPending(true);
    setError(null);
    try {
      if (!user) {
        await savePendingCourseCode(normalizedCode);
        setConfirmVisible(false);
        router.replace("/login");
        return;
      }
      await joinCourse(normalizedCode);
      await clearPendingCourseCode();
      setConfirmVisible(false);
      router.replace("/(tabs)/ai");
    } catch (requestError) {
      setError(studentReadableAuthError(requestError));
    } finally {
      setPending(false);
    }
  }

  function handleScannedCode(scannedCode: string) {
    setCode(scannedCode);
    setScannerVisible(false);
    setError(null);
    setConfirmVisible(true);
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.screen}
    >
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <Pressable
            onPress={() =>
              router.canGoBack()
                ? router.back()
                : router.replace(user ? "/(tabs)/ai" : "/login")
            }
            style={styles.backButton}
          >
            <Text style={styles.backText}>‹</Text>
          </Pressable>
          <Text style={styles.headerTitle}>加入课程</Text>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.body}>
          <View style={styles.hero}>
            <Text style={styles.eyebrow}>课程访问</Text>
            <Text style={styles.title}>加入你的课程</Text>
            <Text style={styles.description}>
              输入教师提供的 8 位课程码，或扫描课程二维码，确认后进入课程学习空间。
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>输入课程码</Text>
            <TextInput
              autoCapitalize="characters"
              maxLength={8}
              onChangeText={setCode}
              onSubmitEditing={() => {
                if (valid) {
                  setError(null);
                  setConfirmVisible(true);
                }
              }}
              placeholder="请输入 8 位课程码"
              placeholderTextColor="#98a3b5"
              style={styles.input}
              value={code}
            />

            <Pressable
              disabled={!valid || pending}
              onPress={() => {
                setError(null);
                setConfirmVisible(true);
              }}
              style={[styles.primaryButton, (!valid || pending) && styles.disabled]}
            >
              <Text style={styles.primaryButtonText}>下一步</Text>
            </Pressable>

            <Pressable
              accessibilityLabel="扫码加入课程"
              accessibilityRole="button"
              onPress={() => {
                setError(null);
                setScannerVisible(true);
              }}
              style={({ pressed }) => [styles.scanButton, pressed && styles.pressed]}
            >
              <SymbolView
                name={{ android: "qr_code_scanner", web: "qr_code_scanner" }}
                size={25}
                tintColor={studentTheme.color.primary}
              />
              <View style={styles.scanCopy}>
                <Text style={styles.scanTitle}>扫码加入课程</Text>
                <Text style={styles.scanDescription}>扫描教师提供的课程二维码</Text>
              </View>
            </Pressable>

            {error ? <Text style={styles.errorBanner}>{error}</Text> : null}
          </View>
        </View>
      </SafeAreaView>

      <Modal
        animationType="slide"
        onRequestClose={() => setConfirmVisible(false)}
        transparent
        visible={confirmVisible}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>确认加入课程</Text>
            <Text style={styles.sheetDescription}>
              将使用课程码 {normalizedCode} 加入课程。课程中的学习记录会作为本课程学习证据保存。
            </Text>
            {error ? <Text style={styles.sheetError}>{error}</Text> : null}
            <View style={styles.sheetActions}>
              <Pressable
                disabled={pending}
                onPress={() => setConfirmVisible(false)}
                style={styles.cancelButton}
              >
                <Text style={styles.cancelText}>取消</Text>
              </Pressable>
              <Pressable
                disabled={pending}
                onPress={() => void confirmJoin()}
                style={[styles.confirmButton, pending && styles.disabled]}
              >
                {pending ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <Text style={styles.confirmText}>确认加入</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {scannerVisible ? (
        <CourseQrScanner
          onClose={() => setScannerVisible(false)}
          onCodeScanned={handleScannedCode}
        />
      ) : null}
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
  },
  header: {
    alignItems: "center",
    backgroundColor: studentTheme.color.surface,
    borderBottomColor: studentTheme.color.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    minHeight: 56,
    paddingHorizontal: 12,
  },
  backButton: {
    alignItems: "center",
    borderColor: studentTheme.color.border,
    borderRadius: studentTheme.radius.medium,
    borderWidth: 1,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  backText: {
    color: studentTheme.color.text,
    fontSize: 28,
    lineHeight: 30,
    marginTop: -2,
  },
  headerTitle: {
    color: studentTheme.color.text,
    flex: 1,
    fontSize: 16,
    fontWeight: "900",
    textAlign: "center",
  },
  headerSpacer: {
    width: 36,
  },
  body: {
    gap: 14,
    padding: 16,
  },
  hero: {
    backgroundColor: studentTheme.color.surfaceBlue,
    borderRadius: studentTheme.radius.hero,
    padding: 20,
  },
  eyebrow: {
    color: studentTheme.color.primary,
    fontSize: 12,
    fontWeight: "900",
  },
  title: {
    color: studentTheme.color.text,
    fontSize: 26,
    fontWeight: "900",
    marginTop: 7,
  },
  description: {
    color: studentTheme.color.textMuted,
    fontSize: 14,
    lineHeight: 22,
    marginTop: 8,
  },
  card: {
    backgroundColor: studentTheme.color.surface,
    borderColor: studentTheme.color.border,
    borderRadius: studentTheme.radius.card,
    borderWidth: 1,
    padding: 18,
  },
  cardTitle: {
    color: studentTheme.color.text,
    fontSize: 17,
    fontWeight: "900",
  },
  input: {
    backgroundColor: studentTheme.color.surfaceSoft,
    borderColor: studentTheme.color.border,
    borderRadius: studentTheme.radius.medium,
    borderWidth: 1,
    color: studentTheme.color.text,
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: 2,
    marginTop: 13,
    minHeight: 54,
    paddingHorizontal: 13,
    textAlign: "center",
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: studentTheme.color.primary,
    borderRadius: studentTheme.radius.medium,
    justifyContent: "center",
    marginTop: 14,
    minHeight: 48,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
  },
  scanButton: {
    alignItems: "center",
    borderColor: studentTheme.color.border,
    borderRadius: studentTheme.radius.medium,
    borderStyle: "dashed",
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    marginTop: 16,
    minHeight: 68,
    paddingHorizontal: 14,
  },
  scanCopy: {
    flex: 1,
  },
  scanTitle: {
    color: studentTheme.color.text,
    fontSize: 14,
    fontWeight: "900",
  },
  scanDescription: {
    color: studentTheme.color.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  pressed: {
    opacity: 0.72,
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
  modalBackdrop: {
    backgroundColor: "rgba(15, 23, 42, 0.42)",
    flex: 1,
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: studentTheme.color.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    padding: 20,
    paddingBottom: 30,
  },
  sheetHandle: {
    alignSelf: "center",
    backgroundColor: "#cbd5e1",
    borderRadius: 999,
    height: 4,
    width: 42,
  },
  sheetTitle: {
    color: studentTheme.color.text,
    fontSize: 20,
    fontWeight: "900",
    marginTop: 18,
  },
  sheetDescription: {
    color: studentTheme.color.textMuted,
    fontSize: 14,
    lineHeight: 22,
    marginTop: 9,
  },
  sheetError: {
    color: studentTheme.color.danger,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 12,
  },
  sheetActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 22,
  },
  cancelButton: {
    alignItems: "center",
    borderColor: studentTheme.color.border,
    borderRadius: studentTheme.radius.medium,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 48,
  },
  cancelText: {
    color: studentTheme.color.text,
    fontSize: 14,
    fontWeight: "800",
  },
  confirmButton: {
    alignItems: "center",
    backgroundColor: studentTheme.color.primary,
    borderRadius: studentTheme.radius.medium,
    flex: 1,
    justifyContent: "center",
    minHeight: 48,
  },
  confirmText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900",
  },
  disabled: {
    opacity: 0.48,
  },
});
