import type { KnowledgePoint } from "@echo/shared-types";
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

import {
  EmptyState,
  ErrorState,
  OfflineBanner,
  OfflineState,
} from "@/components/states/page-state";
import { SkeletonBlock, SkeletonLine } from "@/components/states/skeleton";
import { ConsolidationQuizSheet } from "@/components/student/consolidation-quiz-sheet";
import { DetailHeader } from "@/components/student/detail-header";
import { PageFade } from "@/components/student/page-fade";
import { studentTheme } from "@/constants/student-theme";
import { useStudentCourseData } from "@/features/learning/use-student-course-data";
import { isOfflineError } from "@/lib/service-status";
import { useCurrentCourse } from "@/providers/current-course-provider";
import { useStudentSession } from "@/providers/student-session-provider";

function firstParam(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export default function ChapterGuideScreen() {
  const params = useLocalSearchParams<{
    courseId?: string | string[];
    chapterId?: string | string[];
  }>();
  const routeCourseId = firstParam(params.courseId);
  const chapterId = firstParam(params.chapterId);
  const { user } = useStudentSession();
  const { selectedCourse, selectCourse } = useCurrentCourse();
  const effectiveCourseId = routeCourseId ?? selectedCourse?.id ?? null;
  const data = useStudentCourseData(user?.id ?? "", effectiveCourseId);
  const [consolidationVisible, setConsolidationVisible] = useState(false);

  useEffect(() => {
    if (routeCourseId && selectedCourse?.id !== routeCourseId) {
      selectCourse(routeCourseId);
    }
  }, [routeCourseId, selectCourse, selectedCourse?.id]);

  const chapterSummary = useMemo(
    () => data.chapterSummaries.find((item) => item.chapter.id === chapterId) ?? null,
    [chapterId, data.chapterSummaries],
  );
  const chapter = chapterSummary?.chapter ?? null;
  const orderedPoints = useMemo(
    () =>
      [...(chapter?.knowledge_points ?? [])].sort(
        (left, right) => left.order_index - right.order_index,
      ),
    [chapter],
  );
  const firstIncompletePoint = useMemo(
    () =>
      orderedPoints.find(
        (point) => {
          const state = data.masteryStates.find(
            (item) => item.knowledge_point_id === point.id,
          );
          return !state || state.score < 80;
        },
      ) ??
      orderedPoints[0] ??
      null,
    [data.masteryStates, orderedPoints],
  );

  if (!user || !effectiveCourseId || !chapterId) return null;

  if (data.loading && !data.course) {
    return <ChapterGuideSkeleton />;
  }

  if (data.error && !data.course) {
    return isOfflineError(data.error) ? (
      <OfflineState onRetry={() => void data.reload()} />
    ) : (
      <ErrorState
        description="暂时无法加载章节内容，请稍后重试。"
        onAction={() => void data.reload()}
        title="章节加载失败"
      />
    );
  }

  if (!chapter || !chapterSummary) {
    return (
      <ErrorState
        description="没有找到这个章节，或章节不属于当前课程。"
        onAction={() => router.back()}
        title="章节不可用"
      />
    );
  }

  const offline = isOfflineError(data.error);
  const courseName = data.course?.name ?? "当前课程";

  function openPoint(point: KnowledgePoint) {
    router.push({
      pathname: "/knowledge/[knowledgePointId]",
      params: { courseId: effectiveCourseId, knowledgePointId: point.id },
    });
  }

  return (
    <SafeAreaView edges={["top"]} style={styles.screen}>
      <PageFade>
        <DetailHeader
          onBack={() => router.back()}
          subtitle={`${courseName} · ${chapter.title}`}
          title="教材导学"
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
              description="章节结构仍可浏览，AI 请求和巩固提交暂时不可用。"
              onRetry={() => void data.reload()}
            />
          ) : null}

          <View style={styles.hero}>
            <View style={styles.heroIcon}>
              <SymbolView
                name={{ android: "menu_book", web: "menu_book" }}
                size={22}
                tintColor={studentTheme.color.primary}
              />
            </View>
            <Text style={styles.eyebrow}>AI 导学 · 本章学习</Text>
            <Text style={styles.chapterTitle}>{chapter.title}</Text>
            <Text style={styles.chapterSummary}>
              {chapter.summary || "教师暂未补充章节简介，可先按知识点顺序学习。"}
            </Text>
            <View style={styles.heroMetaRow}>
              <View style={styles.heroMeta}>
                <Text style={styles.heroMetaValue}>{orderedPoints.length}</Text>
                <Text style={styles.heroMetaLabel}>核心知识点</Text>
              </View>
              <View style={styles.heroMeta}>
                <Text style={styles.heroMetaValue}>
                  {chapterSummary.averageMastery === null
                    ? "暂无"
                    : `${chapterSummary.averageMastery}%`}
                </Text>
                <Text style={styles.heroMetaLabel}>章节平均掌握</Text>
              </View>
              <View style={styles.heroMeta}>
                <Text style={styles.heroMetaValue}>
                  {chapterSummary.status === "completed"
                    ? "已完成"
                    : chapterSummary.status === "in_progress"
                      ? "学习中"
                      : "未开始"}
                </Text>
                <Text style={styles.heroMetaLabel}>当前状态</Text>
              </View>
              <View style={styles.heroMeta}>
                <Text style={styles.heroMetaValue}>
                  {`${chapterSummary.progressPercent}%`}
                </Text>
                <Text style={styles.heroMetaLabel}>章节进度</Text>
              </View>
            </View>
            <Pressable
              disabled={!firstIncompletePoint}
              onPress={() => firstIncompletePoint && openPoint(firstIncompletePoint)}
              style={({ pressed }) => [
                styles.primaryButton,
                !firstIncompletePoint && styles.disabled,
                pressed && styles.pressed,
              ]}
            >
              <SymbolView
                name={{ android: "play_arrow", web: "play_arrow" }}
                size={18}
                tintColor="#ffffff"
              />
              <Text style={styles.primaryButtonText}>
                {firstIncompletePoint ? "开始学习" : "暂无知识点"}
              </Text>
            </Pressable>
          </View>

          <Text style={styles.sectionTitle}>章节结构</Text>
          {orderedPoints.length === 0 ? (
            <EmptyState
              description="本章暂无可用教材内容。"
              title="暂无知识点"
            />
          ) : (
            <ScrollView
              contentContainerStyle={styles.structureList}
              horizontal
              showsHorizontalScrollIndicator={false}
            >
              {orderedPoints.map((point, index) => {
                const state = data.masteryStates.find(
                  (item) => item.knowledge_point_id === point.id,
                );
                return (
                  <Pressable
                    key={point.id}
                    onPress={() => openPoint(point)}
                    style={({ pressed }) => [
                      styles.structureCard,
                      index === 0 && styles.structureCardCurrent,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text
                      style={[
                        styles.structureIndex,
                        index === 0 && styles.structureIndexCurrent,
                      ]}
                    >
                      {String(index + 1).padStart(2, "0")}
                    </Text>
                    <Text numberOfLines={2} style={styles.structureTitle}>
                      {point.name}
                    </Text>
                    <Text style={styles.structureMeta}>
                      {state ? `掌握 ${Math.round(state.score)}%` : "暂无学习证据"}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}

          <Text style={styles.sectionTitle}>核心知识点</Text>
          <View style={styles.pointList}>
            {orderedPoints.map((point) => {
              const state = data.masteryStates.find(
                (item) => item.knowledge_point_id === point.id,
              );
              return (
                <Pressable
                  key={point.id}
                  onPress={() => openPoint(point)}
                  style={({ pressed }) => [
                    styles.pointRow,
                    pressed && styles.pressed,
                  ]}
                >
                  <View style={styles.pointCopy}>
                    <Text style={styles.pointTitle}>{point.name}</Text>
                    <Text numberOfLines={2} style={styles.pointDescription}>
                      {point.description || "教师暂未补充知识点说明。"}
                    </Text>
                  </View>
                  <View style={styles.pointState}>
                    <Text
                      style={[
                        styles.pointStateText,
                        state && styles.pointStateTextActive,
                      ]}
                    >
                      {state ? `${Math.round(state.score)}%` : "无证据"}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.sectionTitle}>推荐学习路径</Text>
          <View style={styles.pathCard}>
            {orderedPoints.slice(0, 5).map((point, index) => (
              <View key={point.id} style={styles.pathRow}>
                <View style={styles.pathIndex}>
                  <Text style={styles.pathIndexText}>{index + 1}</Text>
                </View>
                <Text style={styles.pathText}>{point.name}</Text>
                {index < Math.min(orderedPoints.length, 5) - 1 ? (
                  <View style={styles.pathLine} />
                ) : null}
              </View>
            ))}
            {orderedPoints.length === 0 ? (
              <Text style={styles.pathEmpty}>本章暂无学习路径数据。</Text>
            ) : null}
          </View>

          <Text style={styles.sectionTitle}>推荐操作</Text>
          <View style={styles.actionGrid}>
            <Pressable
              onPress={() =>
                router.push({
                  pathname: "/chat",
                  params: {
                    chapterId: chapter.id,
                    courseId: effectiveCourseId,
                    knowledgePointId: firstIncompletePoint?.id,
                  },
                })
              }
              style={({ pressed }) => [styles.actionCard, pressed && styles.pressed]}
            >
              <View style={styles.actionIcon}>
                <SymbolView
                  name={{ android: "forum", web: "forum" }}
                  size={19}
                  tintColor={studentTheme.color.primary}
                />
              </View>
              <Text style={styles.actionTitle}>进入 AI 对话</Text>
              <Text style={styles.actionText}>围绕本章继续提问</Text>
            </Pressable>
            <Pressable
              disabled={!firstIncompletePoint}
              onPress={() => firstIncompletePoint && openPoint(firstIncompletePoint)}
              style={({ pressed }) => [
                styles.actionCard,
                !firstIncompletePoint && styles.actionDisabled,
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.actionIcon}>
                <SymbolView
                  name={{ android: "description", web: "description" }}
                  size={19}
                  tintColor={studentTheme.color.primary}
                />
              </View>
              <Text style={styles.actionTitle}>查看教材来源</Text>
              <Text style={styles.actionText}>查看知识点引用与页码</Text>
            </Pressable>
            <Pressable
              disabled={offline || !firstIncompletePoint}
              onPress={() => setConsolidationVisible(true)}
              style={({ pressed }) => [
                styles.actionCard,
                (offline || !firstIncompletePoint) && styles.actionDisabled,
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.actionIcon}>
                <SymbolView
                  name={{ android: "quiz", web: "quiz" }}
                  size={19}
                  tintColor={studentTheme.color.primary}
                />
              </View>
              <Text style={styles.actionTitle}>5 分钟巩固</Text>
              <Text style={styles.actionText}>
                {offline ? "服务恢复后可用" : "完成 2 至 3 道快速验证"}
              </Text>
            </Pressable>
            </View>
        </ScrollView>
        <ConsolidationQuizSheet
          courseId={effectiveCourseId}
          knowledgePointId={firstIncompletePoint?.id ?? ""}
          knowledgePointName={firstIncompletePoint?.name}
          onClose={() => setConsolidationVisible(false)}
          visible={consolidationVisible && Boolean(firstIncompletePoint)}
        />
      </PageFade>
    </SafeAreaView>
  );
}

function ChapterGuideSkeleton() {
  return (
    <SafeAreaView edges={["top"]} style={styles.screen}>
      <DetailHeader onBack={() => router.back()} title="教材导学" />
      <View style={styles.skeletonContent}>
        <SkeletonBlock style={styles.skeletonHero} />
        <SkeletonLine width={96} height={16} />
        <SkeletonBlock style={styles.skeletonStrip} />
        {[0, 1, 2].map((item) => (
          <SkeletonBlock key={item} style={styles.skeletonPoint} />
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
    backgroundColor: studentTheme.color.surface,
    borderColor: studentTheme.color.learningBorder,
    borderRadius: studentTheme.radius.hero,
    borderWidth: 1,
    padding: 18,
  },
  heroIcon: {
    alignItems: "center",
    backgroundColor: studentTheme.color.primarySoft,
    borderRadius: 12,
    height: 42,
    justifyContent: "center",
    width: 42,
  },
  eyebrow: {
    color: studentTheme.color.primary,
    fontSize: 11,
    fontWeight: "800",
    marginTop: 13,
  },
  chapterTitle: {
    color: studentTheme.color.text,
    fontSize: 23,
    fontWeight: "900",
    marginTop: 6,
  },
  chapterSummary: {
    color: studentTheme.color.textMuted,
    fontSize: 13,
    lineHeight: 21,
    marginTop: 9,
  },
  heroMetaRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 16,
  },
  heroMeta: {
    backgroundColor: studentTheme.color.surfaceSoft,
    borderRadius: studentTheme.radius.medium,
    flex: 1,
    padding: 9,
  },
  heroMetaValue: {
    color: studentTheme.color.text,
    fontSize: 14,
    fontWeight: "900",
  },
  heroMetaLabel: {
    color: studentTheme.color.textMuted,
    fontSize: 9,
    marginTop: 3,
  },
  primaryButton: {
    alignItems: "center",
    backgroundColor: studentTheme.color.primary,
    borderRadius: studentTheme.radius.medium,
    flexDirection: "row",
    gap: 7,
    justifyContent: "center",
    marginTop: 15,
    minHeight: 44,
  },
  primaryButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "800",
  },
  sectionTitle: {
    color: studentTheme.color.text,
    fontSize: 17,
    fontWeight: "900",
  },
  structureList: {
    gap: 10,
    paddingRight: 4,
  },
  structureCard: {
    backgroundColor: studentTheme.color.surface,
    borderColor: studentTheme.color.border,
    borderRadius: studentTheme.radius.card,
    borderWidth: 1,
    minHeight: 112,
    padding: 13,
    width: 146,
  },
  structureCardCurrent: {
    backgroundColor: studentTheme.color.primarySoft,
    borderColor: studentTheme.color.primaryBorder,
  },
  structureIndex: {
    color: studentTheme.color.textSubtle,
    fontSize: 11,
    fontWeight: "900",
  },
  structureIndexCurrent: {
    color: studentTheme.color.primary,
  },
  structureTitle: {
    color: studentTheme.color.text,
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 20,
    marginTop: 12,
  },
  structureMeta: {
    color: studentTheme.color.textMuted,
    fontSize: 10,
    marginTop: 8,
  },
  pointList: {
    gap: 9,
  },
  pointRow: {
    alignItems: "center",
    backgroundColor: studentTheme.color.surface,
    borderColor: studentTheme.color.border,
    borderRadius: studentTheme.radius.card,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    padding: 14,
  },
  pointCopy: {
    flex: 1,
    minWidth: 0,
  },
  pointTitle: {
    color: studentTheme.color.text,
    fontSize: 14,
    fontWeight: "800",
  },
  pointDescription: {
    color: studentTheme.color.textMuted,
    fontSize: 11,
    lineHeight: 17,
    marginTop: 4,
  },
  pointState: {
    minWidth: 56,
  },
  pointStateText: {
    color: studentTheme.color.textSubtle,
    fontSize: 10,
    fontWeight: "800",
    textAlign: "right",
  },
  pointStateTextActive: {
    color: studentTheme.color.primary,
  },
  pathCard: {
    backgroundColor: studentTheme.color.surface,
    borderColor: studentTheme.color.border,
    borderRadius: studentTheme.radius.card,
    borderWidth: 1,
    gap: 12,
    padding: 16,
  },
  pathRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    minHeight: 28,
    position: "relative",
  },
  pathIndex: {
    alignItems: "center",
    backgroundColor: studentTheme.color.learningSoft,
    borderRadius: studentTheme.radius.pill,
    height: 28,
    justifyContent: "center",
    width: 28,
  },
  pathIndexText: {
    color: studentTheme.color.primary,
    fontSize: 11,
    fontWeight: "900",
  },
  pathText: {
    color: studentTheme.color.text,
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
  },
  pathLine: {
    backgroundColor: studentTheme.color.learningBorder,
    bottom: -12,
    height: 12,
    left: 13,
    position: "absolute",
    width: 2,
  },
  pathEmpty: {
    color: studentTheme.color.textMuted,
    fontSize: 12,
  },
  actionGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  actionCard: {
    backgroundColor: studentTheme.color.surface,
    borderColor: studentTheme.color.border,
    borderRadius: studentTheme.radius.card,
    borderWidth: 1,
    minHeight: 120,
    padding: 14,
    width: "31.5%",
  },
  actionDisabled: {
    opacity: 0.6,
  },
  actionIcon: {
    alignItems: "center",
    backgroundColor: studentTheme.color.surfaceSoft,
    borderRadius: 10,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  actionTitle: {
    color: studentTheme.color.text,
    fontSize: 12,
    fontWeight: "800",
    lineHeight: 17,
    marginTop: 12,
  },
  actionText: {
    color: studentTheme.color.textMuted,
    fontSize: 10,
    lineHeight: 15,
    marginTop: 5,
  },
  skeletonContent: {
    gap: 14,
    padding: 16,
  },
  skeletonHero: {
    height: 236,
  },
  skeletonStrip: {
    height: 112,
  },
  skeletonPoint: {
    height: 78,
  },
  disabled: {
    opacity: 0.45,
  },
  pressed: {
    opacity: 0.76,
  },
});
