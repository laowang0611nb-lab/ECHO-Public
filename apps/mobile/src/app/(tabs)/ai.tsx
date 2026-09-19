import { router } from "expo-router";
import { SymbolView, type AndroidSymbol } from "expo-symbols";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ImageSourcePropType,
} from "react-native";

import {
  EmptyState,
  ErrorState,
  LoadingState,
  OfflineBanner,
  OfflineState,
} from "@/components/states/page-state";
import { PageFade } from "@/components/student/page-fade";
import { studentTheme } from "@/constants/student-theme";
import { useStudentLearningOverview } from "@/features/learning/use-learning-overview";
import { isOfflineError } from "@/lib/service-status";
import { useCurrentCourse } from "@/providers/current-course-provider";
import { useStudentSession } from "@/providers/student-session-provider";

export default function AISupportScreen() {
  const { user } = useStudentSession();
  const { courses, selectedCourse, loading, error, refreshCourses } = useCurrentCourse();
  const [question, setQuestion] = useState("");
  const archived = selectedCourse?.status === "archived";
  const offline = isOfflineError(error);

  const learning = useStudentLearningOverview(user?.id ?? "", selectedCourse?.id ?? null);
  const knowledgePointNames = useMemo(
    () =>
      new Map(
        learning.chapters.flatMap((chapter) =>
          chapter.knowledge_points.map((point) => [point.id, point.name] as const),
        ),
      ),
    [learning.chapters],
  );
  const weakestStates = [...learning.mastery]
    .sort((left, right) => left.score - right.score)
    .slice(0, 3);

  if (!user) {
    return null;
  }

  if (loading) {
    return <LoadingState message="正在加载课程..." />;
  }

  if (error && courses.length === 0) {
    return offline ? (
      <OfflineState onRetry={() => void refreshCourses()} />
    ) : (
      <ErrorState
        description="课程信息加载失败，请稍后重试。"
        onAction={() => void refreshCourses()}
      />
    );
  }

  if (!selectedCourse) {
    return (
      <ScrollView contentContainerStyle={styles.content}>
        <EmptyState
          actionLabel="输入课程码"
          description="加入课程后，ECHO 会结合课程资料和教师教学规则陪你学习。"
          onAction={() => router.push("/join-course")}
          secondaryActionDisabled
          secondaryActionLabel="扫码加入课程 · 增强版开放"
          title="你还没有加入课程"
        />
      </ScrollView>
    );
  }

  function openQuestion() {
    const content = question.trim();
    if (!content || archived) {
      return;
    }
    router.push({
      pathname: "/chat",
      params: { question: content },
    });
    setQuestion("");
  }

  return (
    <PageFade>
    <ScrollView contentContainerStyle={styles.content}>
      {offline ? <OfflineBanner onRetry={() => void refreshCourses()} /> : null}
      <View style={styles.hero}>
        <View style={styles.heroCopy}>
          <Text style={styles.eyebrow}>ECHO AI 助学</Text>
          <Text style={styles.heroTitle}>今天想学什么？</Text>
          <Text style={styles.heroDescription}>
            围绕当前课程发现学习任务，进入对应学习空间。
          </Text>
        </View>
        <View style={styles.courseBadge}>
          <Text numberOfLines={1} style={styles.courseBadgeName}>
            {selectedCourse.name}
          </Text>
          <Text style={styles.courseBadgeMeta}>
            {archived ? "已归档" : (selectedCourse.term ?? "当前课程")}
          </Text>
        </View>
      </View>

      {archived ? (
        <View style={styles.archivedBanner}>
          <Text style={styles.archivedBannerText}>本课程已归档，仅可查看历史内容。</Text>
        </View>
      ) : null}

      <View style={styles.abilityGrid}>
        <AbilityCard
          accent="#3478f6"
          description={archived ? "课程已归档" : "课程上下文问答"}
          disabled={archived}
          imageSource={require("@/assets/images/student/ai-support.png")}
          onPress={() => router.push("/chat")}
          title="智能问答"
        />
        <AbilityCard
          accent="#13a574"
          description={archived ? "课程已归档" : "章节与知识点导学"}
          disabled={archived}
          imageSource={require("@/assets/images/student/guided-learning.png")}
          onPress={() => router.push(`/courses/${selectedCourse.id}`)}
          title="教材导学"
        />
        <AbilityCard
          accent="#d97706"
          description="增强版开放"
          disabled
          imageSource={require("@/assets/images/student/photo-question.png")}
          title="拍照识题"
        />
        <AbilityCard
          accent="#7357c8"
          description="增强版开放"
          disabled
          imageSource={require("@/assets/images/student/knowledge-graph.png")}
          title="知识图谱"
        />
      </View>

      <Text style={styles.sectionTitle}>快捷入口</Text>
      <View style={styles.shortcutRow}>
        <Shortcut
          icon="qr_code"
          label="扫码加课"
          onPress={() => router.push("/join-course")}
        />
        <Shortcut
          icon="history"
          label="学习记录"
          onPress={() => router.push("/learning-records")}
        />
        <Shortcut
          icon="quiz"
          label="错题整理"
          onPress={() => router.push("/wrong-questions")}
        />
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>当前课程学习卡</Text>
        <Pressable onPress={learning.reload}>
          <Text style={styles.refreshText}>刷新</Text>
        </Pressable>
      </View>
      <View style={styles.courseCard}>
        <Text style={styles.courseCardTitle}>{selectedCourse.name}</Text>
        <Text style={styles.courseCardMeta}>
          {selectedCourse.term ?? "学期待同步"} · 授课教师待同步
        </Text>
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              {
                width:
                  learning.averageMastery === null
                    ? "0%"
                    : `${Math.max(0, Math.min(100, learning.averageMastery))}%`,
              },
            ]}
          />
        </View>
        <View style={styles.cardFooter}>
          <Text style={styles.cardMeta}>
            当前章节待同步 · 综合掌握{" "}
            {learning.averageMastery === null ? "暂无证据" : `${learning.averageMastery}%`}
          </Text>
          <Pressable
            onPress={() => router.push(`/courses/${selectedCourse.id}`)}
            style={styles.continueButton}
          >
            <Text style={styles.continueText}>继续学习</Text>
          </Pressable>
        </View>
      </View>

      <Text style={styles.sectionTitle}>ECHO 学习建议</Text>
      {learning.loading ? <ActivityIndicator color={studentTheme.color.primary} /> : null}
      {learning.error ? (
        <ErrorState
          description="学习状态加载失败。"
          onAction={learning.reload}
          title="学习建议暂不可用"
        />
      ) : null}
      {!learning.loading && !learning.error && weakestStates.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>暂无足够学习证据</Text>
          <Text style={styles.emptyText}>完成学习后，这里会显示可执行的复习建议。</Text>
        </View>
      ) : null}
      {weakestStates.map((state, index) => (
        <Pressable
          key={state.id}
          onPress={() => router.push(`/knowledge/${state.knowledge_point_id}`)}
          style={({ pressed }) => [styles.suggestion, pressed && styles.pressed]}
        >
          <View style={styles.suggestionIndex}>
            <Text style={styles.suggestionIndexText}>{index + 1}</Text>
          </View>
          <View style={styles.suggestionCopy}>
            <Text style={styles.suggestionTitle}>
              建议复习“{knowledgePointNames.get(state.knowledge_point_id) ?? "薄弱知识点"}”
            </Text>
            <Text style={styles.suggestionMeta}>
              当前掌握度 {Math.round(state.score)}%
            </Text>
          </View>
        </Pressable>
      ))}

      <View style={styles.askCard}>
        <Text style={styles.askTitle}>问 ECHO</Text>
        <TextInput
          multiline
          editable={!archived}
          onChangeText={setQuestion}
          placeholder={archived ? "本课程已归档，仅可查看历史内容" : "输入一个课程问题..."}
          placeholderTextColor="#8b96a8"
          style={styles.askInput}
          value={question}
        />
        <Pressable
          disabled={archived || !question.trim()}
          onPress={openQuestion}
          style={[styles.primaryButton, (archived || !question.trim()) && styles.disabled]}
        >
          <Text style={styles.primaryButtonText}>进入 AI 对话</Text>
        </Pressable>
      </View>

      <Text style={styles.footerStats}>
        {courses.length} 门课程 · {learning.chapters.length} 个章节
      </Text>
    </ScrollView>
    </PageFade>
  );
}

