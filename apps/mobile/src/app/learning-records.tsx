import { SymbolView } from "expo-symbols";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { EmptyState, ErrorState, OfflineBanner, OfflineState } from "@/components/states/page-state";
import { SkeletonBlock } from "@/components/states/skeleton";
import { DetailHeader } from "@/components/student/detail-header";
import { PageFade } from "@/components/student/page-fade";
import { studentTheme } from "@/constants/student-theme";
import {
  type StudentActivityItem,
  useStudentCourseData,
} from "@/features/learning/use-student-course-data";
import { isOfflineError } from "@/lib/service-status";
import { useCurrentCourse } from "@/providers/current-course-provider";
import { useStudentSession } from "@/providers/student-session-provider";

type RecordTab = "all" | "conversation" | "quiz" | "chapter";

const tabs: { id: RecordTab; label: string }[] = [
  { id: "all", label: "全部" },
  { id: "conversation", label: "问答" },
  { id: "quiz", label: "检测" },
  { id: "chapter", label: "章节学习" },
];

function firstParam(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function dateKey(value: string): string {
  const date = new Date(value);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function dateLabel(value: string): string {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "今天";
  if (date.toDateString() === yesterday.toDateString()) return "昨天";
  return date.toLocaleDateString("zh-CN", { month: "long", day: "numeric" });
}

function timeLabel(value: string): string {
  return new Date(value).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function LearningRecordsScreen() {
  const params = useLocalSearchParams<{ courseId?: string | string[] }>();
  const routeCourseId = firstParam(params.courseId);
  const { user } = useStudentSession();
  const { selectedCourse, selectCourse } = useCurrentCourse();
  const effectiveCourseId = routeCourseId ?? selectedCourse?.id ?? null;
  const data = useStudentCourseData(user?.id ?? "", effectiveCourseId);
  const [activeTab, setActiveTab] = useState<RecordTab>("all");

  useEffect(() => {
    if (routeCourseId && selectedCourse?.id !== routeCourseId) {
      selectCourse(routeCourseId);
    }
  }, [routeCourseId, selectCourse, selectedCourse?.id]);

  const filteredActivities = useMemo(() => {
    if (activeTab === "conversation") {
      return data.recentActivities.filter((item) => item.kind === "conversation");
    }
    if (activeTab === "all") return data.recentActivities;
    return [];
  }, [activeTab, data.recentActivities]);

  const groups = useMemo(() => {
    const grouped = new Map<string, StudentActivityItem[]>();
    for (const item of filteredActivities) {
      const key = dateKey(item.createdAt);
      grouped.set(key, [...(grouped.get(key) ?? []), item]);
    }
    return Array.from(grouped.entries());
  }, [filteredActivities]);

  const recentConversationCount = data.recentActivities.filter(
    (item) => item.kind === "conversation",
  ).length;
  const recentMasteryCount = data.recentActivities.filter(
    (item) => item.kind === "mastery",
  ).length;

  if (!user || !effectiveCourseId) {
    return (
      <ErrorState
        description="请先选择一门课程。"
        onAction={() => router.replace("/(tabs)/courses")}
        title="还没有当前课程"
      />
    );
  }

  if (data.loading && !data.course) {
    return <LearningRecordsSkeleton />;
  }

  if (data.error && !data.course) {
    return isOfflineError(data.error) ? (
      <OfflineState onRetry={() => void data.reload()} />
    ) : (
      <ErrorState
        description="暂时无法加载学习记录，请稍后重试。"
        onAction={() => void data.reload()}
        title="学习记录加载失败"
      />
    );
  }

  const offline = isOfflineError(data.error);
  const courseName = data.course?.name ?? selectedCourse?.name ?? "当前课程";

  return (
    <SafeAreaView edges={["top"]} style={styles.screen}>
      <PageFade>
        <DetailHeader
          onBack={() => router.back()}
          subtitle={`${courseName} · 最近学习证据`}
          title="学习记录"
        />
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              colors={[studentTheme.color.primary]}
              onRefresh={() => void data.reload()}
              refreshing={false}
              tintColor={studentTheme.color.primary}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          {offline ? (
            <OfflineBanner
              description="已缓存的学习记录仍可查看。"
              onRetry={() => void data.reload()}
            />
          ) : null}

          <View style={styles.hero}>
            <Text style={styles.heroEyebrow}>最近学习概况</Text>
            <Text style={styles.heroTitle}>当前可读取记录</Text>
            <View style={styles.metrics}>
              <Metric label="AI 对话" value={recentConversationCount} />
              <Metric label="检测" value={null} />
              <Metric label="状态更新" value={recentMasteryCount} />
            </View>
            <Text style={styles.heroHint}>
              当前展示最近的学习记录，更多内容会在数据积累后显示。
            </Text>
          </View>

          <View style={styles.tabs}>
            {tabs.map((tab) => {
              const selected = tab.id === activeTab;
              return (
                <Pressable
                  key={tab.id}
                  onPress={() => setActiveTab(tab.id)}
                  style={[styles.tab, selected && styles.tabSelected]}
                >
                  <Text style={[styles.tabText, selected && styles.tabTextSelected]}>
                    {tab.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {activeTab === "quiz" || activeTab === "chapter" ? (
            <UnavailableTimeline
              description={
                activeTab === "quiz"
                  ? "暂时无法读取检测记录，完成更多学习后再来看看。"
                  : "暂时无法读取章节学习记录，可先从课程目录进入章节学习。"
              }
              title={activeTab === "quiz" ? "检测记录暂不可用" : "章节学习记录暂不可用"}
            />
          ) : groups.length === 0 ? (
            <EmptyState
              description="完成一次 AI 提问、快速检测或章节学习后，这里会记录你的学习过程。"
              title="还没有学习记录"
            />
          ) : (
            <View style={styles.timeline}>
              {groups.map(([key, items]) => (
                <View key={key} style={styles.dayGroup}>
                  <Text style={styles.dayLabel}>{dateLabel(items[0].createdAt)}</Text>
                  <View style={styles.dayLine} />
                  <View style={styles.dayItems}>
                    {items.map((item, index) => (
                      <Pressable
                        key={item.id}
                        onPress={() => {
                          if (item.conversationId) {
                            router.push({
                              pathname: "/chat",
                              params: {
                                courseId: effectiveCourseId,
                                conversationId: item.conversationId,
                              },
                            });
                          } else if (item.knowledgePointId) {
                            router.push({
                              pathname: "/knowledge/[knowledgePointId]",
                              params: {
                                courseId: effectiveCourseId,
                                knowledgePointId: item.knowledgePointId,
                              },
                            });
                          }
                        }}
                        style={({ pressed }) => [
                          styles.eventCard,
                          pressed && styles.pressed,
                        ]}
                      >
                        <View style={styles.timelineRail}>
                          <View
                            style={[
                              styles.eventDot,
                              item.kind === "mastery" && styles.eventDotSuccess,
                            ]}
                          />
                          {index < items.length - 1 ? <View style={styles.eventLine} /> : null}
                        </View>
                        <View style={styles.eventCopy}>
                          <Text style={styles.eventTitle}>
                            {item.kind === "conversation" ? "AI 对话" : "状态更新"}
                          </Text>
                          <Text numberOfLines={2} style={styles.eventDescription}>
                            {item.title}
                          </Text>
                          <Text style={styles.eventMeta}>
                            {item.description} · {timeLabel(item.createdAt)}
                          </Text>
                        </View>
                        <SymbolView
                          name={{ android: "chevron_right", web: "chevron_right" }}
                          size={18}
                          tintColor={studentTheme.color.textSubtle}
                        />
                      </Pressable>
                    ))}
                  </View>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      </PageFade>
    </SafeAreaView>
  );
}

function Metric({ label, value }: { label: string; value: number | null }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value === null ? "--" : value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function UnavailableTimeline({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <View style={styles.unavailableCard}>
      <View style={styles.unavailableIcon}>
        <SymbolView
          name={{ android: "hourglass_empty", web: "hourglass_empty" }}
          size={19}
          tintColor={studentTheme.color.warning}
        />
      </View>
      <View style={styles.unavailableCopy}>
        <Text style={styles.unavailableTitle}>{title}</Text>
        <Text style={styles.unavailableText}>{description}</Text>
      </View>
    </View>
  );
}

function LearningRecordsSkeleton() {
  return (
    <SafeAreaView edges={["top"]} style={styles.screen}>
      <DetailHeader onBack={() => router.back()} title="学习记录" />
      <View style={styles.skeletonContent}>
        <SkeletonBlock style={styles.skeletonHero} />
        <SkeletonBlock style={styles.skeletonTabs} />
        {[0, 1, 2, 3].map((item) => (
          <SkeletonBlock key={item} style={styles.skeletonRow} />
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: studentTheme.color.background,
    flex: 1,
  },
  content: {
    gap: 14,
    padding: 16,
    paddingBottom: 36,
  },
  hero: {
    backgroundColor: studentTheme.color.primary,
    borderRadius: studentTheme.radius.hero,
    padding: 18,
  },
  heroEyebrow: {
    color: "#d9e8ff",
    fontSize: 11,
    fontWeight: "800",
  },
  heroTitle: {
    color: "#ffffff",
    fontSize: 22,
    fontWeight: "900",
    marginTop: 5,
  },
  metrics: {
    flexDirection: "row",
    gap: 8,
    marginTop: 16,
  },
  metric: {
    backgroundColor: "rgba(255,255,255,0.14)",
    borderRadius: studentTheme.radius.medium,
    flex: 1,
    padding: 10,
  },
  metricValue: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "900",
  },
  metricLabel: {
    color: "#dce9ff",
    fontSize: 10,
    marginTop: 4,
  },
  heroHint: {
    color: "#dce9ff",
    fontSize: 10,
    lineHeight: 16,
    marginTop: 12,
  },
  tabs: {
    backgroundColor: studentTheme.color.surface,
    borderColor: studentTheme.color.border,
    borderRadius: studentTheme.radius.medium,
    borderWidth: 1,
    flexDirection: "row",
    padding: 4,
  },
  tab: {
    alignItems: "center",
    borderRadius: studentTheme.radius.small,
    flex: 1,
    minHeight: 36,
    justifyContent: "center",
  },
  tabSelected: {
    backgroundColor: studentTheme.color.primarySoft,
  },
  tabText: {
    color: studentTheme.color.textMuted,
    fontSize: 12,
    fontWeight: "700",
  },
  tabTextSelected: {
    color: studentTheme.color.primary,
    fontWeight: "900",
  },
  timeline: {
    gap: 16,
  },
  dayGroup: {
    position: "relative",
  },
  dayLabel: {
    color: studentTheme.color.textMuted,
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 8,
  },
  dayLine: {
    backgroundColor: studentTheme.color.divider,
    height: 1,
    left: 0,
    position: "absolute",
    right: 0,
    top: 25,
  },
  dayItems: {
    gap: 9,
  },
  eventCard: {
    alignItems: "center",
    backgroundColor: studentTheme.color.surface,
    borderColor: studentTheme.color.border,
    borderRadius: studentTheme.radius.card,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    padding: 13,
  },
  timelineRail: {
    alignItems: "center",
    alignSelf: "stretch",
    justifyContent: "center",
    width: 22,
  },
  eventDot: {
    backgroundColor: studentTheme.color.primary,
    borderRadius: studentTheme.radius.pill,
    height: 9,
    width: 9,
  },
  eventDotSuccess: {
    backgroundColor: studentTheme.color.success,
  },
  eventLine: {
    backgroundColor: studentTheme.color.divider,
    bottom: -9,
    position: "absolute",
    top: 18,
    width: 1,
  },
  eventCopy: {
    flex: 1,
    minWidth: 0,
  },
  eventTitle: {
    color: studentTheme.color.primary,
    fontSize: 11,
    fontWeight: "900",
  },
  eventDescription: {
    color: studentTheme.color.text,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 19,
    marginTop: 5,
  },
  eventMeta: {
    color: studentTheme.color.textMuted,
    fontSize: 10,
    marginTop: 5,
  },
  unavailableCard: {
    alignItems: "flex-start",
    backgroundColor: studentTheme.color.warningSoft,
    borderColor: studentTheme.color.warningBorder,
    borderRadius: studentTheme.radius.card,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    padding: 14,
  },
  unavailableIcon: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 10,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  unavailableCopy: {
    flex: 1,
  },
  unavailableTitle: {
    color: studentTheme.color.warning,
    fontSize: 13,
    fontWeight: "800",
  },
  unavailableText: {
    color: studentTheme.color.textMuted,
    fontSize: 11,
    lineHeight: 17,
    marginTop: 5,
  },
  skeletonContent: {
    gap: 14,
    padding: 16,
  },
  skeletonHero: {
    height: 178,
  },
  skeletonTabs: {
    height: 44,
  },
  skeletonRow: {
    height: 82,
  },
  pressed: {
    opacity: 0.76,
  },
});
