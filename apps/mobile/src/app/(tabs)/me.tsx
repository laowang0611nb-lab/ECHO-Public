import { router } from "expo-router";
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { studentTheme } from "@/constants/student-theme";
import { PageFade } from "@/components/student/page-fade";
import { useCurrentCourse } from "@/providers/current-course-provider";
import { useStudentSession } from "@/providers/student-session-provider";

export default function MeScreen() {
  const { user, logout } = useStudentSession();
  const { courses, selectedCourse } = useCurrentCourse();

  if (!user) {
    return null;
  }

  async function handleLogout() {
    await logout();
    router.replace("/login");
  }

  function confirmLogout() {
    Alert.alert("确认退出 ECHO？", "退出后需要重新登录才能继续学习。", [
      { text: "取消", style: "cancel" },
      {
        text: "退出登录",
        style: "destructive",
        onPress: () => void handleLogout(),
      },
    ]);
  }

  return (
    <PageFade>
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.profileCard}>
        <Image
          source={require("@/assets/images/student/student-avatar.png")}
          style={styles.avatar}
        />
        <View style={styles.profileCopy}>
          <Text style={styles.name}>{user.display_name}</Text>
          <Text style={styles.meta}>学号待同步 · {user.email}</Text>
          <Text style={styles.meta}>{selectedCourse?.name ?? "尚未选择课程"}</Text>
        </View>
      </View>

      <View style={styles.summaryRow}>
        <SummaryCell label="已加入课程" value={String(courses.length)} />
        <SummaryCell label="本周学习" value="暂无数据" />
        <SummaryCell label="掌握变化" value="暂无数据" />
      </View>

      <View style={styles.section}>
        <MenuRow label="学习记录" onPress={() => router.push("/learning-records")} />
        <MenuRow label="我的课程" onPress={() => router.replace("/(tabs)/courses")} />
        <MenuRow
          label="隐私与学习数据"
          onPress={() =>
            Alert.alert(
              "隐私与学习数据",
              "课程提问和学习记录仅用于本课程的教学反馈与教师学情分析。",
            )
          }
        />
        <MenuRow
          label="关于 ECHO"
          onPress={() =>
            Alert.alert(
              "关于 ECHO",
              "ECHO 是面向高等教育课程的 AI 教育 Agent。",
            )
          }
        />
      </View>

      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>隐私与学习数据</Text>
        <Text style={styles.infoText}>
          课程提问和学习记录仅用于本课程的教学反馈与教师学情分析。
        </Text>
        <Text style={styles.infoText}>其他课程私有数据和无关系统数据不会被教师查看。</Text>
      </View>

      <Pressable onPress={confirmLogout} style={styles.logoutButton}>
        <Text style={styles.logoutText}>退出登录</Text>
      </Pressable>
    </ScrollView>
    </PageFade>
  );
}

function SummaryCell({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryCell}>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

function MenuRow({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.menuRow, pressed && styles.pressed]}
    >
      <Text style={styles.menuLabel}>{label}</Text>
      <Text style={styles.menuArrow}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 14,
    padding: 16,
    paddingBottom: 32,
  },
  profileCard: {
    alignItems: "center",
    backgroundColor: studentTheme.color.surface,
    borderColor: studentTheme.color.border,
    borderRadius: studentTheme.radius.card,
    borderWidth: 1,
    flexDirection: "row",
    gap: 14,
    padding: 18,
  },
  avatar: {
    borderRadius: 999,
    height: 60,
    width: 60,
  },
  profileCopy: {
    flex: 1,
  },
  name: {
    color: studentTheme.color.text,
    fontSize: 21,
    fontWeight: "900",
  },
  meta: {
    color: studentTheme.color.textMuted,
    fontSize: 12,
    marginTop: 4,
  },
  summaryRow: {
    flexDirection: "row",
    gap: 8,
  },
  summaryCell: {
    alignItems: "center",
    backgroundColor: studentTheme.color.surface,
    borderColor: studentTheme.color.border,
    borderRadius: studentTheme.radius.card,
    borderWidth: 1,
    flex: 1,
    minHeight: 86,
    justifyContent: "center",
    padding: 10,
  },
  summaryValue: {
    color: studentTheme.color.text,
    fontSize: 17,
    fontWeight: "900",
    textAlign: "center",
  },
  summaryLabel: {
    color: studentTheme.color.textMuted,
    fontSize: 11,
    marginTop: 5,
    textAlign: "center",
  },
  section: {
    backgroundColor: studentTheme.color.surface,
    borderColor: studentTheme.color.border,
    borderRadius: studentTheme.radius.card,
    borderWidth: 1,
    overflow: "hidden",
  },
  menuRow: {
    alignItems: "center",
    borderBottomColor: studentTheme.color.border,
    borderBottomWidth: 1,
    flexDirection: "row",
    minHeight: 54,
    paddingHorizontal: 16,
  },
  menuLabel: {
    color: studentTheme.color.text,
    flex: 1,
    fontSize: 14,
    fontWeight: "800",
  },
  menuArrow: {
    color: studentTheme.color.textMuted,
    fontSize: 24,
  },
  infoCard: {
    backgroundColor: studentTheme.color.surface,
    borderColor: studentTheme.color.border,
    borderRadius: studentTheme.radius.card,
    borderWidth: 1,
    gap: 7,
    padding: 16,
  },
  infoTitle: {
    color: studentTheme.color.text,
    fontSize: 16,
    fontWeight: "900",
  },
  infoText: {
    color: studentTheme.color.textMuted,
    fontSize: 13,
    lineHeight: 20,
  },
  logoutButton: {
    alignItems: "center",
    borderColor: "#efb4af",
    borderRadius: studentTheme.radius.medium,
    borderWidth: 1,
    minHeight: 48,
    justifyContent: "center",
  },
  logoutText: {
    color: studentTheme.color.danger,
    fontSize: 14,
    fontWeight: "900",
  },
  pressed: {
    opacity: 0.75,
  },
});
