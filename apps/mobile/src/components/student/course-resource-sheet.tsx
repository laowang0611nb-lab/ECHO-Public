import { SymbolView } from "expo-symbols";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmptyState } from "@/components/states/page-state";
import { studentTheme } from "@/constants/student-theme";

export interface StudentCourseResource {
  id: string;
  title: string;
  resourceType: string | null;
  status: string | null;
  chapterTitle?: string | null;
}

export function ResourceListSheet({
  visible,
  resources,
  unavailableReason,
  onClose,
  onOpenResource,
}: {
  visible: boolean;
  resources: StudentCourseResource[];
  unavailableReason?: string;
  onClose: () => void;
  onOpenResource?: (resource: StudentCourseResource) => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 18) }]}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>课程资料</Text>
              <Text style={styles.subtitle}>
                {resources.length > 0
                  ? `${resources.length} 份课程资源`
                  : "只展示教师已发布的学习资料"}
              </Text>
            </View>
            <Pressable
              accessibilityLabel="关闭课程资料"
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

          {resources.length > 0 ? (
            <ScrollView
              contentContainerStyle={styles.list}
              showsVerticalScrollIndicator={false}
            >
              {resources.map((resource) => (
                <Pressable
                  disabled={!onOpenResource}
                  key={resource.id}
                  onPress={() => onOpenResource?.(resource)}
                  style={({ pressed }) => [
                    styles.item,
                    pressed && styles.pressed,
                  ]}
                >
                  <View style={styles.itemIcon}>
                    <SymbolView
                      name={{ android: "description", web: "description" }}
                      size={18}
                      tintColor={studentTheme.color.primary}
                    />
                  </View>
                  <View style={styles.itemCopy}>
                    <Text numberOfLines={2} style={styles.itemTitle}>
                      {resource.title}
                    </Text>
                    <Text style={styles.itemMeta}>
                      {[resource.resourceType, resource.status, resource.chapterTitle]
                        .filter(Boolean)
                        .join(" · ")}
                    </Text>
                  </View>
                  {onOpenResource ? (
                    <SymbolView
                      name={{ android: "chevron_right", web: "chevron_right" }}
                      size={19}
                      tintColor={studentTheme.color.textSubtle}
                    />
                  ) : null}
                </Pressable>
              ))}
            </ScrollView>
          ) : (
            <View style={styles.emptyWrap}>
              <EmptyState
                description={unavailableReason || "当前课程还没有可查看的资料。"}
                title="暂无课程资料"
              />
            </View>
          )}
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
    backgroundColor: studentTheme.color.surface,
    borderTopLeftRadius: studentTheme.radius.sheet,
    borderTopRightRadius: studentTheme.radius.sheet,
    maxHeight: "78%",
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
    fontWeight: "800",
  },
  subtitle: {
    color: studentTheme.color.textMuted,
    fontSize: 11,
    marginTop: 3,
  },
  closeButton: {
    alignItems: "center",
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  list: {
    gap: 10,
    paddingBottom: 12,
    paddingTop: 16,
  },
  item: {
    alignItems: "center",
    backgroundColor: studentTheme.color.surfaceSoft,
    borderColor: studentTheme.color.divider,
    borderRadius: studentTheme.radius.card,
    borderWidth: 1,
    flexDirection: "row",
    gap: 11,
    padding: 13,
  },
  itemIcon: {
    alignItems: "center",
    backgroundColor: studentTheme.color.primarySoft,
    borderRadius: 10,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  itemCopy: {
    flex: 1,
    minWidth: 0,
  },
  itemTitle: {
    color: studentTheme.color.text,
    fontSize: 14,
    fontWeight: "800",
  },
  itemMeta: {
    color: studentTheme.color.textMuted,
    fontSize: 11,
    marginTop: 4,
  },
  emptyWrap: {
    minHeight: 260,
  },
  pressed: {
    opacity: 0.76,
  },
});
