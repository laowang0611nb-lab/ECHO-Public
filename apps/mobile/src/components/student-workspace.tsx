import { ApiClientError } from "@echo/api-client";
import { colors as tokens } from "@echo/design-tokens";
import type { Conversation, Course, Message, User } from "@echo/shared-types";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { apiClient } from "@/lib/api-client";

const palette = {
  background: "#eef2f7",
  surface: "#ffffff",
  surfaceMuted: "#f5f7fa",
  border: "#d7dee8",
  text: "#152033",
  textMuted: "#657187",
  primary: tokens.primary,
  primarySoft: "#eaf2ff",
  success: "#15803d",
  warning: "#b45309",
  danger: tokens.danger,
};

function readableError(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.status === 401) {
      return "登录会话已失效，请重新登录。";
    }
    if (error.status === 404) {
      return "没有找到对应课程，请检查课程码。";
    }
    if (error.status === 409) {
      return "课程尚未发布，或当前账号角色不匹配。";
    }
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "请求失败，请稍后重试。";
}

export function StudentWorkspace() {
  const [user, setUser] = useState<User | null>(null);

  const handleLogout = useCallback(() => setUser(null), []);

  if (!user) {
    return <StudentLogin onAuthenticated={setUser} />;
  }

  return <StudentCourseWorkspace user={user} onLogout={handleLogout} />;
}

