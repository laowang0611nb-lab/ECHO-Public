import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import { SymbolView } from "expo-symbols";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { studentTheme } from "@/constants/student-theme";

const COURSE_CODE_PATTERN = /^[A-Z0-9]{8}$/;
const COURSE_CODE_KEYS = ["code", "course_code", "courseCode"] as const;

function normalizeCourseCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  return COURSE_CODE_PATTERN.test(normalized) ? normalized : null;
}

export function extractCourseCode(rawValue: string): string | null {
  const value = rawValue.trim();
  if (!value) return null;

  const direct = normalizeCourseCode(value);
  if (direct) return direct;

  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed && typeof parsed === "object") {
      const record = parsed as Record<string, unknown>;
      for (const key of COURSE_CODE_KEYS) {
        const normalized = normalizeCourseCode(record[key]);
        if (normalized) return normalized;
      }
    }
  } catch {
    // The QR payload may be a URL or plain text, not JSON.
  }

  try {
    const url = new URL(value);
    for (const key of COURSE_CODE_KEYS) {
      const normalized = normalizeCourseCode(url.searchParams.get(key));
      if (normalized) return normalized;
    }

    const pathParts = url.pathname.split("/").filter(Boolean).reverse();
    for (const part of pathParts) {
      try {
        const normalized = normalizeCourseCode(decodeURIComponent(part));
        if (normalized) return normalized;
      } catch {
        // Ignore malformed path encoding and continue with the next segment.
      }
    }
  } catch {
    // The QR payload may be plain text without a URL scheme.
  }

  for (const token of value.match(/[A-Z0-9]{8}/gi) ?? []) {
    const normalized = normalizeCourseCode(token);
    if (normalized) return normalized;
  }

  return null;
}

interface CourseQrScannerProps {
  onClose: () => void;
  onCodeScanned: (code: string) => void;
}

