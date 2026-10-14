import { QueryClientProvider } from "@tanstack/react-query";
import * as ScreenOrientation from "expo-screen-orientation";
import { Stack, type ErrorBoundaryProps } from "expo-router";
import { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { LoadingState } from "@/components/states/page-state";
import { queryClient } from "@/lib/query-client";
import { CurrentCourseProvider } from "@/providers/current-course-provider";
import {
  StudentSessionProvider,
  useStudentSession,
} from "@/providers/student-session-provider";

export default function RootLayout() {
  useEffect(() => {
    void ScreenOrientation.lockAsync(
      ScreenOrientation.OrientationLock.PORTRAIT_UP,
    ).catch(() => undefined);
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <StudentSessionProvider>
            <CurrentCourseProvider>
              <StatusBar style="auto" />
              <RootNavigator />
            </CurrentCourseProvider>
          </StudentSessionProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function RootNavigator() {
  const { user, ready } = useStudentSession();

  if (!ready) {
    return <LoadingState message="正在恢复学习状态..." />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="join-course" />
      <Stack.Screen name="network-settings" />
      <Stack.Protected guard={!user}>
        <Stack.Screen name="register" />
        <Stack.Screen name="forgot-password" />
        <Stack.Screen name="reset-password" />
        <Stack.Screen name="login" />
      </Stack.Protected>
      <Stack.Protected guard={Boolean(user)}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="chat" />
        <Stack.Screen name="knowledge-graph" />
        <Stack.Screen name="change-password" />
        <Stack.Screen name="courses/[courseId]" />
        <Stack.Screen name="courses/[courseId]/chapters/[chapterId]" />
        <Stack.Screen name="knowledge/[knowledgePointId]" />
        <Stack.Screen name="learning-records" />
        <Stack.Screen name="wrong-questions" />
      </Stack.Protected>
    </Stack>
  );
}

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  if (__DEV__) console.error(error);
  return (
    <View style={styles.errorScreen}>
      <Text style={styles.errorTitle}>ECHO 暂时遇到问题</Text>
      <Text style={styles.errorDescription}>
        页面没有正确加载，请重新尝试。
      </Text>
      <Pressable onPress={retry} style={styles.errorButton}>
        <Text style={styles.errorButtonText}>重新加载</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  errorScreen: {
    alignItems: "center",
    backgroundColor: "#F4F8FF",
    flex: 1,
    justifyContent: "center",
    padding: 28,
  },
  errorTitle: {
    color: "#17233A",
    fontSize: 22,
    fontWeight: "900",
  },
  errorDescription: {
    color: "#667085",
    fontSize: 14,
    marginTop: 10,
    textAlign: "center",
  },
  errorButton: {
    alignItems: "center",
    backgroundColor: "#208AEF",
    borderRadius: 12,
    justifyContent: "center",
    marginTop: 22,
    minHeight: 48,
    paddingHorizontal: 28,
  },
  errorButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900",
  },
});
