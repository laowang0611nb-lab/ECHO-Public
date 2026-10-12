import type { Message } from "@echo/shared-types";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ErrorState, LoadingState } from "@/components/states/page-state";
import { studentTheme } from "@/constants/student-theme";
import { MessageBubble } from "@/features/chat/chat-message";
import {
  ChatComposer,
  ChatEmptyState,
  ChatHeader,
  ChatReconnectBanner,
  ContextBanner,
  ConversationDrawer,
  NewContentButton,
} from "@/features/chat/chat-shell";
import { useChatController } from "@/features/chat/use-chat";
import { useStudentLearningOverview } from "@/features/learning/use-learning-overview";
import { useCurrentCourse } from "@/providers/current-course-provider";
import { useStudentSession } from "@/providers/student-session-provider";

export default function ChatScreen() {
  const params = useLocalSearchParams<{
    courseId?: string | string[];
    conversationId?: string | string[];
    knowledgePointId?: string | string[];
    knowledgePointName?: string | string[];
    question?: string | string[];
  }>();
  const first = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value ?? null;
  const courseId = first(params.courseId);
  const conversationId = first(params.conversationId);
  const knowledgePointId = first(params.knowledgePointId);
  const knowledgePointNameParam = first(params.knowledgePointName);
  const initialQuestion = first(params.question);
  const { user } = useStudentSession();
  const { selectedCourse, loading } = useCurrentCourse();
  const effectiveCourseId = courseId ?? selectedCourse?.id ?? null;

  if (!user) {
    return null;
  }
  if (loading && !effectiveCourseId) {
    return <LoadingState message="正在加载课程上下文..." />;
  }
  if (!effectiveCourseId || !selectedCourse) {
    return (
      <ErrorState
        description="加入课程后才能使用 AI 对话。"
        onAction={() => router.replace("/(tabs)/courses")}
        title="还没有当前课程"
      />
    );
  }

  return (
    <ChatWorkspace
      conversationId={conversationId}
      courseId={effectiveCourseId}
      initialQuestion={initialQuestion}
      key={`${effectiveCourseId}:${knowledgePointId ?? "none"}`}
      knowledgePointId={knowledgePointId}
      knowledgePointName={knowledgePointNameParam}
      userId={user.id}
    />
  );
}

function ChatWorkspace({
  courseId,
  conversationId,
  knowledgePointId,
  knowledgePointName: knowledgePointNameParam,
  initialQuestion,
  userId,
}: {
  courseId: string;
  conversationId: string | null;
  knowledgePointId: string | null;
  knowledgePointName: string | null;
  initialQuestion: string | null;
  userId: string;
}) {
  const { selectedCourse } = useCurrentCourse();
  const learning = useStudentLearningOverview(userId, courseId);
  const [activeKnowledgePointId, setActiveKnowledgePointId] = useState(
    knowledgePointId,
  );
  const chat = useChatController({
    courseId,
    conversationId,
    knowledgePointId: activeKnowledgePointId,
    initialQuestion,
  });
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [hasNewContent, setHasNewContent] = useState(false);
  const listRef = useRef<FlatList<Message>>(null);
  const followingRef = useRef(true);
  const initialSentRef = useRef(false);

  const knowledgePointName = useMemo(() => {
    if (!activeKnowledgePointId) {
      return null;
    }
    for (const chapter of learning.chapters) {
      const point = chapter.knowledge_points.find(
        (item) => item.id === activeKnowledgePointId,
      );
      if (point) {
        return point.name;
      }
    }
    return knowledgePointNameParam ?? "当前知识点";
  }, [activeKnowledgePointId, knowledgePointNameParam, learning.chapters]);

  useEffect(() => {
    if (!initialQuestion || initialSentRef.current) {
      return;
    }
    initialSentRef.current = true;
    void chat.sendMessage(initialQuestion).catch(() => undefined);
  }, [chat, initialQuestion]);

  function scrollToBottom(animated = true) {
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated });
      followingRef.current = true;
      setHasNewContent(false);
    });
  }

  function onScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const distanceFromBottom =
      contentSize.height - contentOffset.y - layoutMeasurement.height;
    followingRef.current = distanceFromBottom < 90;
    if (followingRef.current) {
      setHasNewContent(false);
    }
  }

  function onContentSizeChange() {
    if (followingRef.current) {
      scrollToBottom(false);
    } else {
      setHasNewContent(true);
    }
  }

  function selectConversation(nextConversationId: string) {
    if (chat.isStreaming) {
      Alert.alert("回答仍在生成", "切换会话前是否停止当前回答？", [
        { text: "继续等待", style: "cancel" },
        {
          text: "停止并切换",
          style: "destructive",
          onPress: () => {
            chat.stopStream();
            chat.selectConversation(nextConversationId);
            setDrawerVisible(false);
          },
        },
      ]);
      return;
    }
    chat.selectConversation(nextConversationId);
    setDrawerVisible(false);
  }

  function newConversation() {
    if (chat.isStreaming) {
      Alert.alert("回答仍在生成", "新建对话前是否停止当前回答？", [
        { text: "继续等待", style: "cancel" },
        {
          text: "停止并新建",
          style: "destructive",
          onPress: () => {
            chat.stopStream();
            chat.newConversation();
            setDrawerVisible(false);
          },
        },
      ]);
      return;
    }
    chat.newConversation();
    setDrawerVisible(false);
  }

  return (
    <SafeAreaView edges={["top"]} style={styles.screen}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.keyboardView}
      >
        <ChatHeader
          contextLabel={knowledgePointName}
          course={selectedCourse}
          onBack={() => router.back()}
          onOpenHistory={() => setDrawerVisible(true)}
        />
        {activeKnowledgePointId ? (
          <ContextBanner
            label={knowledgePointName ?? "当前知识点"}
            onRemove={() => setActiveKnowledgePointId(null)}
          />
        ) : null}
        {chat.offline ? (
          <ChatReconnectBanner onRetry={chat.retryConnection} />
        ) : null}
        {chat.messagesLoading && chat.messages.length === 0 ? (
          <ChatHistorySkeleton />
        ) : chat.conversationError && chat.messages.length === 0 ? (
          <ErrorState
            description="暂时无法加载课程对话，请重新连接后重试。"
            onAction={chat.retryConnection}
            title="暂时无法加载对话"
          />
        ) : (
          <View style={styles.listWrap}>
            <FlatList
              ListEmptyComponent={
                <ChatEmptyState
                  courseName={selectedCourse?.name ?? "当前课程"}
                  onSelectSuggestion={chat.setDraft}
                />
              }
              contentContainerStyle={[
                styles.listContent,
                chat.messages.length === 0 && styles.emptyListContent,
              ]}
              data={chat.messages}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              onContentSizeChange={onContentSizeChange}
              onScroll={onScroll}
              ref={listRef}
              renderItem={({ item }) => (
                <MessageBubble
                  disabled={chat.offline || chat.isStreaming}
                  message={item}
                  onContinue={() => chat.continueMessage(item)}
                  onHint={(block) =>
                    chat.requestHint(item.id, block.level + 1).then(() => undefined)
                  }
                  onNotResolved={() => chat.reportNotResolved(item.id)}
                  onQuickCheck={(block, optionId, attemptId) =>
                    chat.submitQuickCheck(item.id, block, optionId, attemptId)
                  }
                  onRetry={() => chat.retryMessage(item)}
                  onThought={() => Keyboard.dismiss()}
                />
              )}
              scrollEventThrottle={16}
              showsVerticalScrollIndicator={false}
            />
            {hasNewContent ? <NewContentButton onPress={() => scrollToBottom()} /> : null}
          </View>
        )}
        <ChatComposer
          disabled={chat.offline}
          attachmentError={chat.attachmentError}
          attachments={chat.attachments}
          onChange={chat.setDraft}
          onAddAttachment={chat.addAttachment}
          onRemoveAttachment={chat.removeAttachment}
          onSend={() => void chat.sendMessage(chat.draft)}
          onStop={chat.stopStream}
          streaming={chat.isStreaming}
          value={chat.draft}
        />
      </KeyboardAvoidingView>
      <ConversationDrawer
        activeConversationId={chat.activeConversationId}
        conversations={chat.conversations}
        courseName={selectedCourse?.name ?? "当前课程"}
        loading={chat.conversationsLoading}
        onClose={() => setDrawerVisible(false)}
        onNewConversation={newConversation}
        onSelect={selectConversation}
        visible={drawerVisible}
      />
    </SafeAreaView>
  );
}

