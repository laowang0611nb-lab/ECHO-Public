import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
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
      <Stack.Protected guard={!user}>
        <Stack.Screen name="login" />
      </Stack.Protected>
      <Stack.Protected guard={Boolean(user)}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="chat" />
        <Stack.Screen name="courses/[courseId]" />
        <Stack.Screen name="courses/[courseId]/chapters/[chapterId]" />
        <Stack.Screen name="knowledge/[knowledgePointId]" />
        <Stack.Screen name="learning-records" />
        <Stack.Screen name="wrong-questions" />
      </Stack.Protected>
    </Stack>
  );
}
