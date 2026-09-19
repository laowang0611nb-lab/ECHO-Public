import { SymbolView } from "expo-symbols";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

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

export function ChatHeader({
  course,
  contextLabel,
  onBack,
  onOpenHistory,
  onNewConversation,
}: {
  course: Course | null;
  contextLabel: string | null;
  onBack: () => void;
  onOpenHistory: () => void;
  onNewConversation: () => void;
}) {
  return (
    <View style={styles.header}>
      <Pressable onPress={onBack} style={styles.headerIconButton}>
        <SymbolView
          name={{ android: "arrow_back", web: "arrow_back" }}
          size={22}
          tintColor={studentTheme.color.text}
        />
      </Pressable>
      <View style={styles.headerCopy}>
        <Text style={styles.headerTitle}>AI 对话</Text>
        <Text numberOfLines={1} style={styles.headerContext}>
          {course?.name ?? "当前课程"}
          {contextLabel ? ` · ${contextLabel}` : ""}
        </Text>
      </View>
      <Pressable onPress={onOpenHistory} style={styles.headerIconButton}>
        <SymbolView
          name={{ android: "history", web: "history" }}
          size={21}
          tintColor={studentTheme.color.text}
        />
      </Pressable>
      <Pressable onPress={onNewConversation} style={styles.headerIconButton}>
        <SymbolView
          name={{ android: "add", web: "add" }}
          size={23}
          tintColor={studentTheme.color.primary}
        />
      </Pressable>
    </View>
  );
}

export function ConversationDrawer({
  visible,
  conversations,
  activeConversationId,
  loading,
  onClose,
  onSelect,
  onNewConversation,
}: {
  visible: boolean;
  conversations: Conversation[];
  activeConversationId: string | null;
  loading: boolean;
  onClose: () => void;
  onSelect: (conversationId: string) => void;
  onNewConversation: () => void;
}) {
  const [query, setQuery] = useState("");
  const grouped = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    const matches = normalized
      ? conversations.filter((conversation) =>
          (conversation.title ?? "未命名对话").toLocaleLowerCase().includes(normalized),
        )
      : conversations;
    return {
      今天: matches.filter((item) => conversationGroup(item) === "今天"),
      昨天: matches.filter((item) => conversationGroup(item) === "昨天"),
      更早: matches.filter((item) => conversationGroup(item) === "更早"),
    };
  }, [conversations, query]);

  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.drawerOverlay}>
        <View style={styles.drawer}>
          <View style={styles.drawerHeader}>
            <Text style={styles.drawerTitle}>历史对话</Text>
            <Pressable onPress={onClose} style={styles.headerIconButton}>
              <SymbolView
                name={{ android: "close", web: "close" }}
                size={20}
                tintColor={studentTheme.color.text}
              />
            </Pressable>
          </View>
          <Pressable onPress={onNewConversation} style={styles.newConversationButton}>
            <SymbolView
              name={{ android: "add", web: "add" }}
              size={19}
              tintColor={studentTheme.color.primary}
            />
            <Text style={styles.newConversationText}>新对话</Text>
          </Pressable>
          <View style={styles.drawerSearch}>
            <SymbolView
              name={{ android: "search", web: "search" }}
              size={17}
              tintColor={studentTheme.color.textMuted}
            />
            <TextInput
              onChangeText={setQuery}
              placeholder="搜索会话"
              placeholderTextColor="#8b96a8"
              style={styles.drawerSearchInput}
              value={query}
            />
          </View>
          <ScrollView contentContainerStyle={styles.drawerList}>
            {loading ? (
              <ActivityIndicator color={studentTheme.color.primary} style={styles.drawerLoading} />
            ) : null}
            {(["今天", "昨天", "更早"] as const).map((group) =>
              grouped[group].length > 0 ? (
                <View key={group} style={styles.drawerGroup}>
                  <Text style={styles.drawerGroupTitle}>{group}</Text>
                  {grouped[group].map((conversation) => (
                    <Pressable
                      key={conversation.id}
                      onPress={() => onSelect(conversation.id)}
                      style={[
                        styles.conversationItem,
                        conversation.id === activeConversationId && styles.conversationItemActive,
                      ]}
                    >
                      <View style={styles.conversationIcon}>
                        <SymbolView
                          name={{ android: "chat_bubble", web: "chat_bubble" }}
                          size={16}
                          tintColor={
                            conversation.id === activeConversationId
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
                          {new Date(conversation.updated_at).toLocaleDateString("zh-CN")}
                        </Text>
                      </View>
                    </Pressable>
                  ))}
                </View>
              ) : null,
            )}
            {!loading && conversations.length === 0 ? (
              <Text style={styles.drawerEmpty}>还没有历史对话</Text>
            ) : null}
          </ScrollView>
        </View>
        <Pressable onPress={onClose} style={styles.drawerBackdrop} />
      </View>
    </Modal>
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
      <TextInput
        editable={!disabled}
        multiline
        onChangeText={onChange}
        onFocus={() => onFocusChange?.(true)}
        onBlur={() => onFocusChange?.(false)}
        placeholder={disabled ? "连接恢复后可继续提问" : "继续追问或输入你的问题..."}
        placeholderTextColor="#8b96a8"
        style={styles.composerInput}
        value={value}
      />
      <Pressable
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
    <Pressable onPress={onPress} style={styles.newContentButton}>
      <SymbolView
        name={{ android: "arrow_downward", web: "arrow_downward" }}
        size={16}
        tintColor="#ffffff"
      />
      <Text style={styles.newContentText}>新内容</Text>
    </Pressable>
  );
}