function AbilityCard({
  title,
  description,
  imageSource,
  accent,
  onPress,
  disabled = false,
}: {
  title: string;
  description: string;
  imageSource: ImageSourcePropType;
  accent: string;
  onPress?: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      disabled={disabled || !onPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.abilityCard,
        { backgroundColor: accent, borderColor: accent },
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.abilityIcon}>
        <Image resizeMode="cover" source={imageSource} style={styles.abilityImage} />
      </View>
      <Text style={styles.abilityTitle}>{title}</Text>
      <Text style={styles.abilityDescription}>{description}</Text>
    </Pressable>
  );
}

function Shortcut({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon: AndroidSymbol;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.shortcut, pressed && styles.pressed]}>
      <SymbolView
        name={{ android: icon, web: icon }}
        size={19}
        tintColor={studentTheme.color.primary}
      />
      <Text style={styles.shortcutText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 14,
    padding: 16,
    paddingBottom: 32,
  },
  hero: {
    backgroundColor: studentTheme.color.surface,
    borderColor: studentTheme.color.border,
    borderRadius: studentTheme.radius.hero,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    padding: 20,
    shadowColor: "#17345c",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 20,
  },
  heroCopy: {
    flex: 1,
  },
  eyebrow: {
    color: studentTheme.color.primary,
    fontSize: 12,
    fontWeight: "900",
  },
  heroTitle: {
    color: studentTheme.color.text,
    fontSize: 26,
    fontWeight: "900",
    marginTop: 6,
  },
  heroDescription: {
    color: studentTheme.color.textMuted,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 8,
  },
  archivedBanner: {
    backgroundColor: "#fff7ed",
    borderColor: "#fed7aa",
    borderRadius: studentTheme.radius.medium,
    borderWidth: 1,
    padding: 12,
  },
  archivedBannerText: {
    color: studentTheme.color.warning,
    fontSize: 13,
    fontWeight: "800",
  },
  courseBadge: {
    alignSelf: "flex-start",
    backgroundColor: studentTheme.color.surfaceBlue,
    borderRadius: studentTheme.radius.large,
    maxWidth: 150,
    padding: 11,
  },
  courseBadgeName: {
    color: studentTheme.color.primary,
    fontSize: 13,
    fontWeight: "900",
  },
  courseBadgeMeta: {
    color: studentTheme.color.textMuted,
    fontSize: 11,
    marginTop: 3,
  },
  abilityGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  abilityCard: {
    backgroundColor: studentTheme.color.surface,
    borderColor: studentTheme.color.border,
    borderRadius: studentTheme.radius.card,
    borderWidth: 1,
    minHeight: 136,
    padding: 15,
    width: "48%",
  },
  abilityIcon: {
    alignItems: "center",
    borderRadius: 18,
    height: 68,
    justifyContent: "center",
    overflow: "hidden",
    width: 68,
  },
  abilityImage: {
    height: "100%",
    width: "100%",
  },
  abilityTitle: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "900",
    marginTop: 12,
  },
  abilityDescription: {
    color: "rgba(255,255,255,0.86)",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 5,
  },
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 3,
  },
  sectionTitle: {
    color: studentTheme.color.text,
    fontSize: 18,
    fontWeight: "900",
  },
  refreshText: {
    color: studentTheme.color.primary,
    fontSize: 12,
    fontWeight: "800",
  },
  shortcutRow: {
    flexDirection: "row",
    gap: 8,
  },
  shortcut: {
    alignItems: "center",
    backgroundColor: studentTheme.color.surface,
    borderColor: studentTheme.color.border,
    borderRadius: studentTheme.radius.medium,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    flexDirection: "column",
    gap: 5,
    minHeight: 62,
  },
  shortcutText: {
    color: studentTheme.color.text,
    fontSize: 12,
    fontWeight: "800",
  },
  courseCard: {
    backgroundColor: studentTheme.color.surface,
    borderColor: studentTheme.color.border,
    borderRadius: studentTheme.radius.card,
    borderWidth: 1,
    padding: 16,
  },
  courseCardTitle: {
    color: studentTheme.color.text,
    fontSize: 18,
    fontWeight: "900",
  },
  courseCardMeta: {
    color: studentTheme.color.textMuted,
    fontSize: 12,
    marginTop: 5,
  },
  progressTrack: {
    backgroundColor: "#e7eef8",
    borderRadius: 999,
    height: 8,
    marginTop: 16,
    overflow: "hidden",
  },
  progressFill: {
    backgroundColor: studentTheme.color.primary,
    borderRadius: 999,
    height: 8,
  },
  cardFooter: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 12,
  },
  cardMeta: {
    color: studentTheme.color.textMuted,
    flex: 1,
    fontSize: 12,
    fontWeight: "700",
  },
  continueButton: {
    backgroundColor: studentTheme.color.surfaceBlue,
    borderRadius: studentTheme.radius.medium,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  continueText: {
    color: studentTheme.color.primary,
    fontSize: 12,
    fontWeight: "900",
  },
  emptyCard: {
    backgroundColor: studentTheme.color.surface,
    borderColor: studentTheme.color.border,
    borderRadius: studentTheme.radius.card,
    borderWidth: 1,
    padding: 16,
  },
  emptyTitle: {
    color: studentTheme.color.text,
    fontSize: 16,
    fontWeight: "900",
  },
  emptyText: {
    color: studentTheme.color.textMuted,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 6,
  },
  suggestion: {
    alignItems: "center",
    backgroundColor: studentTheme.color.surface,
    borderColor: studentTheme.color.border,
    borderRadius: studentTheme.radius.card,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    padding: 14,
  },
  suggestionIndex: {
    alignItems: "center",
    backgroundColor: studentTheme.color.surfaceBlue,
    borderRadius: studentTheme.radius.medium,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  suggestionIndexText: {
    color: studentTheme.color.primary,
    fontSize: 13,
    fontWeight: "900",
  },
  suggestionCopy: {
    flex: 1,
  },
  suggestionTitle: {
    color: studentTheme.color.text,
    fontSize: 14,
    fontWeight: "900",
  },
  suggestionMeta: {
    color: studentTheme.color.textMuted,
    fontSize: 12,
    marginTop: 4,
  },
  askCard: {
    backgroundColor: studentTheme.color.surface,
    borderColor: studentTheme.color.border,
    borderRadius: studentTheme.radius.card,
    borderWidth: 1,
    padding: 16,
  },
  askTitle: {
    color: studentTheme.color.text,
    fontSize: 17,
    fontWeight: "900",
  },
  askInput: {
    backgroundColor: studentTheme.color.surfaceSoft,
    borderColor: studentTheme.color.border,
    borderRadius: studentTheme.radius.medium,
    borderWidth: 1,
    color: studentTheme.color.text,
    fontSize: 14,
    marginTop: 12,
    minHeight: 76,
    padding: 12,
    textAlignVertical: "top",
  },
  primaryButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: studentTheme.color.primary,
    borderRadius: studentTheme.radius.medium,
    justifyContent: "center",
    marginTop: 14,
    minHeight: 44,
    paddingHorizontal: 18,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900",
  },
  pressed: {
    opacity: 0.76,
  },
  disabled: {
    opacity: 0.5,
  },
  footerStats: {
    color: studentTheme.color.textMuted,
    fontSize: 12,
    textAlign: "center",
  },
});
