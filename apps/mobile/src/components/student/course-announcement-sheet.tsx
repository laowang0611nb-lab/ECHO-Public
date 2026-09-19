import { useQuery, useQueryClient } from "@tanstack/react-query";
import { SymbolView } from "expo-symbols";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmptyState, ErrorState } from "@/components/states/page-state";
import { studentTheme } from "@/constants/student-theme";
import { apiClient } from "@/lib/api-client";
import { useStudentSession } from "@/providers/student-session-provider";

function formatPublishedAt(value: string | null): string {
  if (!value) return "";
  return new Date(value).toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function CourseAnnouncementSheet({
  courseId,
  onClose,
  visible,
}: {
  courseId: string;
  onClose: () => void;
  visible: boolean;
}) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { user } = useStudentSession();
  const query = useQuery({
    queryKey: ["student-course-announcements", user?.id ?? "", courseId],
    queryFn: () =>
      apiClient.listAnnouncements(user?.id ?? "", courseId, {
        includeDrafts: false,
        limit: 30,
      }),
    enabled: Boolean(visible && user?.id && courseId),
  });

  async function markRead(announcementId: string, isRead: boolean) {
    if (isRead || !user?.id) return;
    await apiClient.markAnnouncementRead(user.id, courseId, announcementId);
    await queryClient.invalidateQueries({
      queryKey: ["student-course-announcements", user.id, courseId],
    });
  }

  const unreadCount = (query.data?.items ?? []).filter(
    (item) => !item.is_read,
  ).length;

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>课程公告</Text>
              <Text style={styles.subtitle}>
                {unreadCount > 0 ? `${unreadCount} 条未读` : "已了解全部公告"}
              </Text>
            </View>
            <Pressable
              accessibilityLabel="关闭课程公告"
              onPress={onClose}
              style={styles.closeButton}
            >
              <SymbolView
                name={{ android: "close", web: "close" }}
                size={19}
                tintColor={studentTheme.color.text}
              />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
          >
            {query.isLoading ? (
              <View style={styles.loading}>
                <ActivityIndicator color={studentTheme.color.primary} />
                <Text style={styles.loadingText}>正在读取课程公告</Text>
              </View>
            ) : null}

            {query.isError ? (
              <ErrorState
                description="暂时无法加载课程公告，请稍后重试。"
                onAction={() => void query.refetch()}
                title="公告加载失败"
              />
            ) : null}

            {query.data && query.data.items.length === 0 ? (
              <EmptyState
                description="老师发布公告后，会在这里显示。"
                title="暂无课程公告"
              />
            ) : null}

            {query.data?.items.map((announcement) => (
              <Pressable
                key={announcement.id}
                onPress={() => void markRead(announcement.id, announcement.is_read)}
                style={({ pressed }) => [
                  styles.item,
                  !announcement.is_read && styles.itemUnread,
                  pressed && styles.pressed,
                ]}
              >
                <View style={styles.itemTop}>
                  <View
                    style={[
                      styles.dot,
                      announcement.is_read && styles.dotRead,
                    ]}
                  />
                  <Text style={styles.itemTitle}>{announcement.title}</Text>
                  <Text style={styles.itemTime}>
                    {formatPublishedAt(announcement.published_at)}
                  </Text>
                </View>
                <Text style={styles.itemContent}>{announcement.content}</Text>
                {announcement.is_read ? (
                  <Text style={styles.readLabel}>已读</Text>
                ) : (
                  <Text style={styles.unreadLabel}>点击标记为已读</Text>
                )}
              </Pressable>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    backgroundColor: "rgba(12, 28, 48, 0.38)",
    flex: 1,
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: studentTheme.color.background,
    borderTopLeftRadius: studentTheme.radius.sheet,
    borderTopRightRadius: studentTheme.radius.sheet,
    maxHeight: "82%",
    paddingHorizontal: 18,
    paddingTop: 10,
  },
  handle: {
    alignSelf: "center",
    backgroundColor: "#d7e0eb",
    borderRadius: studentTheme.radius.pill,
    height: 4,
    width: 40,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 14,
  },
  title: {
    color: studentTheme.color.text,
    fontSize: 18,
    fontWeight: "900",
  },
  subtitle: {
    color: studentTheme.color.textMuted,
    fontSize: 11,
    marginTop: 3,
  },
  closeButton: {
    alignItems: "center",
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  content: {
    gap: 11,
    paddingBottom: 24,
    paddingTop: 16,
  },
  loading: {
    alignItems: "center",
    gap: 10,
    justifyContent: "center",
    minHeight: 220,
  },
  loadingText: {
    color: studentTheme.color.textMuted,
    fontSize: 12,
  },
  item: {
    backgroundColor: studentTheme.color.surface,
    borderColor: studentTheme.color.border,
    borderRadius: studentTheme.radius.card,
    borderWidth: 1,
    padding: 15,
  },
  itemUnread: {
    borderColor: studentTheme.color.primaryBorder,
  },
  itemTop: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  dot: {
    backgroundColor: studentTheme.color.primary,
    borderRadius: 4,
    height: 8,
    width: 8,
  },
  dotRead: {
    backgroundColor: studentTheme.color.textSubtle,
  },
  itemTitle: {
    color: studentTheme.color.text,
    flex: 1,
    fontSize: 14,
    fontWeight: "900",
  },
  itemTime: {
    color: studentTheme.color.textMuted,
    fontSize: 10,
  },
  itemContent: {
    color: studentTheme.color.textMuted,
    fontSize: 13,
    lineHeight: 21,
    marginTop: 10,
  },
  readLabel: {
    color: studentTheme.color.textSubtle,
    fontSize: 10,
    marginTop: 10,
  },
  unreadLabel: {
    color: studentTheme.color.primary,
    fontSize: 10,
    fontWeight: "800",
    marginTop: 10,
  },
  pressed: {
    opacity: 0.78,
  },
});