function ChatHistorySkeleton() {
  return (
    <View style={styles.skeletonList}>
      {[0, 1, 2].map((item) => (
        <View key={item} style={styles.skeletonMessage}>
          <View style={styles.skeletonAvatar} />
          <View style={styles.skeletonMessageBody}>
            <View style={styles.skeletonMessageTitle} />
            <View style={styles.skeletonMessageLine} />
            <View style={styles.skeletonMessageLineShort} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: studentTheme.color.background,
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  offlineWrap: {
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  listWrap: {
    flex: 1,
  },
  listContent: {
    gap: 22,
    paddingBottom: 24,
    paddingHorizontal: 14,
    paddingTop: 16,
  },
  emptyListContent: {
    flexGrow: 1,
    justifyContent: "center",
  },
  skeletonList: {
    gap: 22,
    paddingBottom: 24,
    paddingHorizontal: 14,
    paddingTop: 18,
  },
  skeletonMessage: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10,
  },
  skeletonAvatar: {
    backgroundColor: studentTheme.color.surfaceBlue,
    borderRadius: 17,
    height: 34,
    width: 34,
  },
  skeletonMessageBody: {
    backgroundColor: studentTheme.color.surface,
    borderColor: studentTheme.color.divider,
    borderRadius: studentTheme.radius.card,
    borderWidth: 1,
    flex: 1,
    gap: 9,
    padding: 14,
  },
  skeletonMessageTitle: {
    backgroundColor: studentTheme.color.primarySoft,
    borderRadius: 4,
    height: 11,
    width: "32%",
  },
  skeletonMessageLine: {
    backgroundColor: studentTheme.color.divider,
    borderRadius: 4,
    height: 12,
    width: "92%",
  },
  skeletonMessageLineShort: {
    backgroundColor: studentTheme.color.surfaceSoft,
    borderRadius: 4,
    height: 12,
    width: "64%",
  },
  emptyCard: {
    alignItems: "center",
    backgroundColor: studentTheme.color.surface,
    borderColor: studentTheme.color.border,
    borderRadius: studentTheme.radius.card,
    borderWidth: 1,
    marginHorizontal: 15,
    padding: 22,
  },
  emptyTitle: {
    color: studentTheme.color.text,
    fontSize: 18,
    fontWeight: "900",
  },
  emptyDescription: {
    color: studentTheme.color.textMuted,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 8,
    textAlign: "center",
  },
});
