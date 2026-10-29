import * as ScreenOrientation from "expo-screen-orientation";
import { router, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SymbolView } from "expo-symbols";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

import { studentTheme } from "@/constants/student-theme";
import {
  buildKnowledgeGraphEmbedBootstrapScript,
  buildKnowledgeGraphEmbedUrl,
  createKnowledgeGraphEmbedSession,
  resolveTeacherWebBaseUrl,
  type KnowledgeGraphEmbedSession,
} from "@/services/knowledge-graph-embed";

function firstParam(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function readableError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "知识图谱暂时无法打开。";
}

interface AskAiMessage {
  type: "echo:ask-ai";
  version: 1;
  courseId: string;
  knowledgePointId: string;
  knowledgePointName?: string;
}

export function parseAskAiMessage(
  raw: string,
  expectedCourseId: string,
): AskAiMessage | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;

    const candidate = parsed as Partial<AskAiMessage>;
    if (
      candidate.type !== "echo:ask-ai" ||
      candidate.version !== 1 ||
      candidate.courseId !== expectedCourseId ||
      typeof candidate.knowledgePointId !== "string" ||
      !candidate.knowledgePointId.trim()
    ) {
      return null;
    }

    return {
      type: "echo:ask-ai",
      version: 1,
      courseId: expectedCourseId,
      knowledgePointId: candidate.knowledgePointId.trim(),
      knowledgePointName:
        typeof candidate.knowledgePointName === "string"
          ? candidate.knowledgePointName.trim()
          : undefined,
    };
  } catch {
    return null;
  }
}