export function ContextBanner({ label }: { label: string }) {
  return (
    <View style={styles.contextBanner}>
      <SymbolView
        name={{ android: "school", web: "school" }}
        size={15}
        tintColor={studentTheme.color.primary}
      />
      <Text numberOfLines={1} style={styles.contextText}>
        正在学习：{label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderBottomColor: studentTheme.color.border,
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
    flex: 1,
    minWidth: 0,
  },
  headerTitle: {
    color: studentTheme.color.text,
    fontSize: 17,
    fontWeight: "900",
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
    backgroundColor: "rgba(13, 27, 45, 0.42)",
    flex: 1,
  },
  drawer: {
    backgroundColor: "#ffffff",
    paddingBottom: 20,
    paddingTop: 12,
    width: "82%",
    maxWidth: 340,
  },
  drawerHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 12,
  },
  drawerTitle: {
    color: studentTheme.color.text,
    fontSize: 20,
    fontWeight: "900",
  },
  newConversationButton: {
    alignItems: "center",
    backgroundColor: studentTheme.color.surfaceBlue,
    borderRadius: studentTheme.radius.medium,
    flexDirection: "row",
    gap: 8,
    marginHorizontal: 14,
    marginTop: 14,
    minHeight: 44,
    paddingHorizontal: 13,
  },
  newConversationText: {
    color: studentTheme.color.primary,
    fontSize: 14,
    fontWeight: "900",
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
    paddingHorizontal: 14,
    paddingTop: 12,
  },
  drawerLoading: {
    marginTop: 24,
  },
  drawerGroup: {
    gap: 7,
    marginBottom: 14,
  },
  drawerGroupTitle: {
    color: studentTheme.color.textMuted,
    fontSize: 11,
    fontWeight: "800",
  },
  conversationItem: {
    alignItems: "center",
    borderRadius: studentTheme.radius.medium,
    flexDirection: "row",
    gap: 9,
    minHeight: 52,
    paddingHorizontal: 10,
  },
  conversationItemActive: {
    backgroundColor: studentTheme.color.surfaceBlue,
  },
  conversationIcon: {
    alignItems: "center",
    height: 30,
    justifyContent: "center",
    width: 30,
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
  drawerEmpty: {
    color: studentTheme.color.textMuted,
    fontSize: 13,
    marginTop: 28,
    textAlign: "center",
  },
  composer: {
    alignItems: "flex-end",
    backgroundColor: "#ffffff",
    borderTopColor: studentTheme.color.border,
    borderTopWidth: 1,
    flexDirection: "row",
    gap: 9,
    paddingHorizontal: 12,
    paddingTop: 9,
  },
  composerInput: {
    backgroundColor: "#f4f8fd",
    borderColor: studentTheme.color.border,
    borderRadius: 20,
    borderWidth: 1,
    color: studentTheme.color.text,
    flex: 1,
    fontSize: 14,
    maxHeight: 110,
    minHeight: 42,
    paddingHorizontal: 14,
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
    opacity: 0.42,
  },
  pressed: {
    opacity: 0.76,
  },
  newContentButton: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: studentTheme.color.primary,
    borderRadius: studentTheme.radius.pill,
    flexDirection: "row",
    gap: 5,
    minHeight: 34,
    paddingHorizontal: 13,
    position: "absolute",
    bottom: 12,
    shadowColor: "#17345c",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
  },
  newContentText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "900",
  },
  contextBanner: {
    alignItems: "center",
    backgroundColor: "#f1f7ff",
    flexDirection: "row",
    gap: 7,
    minHeight: 34,
    paddingHorizontal: 14,
  },
  contextText: {
    color: studentTheme.color.primary,
    flex: 1,
    fontSize: 11,
    fontWeight: "800",
  },
});