function StudentLogin({ onAuthenticated }: { onAuthenticated: (user: User) => void }) {
  const [email, setEmail] = useState("student@example.com");
  const [displayName, setDisplayName] = useState("演示学生");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setPending(true);
    setError(null);

    try {
      const currentUser = await apiClient.login({
        email: email.trim(),
        display_name: displayName.trim(),
        role: "student",
      });
      onAuthenticated(currentUser);
    } catch (requestError) {
      setError(readableError(requestError));
    } finally {
      setPending(false);
    }
  }

  return (
    <View style={styles.authScreen}>
      <View style={styles.authPanel}>
        <Text style={styles.brand}>ECHO</Text>
        <Text style={styles.authTitle}>学生端</Text>
        <Text style={styles.authDescription}>登录后加入课程，与课程 Agent 进行学习对话。</Text>

        <View style={styles.formGroup}>
          <Text style={styles.label}>邮箱</Text>
          <TextInput
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            onChangeText={setEmail}
            placeholder="student@example.com"
            placeholderTextColor="#98a1b2"
            style={styles.input}
            value={email}
          />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>显示名称</Text>
          <TextInput
            autoComplete="name"
            onChangeText={setDisplayName}
            placeholder="你的名字"
            placeholderTextColor="#98a1b2"
            style={styles.input}
            value={displayName}
          />
        </View>

        {error ? <Text style={styles.errorBanner}>{error}</Text> : null}

        <Pressable
          accessibilityRole="button"
          disabled={pending || !email.trim() || !displayName.trim()}
          onPress={() => void handleSubmit()}
          style={({ pressed }) => [
            styles.primaryButton,
            pressed && styles.pressed,
            (pending || !email.trim() || !displayName.trim()) && styles.disabled,
          ]}
        >
          {pending ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.primaryButtonText}>进入学生端</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

function StudentCourseWorkspace({ user, onLogout }: { user: User; onLogout: () => void }) {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [joinCode, setJoinCode] = useState("");
  const [joinVisible, setJoinVisible] = useState(false);
  const [coursesPending, setCoursesPending] = useState(true);
  const [conversationsPending, setConversationsPending] = useState(false);
  const [messagesPending, setMessagesPending] = useState(false);
  const [joinPending, setJoinPending] = useState(false);
  const [createPending, setCreatePending] = useState(false);
  const [sending, setSending] = useState(false);
  const [input, setInput] = useState("");
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const selectedCourse = courses.find((course) => course.id === selectedCourseId) ?? null;
  const selectedConversation =
    conversations.find((conversation) => conversation.id === selectedConversationId) ?? null;

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const items = await apiClient.listCourses(user.id);
        if (cancelled) {
          return;
        }
        setCourses(items);
        setSelectedCourseId((current) =>
          current && items.some((course) => course.id === current) ? current : (items[0]?.id ?? null),
        );
      } catch (requestError) {
        if (!cancelled) {
          setError(readableError(requestError));
        }
      } finally {
        if (!cancelled) {
          setCoursesPending(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user.id]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const courseId = selectedCourse?.id ?? null;
      setConversations([]);
      setSelectedConversationId(null);
      setMessages([]);

      if (!courseId) {
        setConversationsPending(false);
        return;
      }

      setConversationsPending(true);
      try {
        const items = await apiClient.listConversations(user.id, courseId);
        if (cancelled) {
          return;
        }
        setConversations(items);
        setSelectedConversationId(items[0]?.id ?? null);
      } catch (requestError) {
        if (!cancelled) {
          setError(readableError(requestError));
        }
      } finally {
        if (!cancelled) {
          setConversationsPending(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedCourse?.id, user.id]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!selectedConversationId) {
        setMessages([]);
        setMessagesPending(false);
        return;
      }

      setMessagesPending(true);
      try {
        const items = await apiClient.listMessages(user.id, selectedConversationId);
        if (!cancelled) {
          setMessages(items);
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(readableError(requestError));
        }
      } finally {
        if (!cancelled) {
          setMessagesPending(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedConversationId, user.id]);

  useEffect(() => {
    if (messages.length === 0 && !pendingQuestion && !streamingText) {
      return;
    }
    const timer = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(timer);
  }, [messages.length, pendingQuestion, streamingText]);

  async function handleJoinCourse() {
    const code = joinCode.trim().toUpperCase();
    if (!code) {
      return;
    }

    setJoinPending(true);
    setError(null);
    setNotice(null);
    try {
      const joined = await apiClient.joinCourse(user.id, code);
      setCourses((current) =>
        current.some((course) => course.id === joined.id) ? current : [joined, ...current],
      );
      setSelectedCourseId(joined.id);
      setJoinCode("");
      setJoinVisible(false);
      setNotice(`已加入课程“${joined.name}”。`);
    } catch (requestError) {
      setError(readableError(requestError));
    } finally {
      setJoinPending(false);
    }
  }

  async function handleCreateConversation() {
    if (!selectedCourse) {
      return null;
    }

    setCreatePending(true);
    setError(null);
    try {
      const created = await apiClient.createConversation(user.id, selectedCourse.id);
      setConversations((current) => [created, ...current]);
      setSelectedConversationId(created.id);
      setMessages([]);
      return created;
    } catch (requestError) {
      setError(readableError(requestError));
      return null;
    } finally {
      setCreatePending(false);
    }
  }

  async function handleSend() {
    const content = input.trim();
    if (!selectedCourse || !content || sending) {
      return;
    }

    setSending(true);
    setError(null);
    setNotice(null);
    setInput("");
    setPendingQuestion(content);
    setStreamingText("");

    try {
      const activeConversation =
        selectedConversation ??
        (await apiClient.createConversation(user.id, selectedCourse.id));

      if (!selectedConversation) {
        setConversations((current) => [activeConversation, ...current]);
        setSelectedConversationId(activeConversation.id);
      }

      for await (const event of apiClient.streamConversationMessage(user.id, activeConversation.id, {
        content,
        retrieval_limit: 5,
      })) {
        if (event.event === "text_delta") {
          setStreamingText((current) => current + event.data.delta);
        } else if (event.event === "error") {
          throw new Error(event.data.detail);
        }
      }

      const [refreshedMessages, refreshedConversations] = await Promise.all([
        apiClient.listMessages(user.id, activeConversation.id),
        apiClient.listConversations(user.id, selectedCourse.id),
      ]);
      setMessages(refreshedMessages);
      setConversations(refreshedConversations);
    } catch (requestError) {
      setError(readableError(requestError));
    } finally {
      setPendingQuestion(null);
      setStreamingText("");
      setSending(false);
    }
  }

  if (coursesPending) {
    return (
      <View style={[styles.loadingScreen, { paddingTop: insets.top }]}>
        <ActivityIndicator color={palette.primary} size="large" />
        <Text style={styles.loadingText}>正在加载课程...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.workspace}
    >
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.headerInner}>
          <View style={styles.identity}>
            <View style={styles.brandMark}>
              <Text style={styles.brandMarkText}>E</Text>
            </View>
            <View style={styles.identityCopy}>
              <Text style={styles.headerBrand}>ECHO 学生端</Text>
              <Text numberOfLines={1} style={styles.headerCourse}>
                {selectedCourse?.name ?? "尚未加入课程"}
              </Text>
            </View>
          </View>
          <View style={styles.headerActions}>
            <Text numberOfLines={1} style={styles.userName}>
              {user.display_name}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={onLogout}
              style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}
            >
              <Text style={styles.headerButtonText}>退出</Text>
            </Pressable>
          </View>
        </View>
      </View>

      {courses.length === 0 ? (
        <JoinCoursePanel
          code={joinCode}
          error={error}
          onChangeCode={setJoinCode}
          onJoin={handleJoinCourse}
          pending={joinPending}
        />
      ) : (
        <View style={styles.workspaceBody}>
          <View style={styles.courseStrip}>
            <ScrollView
              contentContainerStyle={styles.chipRow}
              horizontal
              showsHorizontalScrollIndicator={false}
            >
              {courses.map((course) => {
                const selected = course.id === selectedCourseId;
                return (
                  <Pressable
                    accessibilityRole="button"
                    disabled={sending}
                    key={course.id}
                    onPress={() => {
                      setSelectedCourseId(course.id);
                      setNotice(null);
                    }}
                    style={[
                      styles.courseChip,
                      selected && styles.courseChipSelected,
                      sending && styles.disabled,
                    ]}
                  >
                    <Text
                      numberOfLines={1}
                      style={[styles.courseChipText, selected && styles.courseChipTextSelected]}
                    >
                      {course.name}
                    </Text>
                  </Pressable>
                );
              })}
              <Pressable
                accessibilityRole="button"
                onPress={() => setJoinVisible((current) => !current)}
                style={[styles.addChip, joinVisible && styles.addChipActive]}
              >
                <Text style={styles.addChipText}>{joinVisible ? "取消加入" : "+ 加入课程"}</Text>
              </Pressable>
            </ScrollView>
          </View>

          {joinVisible ? (
            <View style={styles.inlineJoinPanel}>
              <TextInput
                autoCapitalize="characters"
                maxLength={8}
                onChangeText={setJoinCode}
                onSubmitEditing={() => void handleJoinCourse()}
                placeholder="输入 8 位课程码"
                placeholderTextColor="#98a1b2"
                style={styles.joinInput}
                value={joinCode}
              />
              <Pressable
                accessibilityRole="button"
                disabled={joinPending || joinCode.trim().length !== 8}
                onPress={() => void handleJoinCourse()}
                style={[
                  styles.joinButton,
                  (joinPending || joinCode.trim().length !== 8) && styles.disabled,
                ]}
              >
                {joinPending ? (
                  <ActivityIndicator color="#ffffff" size="small" />
                ) : (
                  <Text style={styles.joinButtonText}>加入</Text>
                )}
              </Pressable>
            </View>
          ) : null}

          {error ? <Text style={styles.errorBanner}>{error}</Text> : null}
          {notice ? <Text style={styles.noticeBanner}>{notice}</Text> : null}

          <View style={styles.conversationStrip}>
            <ScrollView
              contentContainerStyle={styles.chipRow}
              horizontal
              showsHorizontalScrollIndicator={false}
            >
              <Pressable
                accessibilityRole="button"
                disabled={createPending || sending}
                onPress={() => void handleCreateConversation()}
                style={[
                  styles.newConversationButton,
                  (createPending || sending) && styles.disabled,
                ]}
              >
                {createPending ? (
                  <ActivityIndicator color={palette.primary} size="small" />
                ) : (
                  <Text style={styles.newConversationText}>+ 新对话</Text>
                )}
              </Pressable>

              {conversations.map((conversation) => {
                const selected = conversation.id === selectedConversationId;
                return (
                  <Pressable
                    accessibilityRole="button"
                    disabled={sending}
                    key={conversation.id}
                    onPress={() => setSelectedConversationId(conversation.id)}
                    style={[
                      styles.conversationChip,
                      selected && styles.conversationChipSelected,
                      sending && styles.disabled,
                    ]}
                  >
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.conversationChipText,
                        selected && styles.conversationChipTextSelected,
                      ]}
                    >
                      {conversation.title || "新对话"}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          <ScrollView
            contentContainerStyle={[
              styles.messageList,
              { paddingBottom: Math.max(insets.bottom, 16) + 16 },
            ]}
            keyboardShouldPersistTaps="handled"
            ref={scrollRef}
          >
            {conversationsPending || messagesPending ? (
              <ActivityIndicator color={palette.primary} style={styles.messageLoader} />
            ) : null}

            {!conversationsPending &&
            !messagesPending &&
            messages.length === 0 &&
            !pendingQuestion &&
            !streamingText ? (
              <View style={styles.emptyConversation}>
                <Text style={styles.emptyConversationTitle}>从课程内容开始提问</Text>
                <Text style={styles.emptyConversationText}>
                  可以询问概念、例题步骤，或让 ECHO 给出提示。
                </Text>
              </View>
            ) : null}

            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}

            {pendingQuestion ? (
              <View style={styles.userBubble}>
                <Text style={styles.userBubbleText}>{pendingQuestion}</Text>
              </View>
            ) : null}

            {pendingQuestion ? (
              <AssistantBubble content={streamingText} pending={!streamingText} />
            ) : null}
          </ScrollView>

          <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, 10) }]}>
            <TextInput
              editable={!sending}
              maxLength={5000}
              multiline
              onChangeText={setInput}
              placeholder="向 ECHO 提问..."
              placeholderTextColor="#8b96a8"
              style={styles.composerInput}
              value={input}
            />
            <Pressable
              accessibilityRole="button"
              disabled={sending || !input.trim()}
              onPress={() => void handleSend()}
              style={[
                styles.sendButton,
                (sending || !input.trim()) && styles.disabled,
              ]}
            >
              {sending ? (
                <ActivityIndicator color="#ffffff" size="small" />
              ) : (
                <Text style={styles.sendButtonText}>发送</Text>
              )}
            </Pressable>
          </View>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

function JoinCoursePanel({
  code,
  error,
  onChangeCode,
  onJoin,
  pending,
}: {
  code: string;
  error: string | null;
  onChangeCode: (value: string) => void;
  onJoin: () => Promise<void>;
  pending: boolean;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.joinScreen, { paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.joinPanel}>
        <Text style={styles.joinEyebrow}>课程访问</Text>
        <Text style={styles.joinTitle}>加入一门课程</Text>
        <Text style={styles.joinDescription}>输入教师提供的 8 位课程码。</Text>

        <View style={styles.joinForm}>
          <TextInput
            autoCapitalize="characters"
            maxLength={8}
            onChangeText={onChangeCode}
            onSubmitEditing={() => void onJoin()}
            placeholder="例如：RDZC3H0B"
            placeholderTextColor="#98a1b2"
            style={styles.joinCodeInput}
            value={code}
          />
          <Pressable
            accessibilityRole="button"
            disabled={pending || code.trim().length !== 8}
            onPress={() => void onJoin()}
            style={[
              styles.primaryButton,
              (pending || code.trim().length !== 8) && styles.disabled,
            ]}
          >
            {pending ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.primaryButtonText}>加入课程</Text>
            )}
          </Pressable>
        </View>

        {error ? <Text style={styles.errorBanner}>{error}</Text> : null}
      </View>
    </View>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const assistant = message.role === "assistant";
  return (
    <View style={[styles.messageRow, assistant ? styles.messageRowAssistant : styles.messageRowUser]}>
      <View style={[styles.bubble, assistant ? styles.assistantBubble : styles.userBubble]}>
        <Text style={assistant ? styles.assistantBubbleText : styles.userBubbleText}>
          {message.content}
        </Text>
        {assistant && message.citations.length > 0 ? (
          <View style={styles.citationList}>
            {message.citations.map((citation, index) => (
              <View
                key={`${citation.chunk_id ?? citation.document_id ?? "source"}-${index}`}
                style={styles.citation}
              >
                <Text style={styles.citationTitle}>
                  资料 {index + 1} · 第 {citation.page_start}
                  {citation.page_end !== citation.page_start ? `-${citation.page_end}` : ""} 页
                </Text>
                <Text numberOfLines={3} style={styles.citationQuote}>
                  {citation.quote}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

function AssistantBubble({ content, pending }: { content: string; pending: boolean }) {
  return (
    <View style={[styles.messageRow, styles.messageRowAssistant]}>
      <View style={[styles.bubble, styles.assistantBubble]}>
        {pending ? (
          <ActivityIndicator color={palette.primary} size="small" />
        ) : (
          <Text style={styles.assistantBubbleText}>{content}</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  authScreen: {
    alignItems: "center",
    backgroundColor: palette.background,
    flex: 1,
    justifyContent: "center",
    padding: 20,
  },
  authPanel: {
    backgroundColor: palette.surface,
    borderColor: palette.border,
    borderRadius: 8,
    borderWidth: 1,
    maxWidth: 440,
    padding: 24,
    width: "100%",
  },
  brand: {
    color: palette.primary,
    fontSize: 14,
    fontWeight: "800",
  },
  authTitle: {
    color: palette.text,
    fontSize: 28,
    fontWeight: "700",
    marginTop: 8,
  },
  authDescription: {
    color: palette.textMuted,
    fontSize: 14,
    lineHeight: 22,
    marginTop: 8,
  },
  formGroup: {
    marginTop: 18,
  },
  label: {
    color: palette.text,
    fontSize: 13,
    fontWeight: "700",
    marginBottom: 6,
  },
  input: {
    backgroundColor: palette.surface,
    borderColor: palette.border,
    borderRadius: 8,
    borderWidth: 1,
    color: palette.text,
    fontSize: 16,
    minHeight: 46,
    paddingHorizontal: 12,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: palette.primary,
    borderRadius: 8,
    justifyContent: "center",
    marginTop: 20,
    minHeight: 46,
    paddingHorizontal: 18,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
  },
  errorBanner: {
    backgroundColor: "#fff3f2",
    borderColor: "#efb4af",
    borderRadius: 8,
    borderWidth: 1,
    color: palette.danger,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 14,
    padding: 10,
  },
  noticeBanner: {
    backgroundColor: "#eefbf3",
    borderColor: "#b4dfc1",
    borderRadius: 8,
    borderWidth: 1,
    color: palette.success,
    fontSize: 13,
    lineHeight: 20,
    marginHorizontal: 16,
    marginTop: 10,
    padding: 10,
  },
  loadingScreen: {
    alignItems: "center",
    backgroundColor: palette.background,
    flex: 1,
    justifyContent: "center",
  },
  loadingText: {
    color: palette.textMuted,
    fontSize: 14,
    marginTop: 12,
  },
  workspace: {
    backgroundColor: palette.background,
    flex: 1,
  },
  header: {
    backgroundColor: palette.surface,
    borderBottomColor: palette.border,
    borderBottomWidth: 1,
    paddingBottom: 10,
    paddingHorizontal: 16,
  },
  headerInner: {
    alignItems: "center",
    alignSelf: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    maxWidth: 960,
    width: "100%",
  },
  identity: {
    alignItems: "center",
    flexDirection: "row",
    flexShrink: 1,
    gap: 10,
  },
  brandMark: {
    alignItems: "center",
    backgroundColor: palette.text,
    borderRadius: 6,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  brandMarkText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "800",
  },
  identityCopy: {
    flexShrink: 1,
  },
  headerBrand: {
    color: palette.primary,
    fontSize: 11,
    fontWeight: "800",
  },
  headerCourse: {
    color: palette.text,
    fontSize: 16,
    fontWeight: "700",
    marginTop: 1,
    maxWidth: 220,
  },
  headerActions: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  userName: {
    color: palette.textMuted,
    fontSize: 13,
    maxWidth: 100,
  },
  headerButton: {
    borderColor: palette.border,
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 38,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  headerButtonText: {
    color: palette.text,
    fontSize: 13,
    fontWeight: "700",
  },
  workspaceBody: {
    alignSelf: "center",
    flex: 1,
    maxWidth: 960,
    width: "100%",
  },
  courseStrip: {
    backgroundColor: palette.surface,
    borderBottomColor: palette.border,
    borderBottomWidth: 1,
    paddingVertical: 10,
  },
  chipRow: {
    gap: 8,
    paddingHorizontal: 16,
  },
  courseChip: {
    borderColor: palette.border,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    maxWidth: 220,
    minHeight: 38,
    paddingHorizontal: 12,
  },
  courseChipSelected: {
    backgroundColor: palette.primarySoft,
    borderColor: palette.primary,
  },
  courseChipText: {
    color: palette.textMuted,
    fontSize: 13,
    fontWeight: "700",
  },
  courseChipTextSelected: {
    color: palette.primary,
  },
  addChip: {
    borderColor: palette.border,
    borderRadius: 8,
    borderStyle: "dashed",
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 38,
    paddingHorizontal: 12,
  },
  addChipActive: {
    backgroundColor: palette.surfaceMuted,
  },
  addChipText: {
    color: palette.textMuted,
    fontSize: 13,
    fontWeight: "700",
  },
  inlineJoinPanel: {
    alignItems: "center",
    backgroundColor: palette.surface,
    borderBottomColor: palette.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 10,
    padding: 12,
  },
  joinInput: {
    backgroundColor: palette.surface,
    borderColor: palette.border,
    borderRadius: 8,
    borderWidth: 1,
    color: palette.text,
    flex: 1,
    fontSize: 15,
    minHeight: 42,
    paddingHorizontal: 12,
  },
  joinButton: {
    alignItems: "center",
    backgroundColor: palette.primary,
    borderRadius: 8,
    justifyContent: "center",
    minHeight: 42,
    minWidth: 72,
    paddingHorizontal: 14,
  },
  joinButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
  },
  conversationStrip: {
    backgroundColor: palette.surface,
    borderBottomColor: palette.border,
    borderBottomWidth: 1,
    paddingVertical: 9,
  },
  newConversationButton: {
    backgroundColor: palette.primarySoft,
    borderColor: palette.primary,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 36,
    paddingHorizontal: 12,
  },
  newConversationText: {
    color: palette.primary,
    fontSize: 13,
    fontWeight: "700",
  },
  conversationChip: {
    borderColor: palette.border,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    maxWidth: 180,
    minHeight: 36,
    paddingHorizontal: 11,
  },
  conversationChipSelected: {
    backgroundColor: palette.surfaceMuted,
    borderColor: "#aeb8c7",
  },
  conversationChipText: {
    color: palette.textMuted,
    fontSize: 13,
  },
  conversationChipTextSelected: {
    color: palette.text,
    fontWeight: "700",
  },
  messageList: {
    flexGrow: 1,
    gap: 12,
    paddingHorizontal: 14,
    paddingTop: 16,
  },
  messageLoader: {
    marginTop: 32,
  },
  emptyConversation: {
    alignItems: "center",
    marginHorizontal: "auto",
    marginTop: 72,
    maxWidth: 420,
    paddingHorizontal: 24,
  },
  emptyConversationTitle: {
    color: palette.text,
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
  },
  emptyConversationText: {
    color: palette.textMuted,
    fontSize: 14,
    lineHeight: 22,
    marginTop: 8,
    textAlign: "center",
  },
  messageRow: {
    flexDirection: "row",
    width: "100%",
  },
  messageRowAssistant: {
    justifyContent: "flex-start",
  },
  messageRowUser: {
    justifyContent: "flex-end",
  },
  bubble: {
    borderRadius: 8,
    maxWidth: "86%",
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  assistantBubble: {
    backgroundColor: palette.surface,
    borderColor: palette.border,
    borderWidth: 1,
  },
  userBubble: {
    backgroundColor: palette.primary,
  },
  assistantBubbleText: {
    color: palette.text,
    fontSize: 15,
    lineHeight: 23,
  },
  userBubbleText: {
    color: "#ffffff",
    fontSize: 15,
    lineHeight: 23,
  },
  citationList: {
    borderTopColor: palette.border,
    borderTopWidth: 1,
    gap: 8,
    marginTop: 10,
    paddingTop: 10,
  },
  citation: {
    backgroundColor: palette.surfaceMuted,
    borderRadius: 6,
    padding: 8,
  },
  citationTitle: {
    color: palette.primary,
    fontSize: 12,
    fontWeight: "700",
  },
  citationQuote: {
    color: palette.textMuted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 3,
  },
  composer: {
    alignItems: "flex-end",
    backgroundColor: palette.surface,
    borderTopColor: palette.border,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 10,
  },
  composerInput: {
    backgroundColor: palette.surfaceMuted,
    borderColor: palette.border,
    borderRadius: 8,
    borderWidth: 1,
    color: palette.text,
    flex: 1,
    fontSize: 15,
    maxHeight: 120,
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  sendButton: {
    alignItems: "center",
    backgroundColor: palette.primary,
    borderRadius: 8,
    height: 44,
    justifyContent: "center",
    minWidth: 68,
  },
  sendButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
  },
  joinScreen: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    padding: 20,
  },
  joinPanel: {
    backgroundColor: palette.surface,
    borderColor: palette.border,
    borderRadius: 8,
    borderWidth: 1,
    maxWidth: 500,
    padding: 24,
    width: "100%",
  },
  joinEyebrow: {
    color: palette.primary,
    fontSize: 12,
    fontWeight: "800",
  },
  joinTitle: {
    color: palette.text,
    fontSize: 26,
    fontWeight: "700",
    marginTop: 6,
  },
  joinDescription: {
    color: palette.textMuted,
    fontSize: 14,
    lineHeight: 22,
    marginTop: 8,
  },
  joinForm: {
    marginTop: 20,
  },
  joinCodeInput: {
    backgroundColor: palette.surface,
    borderColor: palette.border,
    borderRadius: 8,
    borderWidth: 1,
    color: palette.text,
    fontSize: 20,
    fontWeight: "700",
    minHeight: 52,
    paddingHorizontal: 14,
    textAlign: "center",
  },
  pressed: {
    opacity: 0.78,
  },
  disabled: {
    opacity: 0.5,
  },
});
