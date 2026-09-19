import { SymbolView, type AndroidSymbol } from "expo-symbols";
import { useMemo } from "react";
import {
 Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { studentTheme } from "@/constants/student-theme";
import type { Conversation, Course } from "@echo/shared-types";

function startOfToday(): number {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

function conversationGroup(conversation: Conversation): "今天" | "昨天" | "更早" {
  const created = new Date(conversation.updated_at || conversation.created_at).getTime();
  const today = startOfToday();
  if (created >= today) return "今天";
  if (created >= today - 86_400_000) return "昨天";
  return "更早";
}

function conversationTimeLabel(conversation: Conversation): string {
  const date = new Date(conversation.updated_at || conversation.created_at);
  if (conversationGroup(conversation) === "今天") {
    return date.toLocaleTimeString("zh-CN", {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return date.toLocaleDateString("zh-CN", {
    month: "numeric",
    day: "numeric",
  });
}

export function ChatHeader({
  course,
  contextLabel,
  onBack,
  onOpenHistory,
}: {
  course: Course | null;
  contextLabel: string | null;
  onBack: () => void;
  onOpenHistory: () => void;
}) {
  return (
    <View style={styles.header}>
      <Pressable
        accessibilityLabel="返回"
        onPress={onBack}
        style={styles.headerIconButton}
      >
        <SymbolView
          name={{ android: "arrow_back", web: "arrow_back" }}
          size={22}
          tintColor={studentTheme.color.text}
        />
      </Pressable>
      <View style={styles.headerCopy}>
        <Text style={styles.headerTitle}>ECHO AI</Text>
        <Text numberOfLines={1} style={styles.headerContext}>
          {course?.name ?? "当前课程"}
          {contextLabel ? ` · ${contextLabel}` : ""}
        </Text>
      </View>
      <Pressable
        accessibilityLabel="学习历史"
        onPress={onOpenHistory}
        style={styles.headerIconButton}
      >
        <SymbolView
          name={{ android: "history", web: "history" }}
          size={21}
          tintColor={studentTheme.color.text}
        />
      </Pressable>
    </View>
  );
}

export function ConversationDrawer({
  visible,
  conversations,
  courseName,
  activeConversationId,
  loading,
  onClose,
  onSelect,
  onNewConversation,
}: {
  visible: boolean;
  courseName: string;
  conversations: Conversation[];
  activeConversationId: string | null;
  loading: boolean;
  onClose: () => void;
  onSelect: (conversationId: string) => void;
  onNewConversation: () => void;
}) {
  const insets = useSafeAreaInsets();
  const grouped = useMemo(
    () => ({
      今天: conversations.filter((item) => conversationGroup(item) === "今天"),
      昨天: conversations.filter((item) => conversationGroup(item) === "昨天"),
      更早: conversations.filter((item) => conversationGroup(item) === "更早"),
    }),
    [conversations],
  );

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.drawerOverlay}>
        <View style={[styles.drawer, { paddingTop: insets.top + 8 }]}>
          <View style={styles.drawerHeader}>
            <View style={styles.drawerHeading}>
              <Text style={styles.drawerEyebrow}>学习历史</Text>
              <Text numberOfLines={1} style={styles.drawerCourse}>
                {courseName}
              </Text>
            </View>
            <Pressable
              accessibilityLabel="关闭学习历史"
              onPress={onClose}
              style={styles.headerIconButton}
            >
              <SymbolView
                name={{ android: "close", web: "close" }}
                size={20}
                tintColor={studentTheme.color.text}
              />
            </Pressable>
          </View>
          <Pressable
            accessibilityLabel="开始新对话"
            onPress={onNewConversation}
            style={({ pressed }) => [
              styles.newConversationButton,
              pressed && styles.pressed,
            ]}
          >
            <View style={styles.newConversationIcon}>
              <SymbolView
                name={{ android: "add", web: "add" }}
                size={19}
                tintColor={studentTheme.color.primary}
              />
            </View>
            <View style={styles.newConversationCopy}>
              <Text style={styles.newConversationText}>新对话</Text>
              <Text style={styles.newConversationHint}>从当前课程重新开始</Text>
            </View>
            <SymbolView
              name={{ android: "chevron_right", web: "chevron_right" }}
              size={20}
              tintColor={studentTheme.color.textSubtle}
            />
          </Pressable>

          <ScrollView contentContainerStyle={styles.drawerList} showsVerticalScrollIndicator={false}>
            {loading ? <ConversationSkeleton /> : null}
            {(["今天", "昨天", "更早"] as const).map((group) =>
              grouped[group].length > 0 ? (
                <View key={group} style={styles.drawerGroup}>
                  <Text style={styles.drawerGroupTitle}>{group}</Text>
                  {grouped[group].map((conversation) => {
                    const active = conversation.id === activeConversationId;
                    return (
                      <Pressable
                        accessibilityLabel={`打开会话 ${conversation.title || "未命名对话"}`}
                        key={conversation.id}
                        onPress={() => onSelect(conversation.id)}
                        style={({ pressed }) => [
                          styles.conversationItem,
                          active && styles.conversationItemActive,
                          pressed && styles.pressed,
                        ]}
                      >
                        <View
                          style={[
                            styles.conversationIndicator,
                            active && styles.conversationIndicatorActive,
                          ]}
                        />
                        <View
                          style={[
                            styles.conversationIcon,
                            active && styles.conversationIconActive,
                          ]}
                        >
                          <SymbolView
                            name={{ android: "chat_bubble", web: "chat_bubble" }}
                            size={16}
                            tintColor={
                              active
                                ? studentTheme.color.primary
                                : studentTheme.color.textMuted
                            }
                          />
                        </View>
                        <View style={styles.conversationCopy}>
                          <Text numberOfLines={1} style={styles.conversationTitle}>
                            {conversation.title || "未命名对话"}
                          </Text>
                          <Text style={styles.conversationTime}>
                            {conversationTimeLabel(conversation)}
                          </Text>
                        </View>
                        {active ? (
                          <View style={styles.currentBadge}>
                            <Text style={styles.currentBadgeText}>当前</Text>
                          </View>
                        ) : null}
                      </Pressable>
                    );
                  })}
                </View>
              ) : null,
            )}
            {!loading && conversations.length === 0 ? (
              <View style={styles.drawerEmpty}>
                <Text style={styles.drawerEmptyTitle}>还没有学习记录</Text>
                <Text style={styles.drawerEmptyText}>提一个问题，ECHO 会从这里开始记录。</Text>
              </View>
            ) : null}
          </ScrollView>
        </View>
        <Pressable onPress={onClose} style={styles.drawerBackdrop} />
      </View>
    </Modal>
  );
}

function ConversationSkeleton() {
  return (
    <View style={styles.drawerGroup}>
      <View style={styles.skeletonGroupTitle} />
      {[0, 1, 2].map((item) => (
        <View key={item} style={styles.skeletonConversation}>
          <View style={styles.skeletonConversationIcon} />
          <View style={styles.skeletonConversationCopy}>
            <View style={styles.skeletonConversationTitle} />
            <View style={styles.skeletonConversationMeta} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function ChatComposer({
  value,
  onChange,
  onSend,
  onStop,
  streaming,
  disabled,
  onFocusChange,
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  streaming: boolean;
  disabled: boolean;
  onFocusChange?: (focused: boolean) => void;
}) {
  const canSend = value.trim().length > 0 && !disabled && !streaming;
  return (
    <View style={styles.composer}>
      <View
        style={[
          styles.composerInputShell,
          disabled && styles.composerInputShellOffline,
        ]}
      >
        <TextInput
          blurOnSubmit={false}
          multiline
          onChangeText={onChange}
          onFocus={() => onFocusChange?.(true)}
          onBlur={() => onFocusChange?.(false)}
          placeholder={disabled ? "连接恢复后可继续提问" : "继续追问或输入你的问题..."}
          placeholderTextColor={studentTheme.color.textSubtle}
          style={styles.composerInput}
          value={value}
        />
      </View>
      <Pressable
        accessibilityLabel={streaming ? "停止生成" : "发送消息"}
        disabled={!streaming && !canSend}
        onPress={streaming ? onStop : onSend}
        style={({ pressed }) => [
          styles.sendButton,
          streaming && styles.stopButton,
          !streaming && !canSend && styles.disabled,
          pressed && styles.pressed,
        ]}
      >
        <SymbolView
          name={{
            android: streaming ? "stop" : "arrow_upward",
            web: streaming ? "stop" : "arrow_upward",
          }}
          size={21}
          tintColor="#ffffff"
        />
      </Pressable>
    </View>
  );
}

export function NewContentButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      accessibilityLabel="滚动到新内容"
      onPress={onPress}
      style={({ pressed }) => [
        styles.newContentButton,
        pressed && styles.pressed,
      ]}
    >
      <SymbolView
        name={{ android: "arrow_downward", web: "arrow_downward" }}
        size={16}
        tintColor={studentTheme.color.primary}
      />
      <Text style={styles.newContentText}>有新内容</Text>
    </Pressable>
  );
}

export function ContextBanner({ label }: { label: string }) {
  return (
    <View style={styles.contextBanner}>
      <View style={styles.contextIcon}>
        <SymbolView
          name={{ android: "school", web: "school" }}
          size={15}
          tintColor={studentTheme.color.primary}
        />
      </View>
      <Text numberOfLines={1} style={styles.contextText}>
        正在学习：{label}
      </Text>
    </View>
  );
}

export function ChatReconnectBanner({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={styles.reconnectBanner}>
      <SymbolView
        name={{ android: "info", web: "info" }}
        size={17}
        tintColor={studentTheme.color.warning}
      />
      <Text style={styles.reconnectText}>当前离线，已显示缓存内容</Text>
      <Pressable
        accessibilityLabel="重新连接"
        onPress={onRetry}
        style={({ pressed }) => [
          styles.reconnectButton,
          pressed && styles.pressed,
        ]}
      >
        <Text style={styles.reconnectButtonText}>重试</Text>
      </Pressable>
    </View>
  );
}

export function ChatEmptyState({
  courseName,
  onSelectSuggestion,
}: {
  courseName: string;
  onSelectSuggestion: (suggestion: string) => void;
}) {
  const suggestions: { icon: AndroidSymbol; label: string; prompt: string }[] = [
    { icon: "forum", label: "解释一个概念", prompt: "帮我解释一个课程概念" },
    {
      icon: "format_list_bulleted",
      label: "帮我梳理章节",
      prompt: "帮我梳理这一章的学习重点",
    },
    {
      icon: "lightbulb",
      label: "给我一点提示",
      prompt: "给我一个学习这个知识点的提示",
    },
  ];

  return (
    <View style={styles.emptyState}>
      <View style={styles.emptyAvatar}>
        <Image
          resizeMode="cover"
          source={require("@/assets/images/student/ai-support.png")}
          style={styles.emptyAvatarImage}
        />
      </View>
      <Text style={styles.emptyTitle}>你好，我是 ECHO</Text>
      <Text style={styles.emptyDescription}>
        我会结合《{courseName}》的课程资料和老师的教学要求陪你学习。
      </Text>
      <View style={styles.suggestionList}>
        {suggestions.map((suggestion) => (
          <Pressable
            accessibilityLabel={suggestion.label}
            key={suggestion.label}
            onPress={() => onSelectSuggestion(suggestion.prompt)}
            style={({ pressed }) => [
              styles.suggestionButton,
              pressed && styles.pressed,
            ]}
          >
            <View style={styles.suggestionIcon}>
              <SymbolView
                name={{ android: suggestion.icon, web: suggestion.icon }}
                size={16}
                tintColor={studentTheme.color.primary}
              />
            </View>
            <Text style={styles.suggestionText}>{suggestion.label}</Text>
            <SymbolView
              name={{ android: "arrow_forward", web: "arrow_forward" }}
              size={16}
              tintColor={studentTheme.color.textSubtle}
            />
          </Pressable>
        ))}
      </View>
      <Text style={styles.emptyHint}>选择示例会填入输入框，不会自动发送。</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderBottomColor: studentTheme.color.divider,
    borderBottomWidth: 1,
    flexDirection: "row",
    minHeight: 58,
    paddingHorizontal: 6,
  },
  headerIconButton: {
    alignItems: "center",
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  headerCopy: {
    alignItems: "center",
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 8,
  },
  headerTitle: {
    color: studentTheme.color.text,
    fontSize: 17,
    fontWeight: "800",
  },
  headerContext: {
    color: studentTheme.color.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  drawerOverlay: {
    flex: 1,
    flexDirection: "row",
  },
  drawerBackdrop: {
    backgroundColor: "rgba(13, 27, 45, 0.34)",
    flex: 1,
  },
  drawer: {
    backgroundColor: "#ffffff",
    maxWidth: 340,
    paddingBottom: 16,
    paddingTop: 14,
    width: "84%",
  },
  drawerHeader: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 16,
  },
  drawerHeading: {
    flex: 1,
    minWidth: 0,
  },
  drawerEyebrow: {
    color: studentTheme.color.textMuted,
    fontSize: 11,
    fontWeight: "800",
  },
  drawerCourse: {
    color: studentTheme.color.text,
    fontSize: 20,
    fontWeight: "800",
    marginTop: 4,
  },
  drawerTitle: {
    color: studentTheme.color.text,
    fontSize: 20,
    fontWeight: "900",
  },
  newConversationButton: {
    alignItems: "center",
    backgroundColor: studentTheme.color.primarySoft,
    borderColor: studentTheme.color.primaryBorder,
    borderRadius: studentTheme.radius.card,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 16,
    minHeight: 58,
    paddingHorizontal: 12,
  },
  newConversationText: {
    color: studentTheme.color.primary,
    fontSize: 14,
    fontWeight: "800",
  },
  newConversationIcon: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 10,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  newConversationCopy: {
    flex: 1,
  },
  newConversationHint: {
    color: studentTheme.color.textMuted,
    fontSize: 11,
    marginTop: 3,
  },
  drawerSearch: {
    alignItems: "center",
    backgroundColor: "#f5f8fc",
    borderColor: studentTheme.color.border,
    borderRadius: studentTheme.radius.medium,
    borderWidth: 1,
    flexDirection: "row",
    gap: 7,
    marginHorizontal: 14,
    marginTop: 12,
    minHeight: 42,
    paddingHorizontal: 10,
  },
  drawerSearchInput: {
    color: studentTheme.color.text,
    flex: 1,
    fontSize: 13,
    paddingVertical: 8,
  },
  drawerList: {
    paddingBottom: 30,
    paddingHorizontal: 16,
    paddingTop: 18,
  },
  drawerLoading: {
    marginTop: 24,
  },
  drawerGroup: {
    marginBottom: 16,
  },
  drawerGroupTitle: {
    color: studentTheme.color.textSubtle,
    fontSize: 11,
    fontWeight: "800",
    marginBottom: 6,
  },
  conversationItem: {
    alignItems: "center",
    borderRadius: studentTheme.radius.card,
    flexDirection: "row",
    gap: 9,
    minHeight: 58,
    paddingHorizontal: 8,
    position: "relative",
  },
  conversationItemActive: {
    backgroundColor: studentTheme.color.primarySoft,
  },
  conversationIcon: {
    alignItems: "center",
    backgroundColor: studentTheme.color.surfaceSoft,
    borderRadius: 10,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  conversationIconActive: {
    backgroundColor: "#ffffff",
  },
  conversationIndicator: {
    backgroundColor: "transparent",
    borderRadius: studentTheme.radius.pill,
    height: 24,
    width: 3,
  },
  conversationIndicatorActive: {
    backgroundColor: studentTheme.color.primary,
  },
  conversationCopy: {
    flex: 1,
    minWidth: 0,
  },
  conversationTitle: {
    color: studentTheme.color.text,
    fontSize: 13,
    fontWeight: "800",
  },
  conversationTime: {
    color: studentTheme.color.textMuted,
    fontSize: 10,
    marginTop: 3,
  },
  currentBadge: {
    backgroundColor: "#ffffff",
    borderRadius: studentTheme.radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  currentBadgeText: {
    color: studentTheme.color.primary,
    fontSize: 10,
    fontWeight: "800",
  },
  drawerEmpty: {
    alignItems: "center",
    paddingHorizontal: 18,
    paddingTop: 36,
  },
  drawerEmptyTitle: {
    color: studentTheme.color.text,
    fontSize: 15,
    fontWeight: "800",
  },
  drawerEmptyText: {
    color: studentTheme.color.textMuted,
    fontSize: 12,
    lineHeight: 19,
    marginTop: 7,
    textAlign: "center",
  },
  skeletonGroupTitle: {
    backgroundColor: studentTheme.color.divider,
    borderRadius: 4,
    height: 10,
    marginBottom: 12,
    width: 42,
  },
  skeletonConversation: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    minHeight: 58,
  },
  skeletonConversationIcon: {
    backgroundColor: studentTheme.color.surfaceSoft,
    borderRadius: 10,
    height: 34,
    width: 34,
  },
  skeletonConversationCopy: {
    flex: 1,
    gap: 7,
  },
  skeletonConversationTitle: {
    backgroundColor: studentTheme.color.divider,
    borderRadius: 4,
    height: 11,
    width: "72%",
  },
  skeletonConversationMeta: {
    backgroundColor: studentTheme.color.surfaceSoft,
    borderRadius: 4,
    height: 9,
    width: "34%",
  },
  composer: {
    alignItems: "flex-end",
    backgroundColor: "#ffffff",
    borderTopColor: studentTheme.color.divider,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 9,
    paddingBottom: 8,
    paddingHorizontal: 12,
    paddingTop: 9,
  },
  composerInputShell: {
    backgroundColor: studentTheme.color.surfaceSoft,
    borderColor: studentTheme.color.border,
    borderRadius: 21,
    borderWidth: 1,
    flex: 1,
    overflow: "hidden",
  },
  composerInputShellOffline: {
    backgroundColor: "#f8fafc",
  },
  composerInput: {
    color: studentTheme.color.text,
    fontSize: 14,
    maxHeight: 112,
    minHeight: 42,
    paddingHorizontal: 15,
    paddingVertical: 10,
    textAlignVertical: "top",
  },
  sendButton: {
    alignItems: "center",
    backgroundColor: studentTheme.color.primary,
    borderRadius: 21,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  stopButton: {
    backgroundColor: studentTheme.color.danger,
  },
  disabled: {
    opacity: 0.38,
  },
  pressed: {
    opacity: 0.74,
  },
  newContentButton: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: "#ffffff",
    borderColor: studentTheme.color.primaryBorder,
    borderWidth: 1,
    borderRadius: studentTheme.radius.pill,
    flexDirection: "row",
    gap: 5,
    minHeight: 36,
    paddingHorizontal: 13,
    position: "absolute",
    bottom: 12,
    shadowColor: "#17345c",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
  },
  newContentText: {
    color: studentTheme.color.primary,
    fontSize: 11,
    fontWeight: "800",
  },
  contextBanner: {
    alignItems: "center",
    backgroundColor: studentTheme.color.learningSoft,
    borderBottomColor: studentTheme.color.learningBorder,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 7,
    minHeight: 36,
    paddingHorizontal: 14,
  },
  contextIcon: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 8,
    height: 24,
    justifyContent: "center",
    width: 24,
  },
  contextText: {
    color: studentTheme.color.primaryDark,
    flex: 1,
    fontSize: 12,
    fontWeight: "700",
  },
  reconnectBanner: {
    alignItems: "center",
    backgroundColor: studentTheme.color.warningSoft,
    borderBottomColor: studentTheme.color.warningBorder,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 8,
    minHeight: 40,
    paddingHorizontal: 14,
  },
  reconnectText: {
    color: studentTheme.color.warning,
    flex: 1,
    fontSize: 12,
    fontWeight: "700",
  },
  reconnectButton: {
    borderColor: studentTheme.color.warningBorder,
    borderRadius: studentTheme.radius.pill,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  reconnectButtonText: {
    color: studentTheme.color.warning,
    fontSize: 11,
    fontWeight: "800",
  },
  emptyState: {
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 18,
  },
  emptyAvatar: {
    backgroundColor: studentTheme.color.primarySoft,
    borderColor: studentTheme.color.primaryBorder,
    borderRadius: 28,
    borderWidth: 1,
    height: 64,
    overflow: "hidden",
    width: 64,
  },
  emptyAvatarImage: {
    height: "100%",
    width: "100%",
  },
  emptyTitle: {
    color: studentTheme.color.text,
    fontSize: 21,
    fontWeight: "800",
    marginTop: 16,
  },
  emptyDescription: {
    color: studentTheme.color.textMuted,
    fontSize: 13,
    lineHeight: 21,
    marginTop: 8,
    maxWidth: 310,
    textAlign: "center",
  },
  suggestionList: {
    alignSelf: "stretch",
    gap: 8,
    marginTop: 20,
  },
  suggestionButton: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: studentTheme.color.border,
    borderRadius: studentTheme.radius.card,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: 50,
    paddingHorizontal: 12,
  },
  suggestionIcon: {
    alignItems: "center",
    backgroundColor: studentTheme.color.primarySoft,
    borderRadius: 9,
    height: 30,
    justifyContent: "center",
    width: 30,
  },
  suggestionText: {
    color: studentTheme.color.text,
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
  },
  emptyHint: {
    color: studentTheme.color.textSubtle,
    fontSize: 11,
    marginTop: 14,
  },
});