export default function KnowledgeGraphScreen() {
  const params = useLocalSearchParams<{
    courseId?: string | string[];
  }>();
  const courseId = firstParam(params.courseId);
  const [attempt, setAttempt] = useState(0);
  const [session, setSession] = useState<KnowledgeGraphEmbedSession | null>(null);
  const [preparing, setPreparing] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [webLoading, setWebLoading] = useState(true);
  const [webError, setWebError] = useState<string | null>(null);
  const [webKey, setWebKey] = useState(0);
  const [webMounted, setWebMounted] = useState(true);
  const restoredRef = useRef(false);

  const graphUrl = useMemo(
    () => (courseId ? buildKnowledgeGraphEmbedUrl(courseId, attempt) : null),
    [attempt, courseId],
  );
  const bootstrapScript = useMemo(
    () =>
      courseId && session
        ? buildKnowledgeGraphEmbedBootstrapScript(courseId, session.ticket)
        : "true;",
    [courseId, session],
  );

  const stopWebView = useCallback(() => {
    setWebMounted(false);
  }, []);

  const restorePortrait = useCallback(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    void ScreenOrientation.lockAsync(
      ScreenOrientation.OrientationLock.PORTRAIT_UP,
    ).catch(() => undefined);
  }, []);

  const exitGraph = useCallback(() => {
    restorePortrait();
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(tabs)/courses");
    }
  }, [restorePortrait]);

  const askAi = useCallback(
    (message: AskAiMessage) => {
      if (!courseId) return;

      restorePortrait();
      stopWebView();
      setSession(null);
      setWebError(null);
      setWebLoading(false);

      router.replace({
        pathname: "/chat",
        params: {
          courseId,
          knowledgePointId: message.knowledgePointId,
          knowledgePointName: message.knowledgePointName,
          source: "knowledge-graph",
        },
      });
    },
    [courseId, restorePortrait, stopWebView],
  );

  const handleWebViewMessage = useCallback(
    (event: WebViewMessageEvent) => {
      if (!courseId) return;
      const message = parseAskAiMessage(event.nativeEvent.data, courseId);
      if (message) askAi(message);
    },
    [askAi, courseId],
  );

  useEffect(() => {
    void ScreenOrientation.lockAsync(
      ScreenOrientation.OrientationLock.LANDSCAPE_RIGHT,
    ).catch(() => undefined);

    const subscription = BackHandler.addEventListener(
      "hardwareBackPress",
      () => {
        exitGraph();
        return true;
      },
    );

    return () => {
      subscription.remove();
      void ScreenOrientation.lockAsync(
        ScreenOrientation.OrientationLock.PORTRAIT_UP,
      ).catch(() => undefined);
    };
  }, [exitGraph]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;

    const run = async () => {
      await Promise.resolve();
      if (!courseId) {
        if (!active) return;
        setPreparing(false);
        setSessionError("缺少课程 ID，无法打开知识图谱。");
        return;
      }

      setPreparing(true);
      setSession(null);
      setSessionError(null);
      setWebError(null);
      setWebLoading(true);

      try {
        const next = await createKnowledgeGraphEmbedSession(
          courseId,
          controller.signal,
        );
        if (active) setSession(next);
      } catch (error) {
        if (active && !controller.signal.aborted) {
          setSessionError(readableError(error));
        }
      } finally {
        if (active) setPreparing(false);
      }
    };

    void run();

    return () => {
      active = false;
      controller.abort();
    };
  }, [attempt, courseId]);

  useEffect(() => {
    if (!session || !webLoading) return;
    const timer = setTimeout(() => {
      setWebError("图谱页面加载超时，请检查教师端服务和网络连接后重试。");
      setWebLoading(false);
    }, 20_000);
    return () => clearTimeout(timer);
  }, [session, webLoading]);

  const retry = useCallback(() => {
    setAttempt((current) => current + 1);
    setWebKey((current) => current + 1);
    setWebMounted(true);
  }, []);

  const teacherOrigin = useMemo(() => {
    try {
      return new URL(resolveTeacherWebBaseUrl()).origin;
    } catch {
      return null;
    }
  }, []);

  const showError = Boolean(sessionError || webError);

  return (
    <View style={styles.screen}>
      <StatusBar hidden />
      {graphUrl && session && !sessionError && webMounted ? (
        <WebView
          allowsInlineMediaPlayback
          androidLayerType="hardware"
          bounces={false}
          domStorageEnabled
          injectedJavaScriptBeforeContentLoaded={bootstrapScript}
          javaScriptEnabled
          key={`${courseId}:${attempt}:${webKey}`}
          mediaPlaybackRequiresUserAction={false}
          mixedContentMode="always"
          onError={(event) => {
            setWebLoading(false);
            setWebError(
              event.nativeEvent.description ||
                "知识图谱 WebView 加载失败，请重试。",
            );
          }}
          onHttpError={(event) => {
            setWebLoading(false);
            setWebError(`知识图谱页面返回 HTTP ${event.nativeEvent.statusCode}。`);
          }}
          onLoadEnd={() => setWebLoading(false)}
          onLoadStart={() => {
            setWebError(null);
            setWebLoading(true);
          }}
          onMessage={handleWebViewMessage}
          onShouldStartLoadWithRequest={(request) => {
            if (!teacherOrigin) return true;
            try {
              return new URL(request.url).origin === teacherOrigin;
            } catch {
              return false;
            }
          }}
          originWhitelist={["http://*", "https://*"]}
          scrollEnabled={false}
          setSupportMultipleWindows={false}
          source={{ uri: graphUrl }}
          style={styles.webView}
          thirdPartyCookiesEnabled
        />
      ) : null}

      {preparing ? (
        <View style={styles.statusOverlay}>
          <ActivityIndicator color="#ffffff" size="large" />
          <Text style={styles.statusTitle}>正在准备知识图谱</Text>
          <Text style={styles.statusText}>正在申请只读图谱授权并连接教师端。</Text>
        </View>
      ) : null}

      {showError ? (
        <View style={styles.statusOverlay}>
          <View style={styles.errorIcon}>
            <SymbolView
              name={{ android: "account_tree", web: "account_tree" }}
              size={32}
              tintColor={studentTheme.color.warning}
            />
          </View>
          <Text style={styles.statusTitle}>知识图谱暂时无法打开</Text>
          <Text style={styles.statusText}>{sessionError ?? webError}</Text>
          <View style={styles.errorActions}>
            <Pressable onPress={retry} style={styles.retryButton}>
              <Text style={styles.retryText}>重试</Text>
            </Pressable>
            <Pressable onPress={exitGraph} style={styles.backButton}>
              <Text style={styles.backText}>返回课程</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {webLoading && !showError && !preparing ? (
        <View pointerEvents="none" style={styles.loadingPill}>
          <ActivityIndicator color="#ffffff" size="small" />
          <Text style={styles.loadingPillText}>正在加载图谱...</Text>
        </View>
      ) : null}

      <SafeAreaView edges={["top", "left"]} pointerEvents="box-none" style={styles.floatingBack}>
        <Pressable
          accessibilityLabel="退出知识图谱"
          accessibilityRole="button"
          onPress={exitGraph}
          style={styles.exitButton}
        >
          <SymbolView
            name={{ android: "arrow_back", web: "arrow_back" }}
            size={22}
            tintColor="#ffffff"
          />
        </Pressable>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: "#06101f",
    flex: 1,
  },
  webView: {
    backgroundColor: "#06101f",
    flex: 1,
  },
  statusOverlay: {
    alignItems: "center",
    backgroundColor: "#06101f",
    bottom: 0,
    justifyContent: "center",
    left: 0,
    paddingHorizontal: 32,
    position: "absolute",
    right: 0,
    top: 0,
  },
  statusTitle: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "900",
    marginTop: 18,
    textAlign: "center",
  },
  statusText: {
    color: "#c7d7ec",
    fontSize: 13,
    lineHeight: 20,
    marginTop: 9,
    textAlign: "center",
  },
  errorIcon: {
    alignItems: "center",
    backgroundColor: "#17243a",
    borderRadius: 22,
    height: 68,
    justifyContent: "center",
    width: 68,
  },
  errorActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 24,
  },
  retryButton: {
    alignItems: "center",
    backgroundColor: studentTheme.color.primary,
    borderRadius: 12,
    justifyContent: "center",
    minHeight: 44,
    minWidth: 104,
    paddingHorizontal: 18,
  },
  retryText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900",
  },
  backButton: {
    alignItems: "center",
    borderColor: "#48617f",
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 44,
    minWidth: 104,
    paddingHorizontal: 18,
  },
  backText: {
    color: "#dbe8f8",
    fontSize: 14,
    fontWeight: "800",
  },
  loadingPill: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: "rgba(4, 13, 27, 0.86)",
    borderRadius: 999,
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 9,
    position: "absolute",
    top: 18,
  },
  loadingPillText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "800",
  },
  floatingBack: {
    alignItems: "flex-start",
    left: 0,
    padding: 14,
    position: "absolute",
    top: 0,
  },
  exitButton: {
    alignItems: "center",
    backgroundColor: "rgba(4, 13, 27, 0.76)",
    borderRadius: 18,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
});