export function CourseQrScanner({
  onClose,
  onCodeScanned,
}: CourseQrScannerProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [permissionPending, setPermissionPending] = useState(false);
  const [scanHint, setScanHint] = useState<string | null>(null);
  const scanLockedRef = useRef(false);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    },
    [],
  );

  const granted = permission?.granted === true;
  const canRequestPermission = permission === null || permission.canAskAgain;

  async function requestCameraPermission() {
    setPermissionPending(true);
    try {
      await requestPermission();
    } finally {
      setPermissionPending(false);
    }
  }

  function releaseScanLock(delayMs = 1200) {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    retryTimerRef.current = setTimeout(() => {
      scanLockedRef.current = false;
    }, delayMs);
  }

  function handleBarcodeScanned(result: BarcodeScanningResult) {
    if (scanLockedRef.current) return;

    const code = extractCourseCode(result.data);
    if (!code) {
      scanLockedRef.current = true;
      setScanHint("没有识别到有效的 8 位课程码，请对准二维码重试。");
      releaseScanLock();
      return;
    }

    scanLockedRef.current = true;
    onCodeScanned(code);
  }

  return (
    <Modal animationType="slide" onRequestClose={onClose} visible>
      <View style={styles.screen}>
        {granted ? (
          <>
            <CameraView
              barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
              facing="back"
              onBarcodeScanned={handleBarcodeScanned}
              style={styles.camera}
            />
            <View pointerEvents="none" style={styles.scanOverlay}>
              <View style={styles.scanFrame}>
                <View style={[styles.corner, styles.cornerTopLeft]} />
                <View style={[styles.corner, styles.cornerTopRight]} />
                <View style={[styles.corner, styles.cornerBottomLeft]} />
                <View style={[styles.corner, styles.cornerBottomRight]} />
              </View>
              <Text style={styles.scanHint}>将课程二维码放入框内</Text>
              {scanHint ? <Text style={styles.scanError}>{scanHint}</Text> : null}
            </View>
          </>
        ) : (
          <View style={styles.permissionContent}>
            <View style={styles.permissionIcon}>
              <SymbolView
                name={{ android: "qr_code_scanner", web: "qr_code_scanner" }}
                size={34}
                tintColor={studentTheme.color.primary}
              />
            </View>
            <Text style={styles.permissionTitle}>允许使用相机</Text>
            <Text style={styles.permissionDescription}>
              开启相机后，扫描教师提供的课程二维码即可自动识别课程码。
            </Text>
            {permission && !permission.canAskAgain ? (
              <Text style={styles.permissionHint}>
                请在系统设置中允许 ECHO 使用相机。
              </Text>
            ) : null}
            <Pressable
              accessibilityRole="button"
              disabled={permissionPending || !canRequestPermission}
              onPress={() => void requestCameraPermission()}
              style={[
                styles.permissionButton,
                (permissionPending || !canRequestPermission) && styles.disabled,
              ]}
            >
              {permissionPending || permission === null ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <Text style={styles.permissionButtonText}>允许相机权限</Text>
              )}
            </Pressable>
          </View>
        )}

        <SafeAreaView edges={["top"]} pointerEvents="box-none" style={styles.header}>
          <Pressable
            accessibilityLabel="关闭扫码"
            accessibilityRole="button"
            onPress={onClose}
            style={styles.closeButton}
          >
            <SymbolView
              name={{ android: "close", web: "close" }}
              size={24}
              tintColor="#ffffff"
            />
          </Pressable>
          <Text style={styles.headerTitle}>扫码加入课程</Text>
          <View style={styles.headerSpacer} />
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: "#06101f",
    flex: 1,
  },
  camera: {
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  scanOverlay: {
    alignItems: "center",
    flex: 1,
    gap: 18,
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  scanFrame: {
    height: 250,
    position: "relative",
    width: 250,
  },
  corner: {
    borderColor: "#ffffff",
    height: 32,
    position: "absolute",
    width: 32,
  },
  cornerTopLeft: {
    borderLeftWidth: 4,
    borderTopWidth: 4,
    left: 0,
    top: 0,
  },
  cornerTopRight: {
    borderRightWidth: 4,
    borderTopWidth: 4,
    right: 0,
    top: 0,
  },
  cornerBottomLeft: {
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    bottom: 0,
    left: 0,
  },
  cornerBottomRight: {
    borderBottomWidth: 4,
    borderRightWidth: 4,
    bottom: 0,
    right: 0,
  },
  scanHint: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "800",
    textAlign: "center",
  },
  scanError: {
    backgroundColor: "rgba(180, 30, 30, 0.82)",
    borderRadius: 12,
    color: "#ffffff",
    fontSize: 13,
    lineHeight: 20,
    overflow: "hidden",
    paddingHorizontal: 14,
    paddingVertical: 10,
    textAlign: "center",
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    left: 0,
    paddingHorizontal: 14,
    position: "absolute",
    right: 0,
    top: 0,
  },
  closeButton: {
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.46)",
    borderRadius: 18,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  headerTitle: {
    color: "#ffffff",
    flex: 1,
    fontSize: 16,
    fontWeight: "900",
    textAlign: "center",
  },
  headerSpacer: {
    width: 36,
  },
  permissionContent: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 30,
  },
  permissionIcon: {
    alignItems: "center",
    backgroundColor: studentTheme.color.surface,
    borderRadius: 24,
    height: 76,
    justifyContent: "center",
    width: 76,
  },
  permissionTitle: {
    color: "#ffffff",
    fontSize: 22,
    fontWeight: "900",
    marginTop: 22,
  },
  permissionDescription: {
    color: "#d6e4f7",
    fontSize: 14,
    lineHeight: 22,
    marginTop: 10,
    textAlign: "center",
  },
  permissionHint: {
    color: "#ffd3cf",
    fontSize: 12,
    lineHeight: 19,
    marginTop: 10,
    textAlign: "center",
  },
  permissionButton: {
    alignItems: "center",
    backgroundColor: studentTheme.color.primary,
    borderRadius: studentTheme.radius.medium,
    justifyContent: "center",
    marginTop: 24,
    minHeight: 48,
    minWidth: 190,
    paddingHorizontal: 22,
  },
  permissionButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900",
  },
  disabled: {
    opacity: 0.48,
  },
});
