import type { KnowledgePoint } from "@echo/shared-types";
import { SymbolView } from "expo-symbols";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo } from "react";
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
  ErrorState,
  OfflineBanner,
  OfflineState,
} from "@/components/states/page-state";
import { SkeletonBlock, SkeletonLine } from "@/components/states/skeleton";
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

function formatUpdatedAt(value: string): string {
  return new Date(value).toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function KnowledgePointDetailScreen() {
  const params = useLocalSearchParams<{
    courseId?: string | string[];
    knowledgePointId?: string | string[];
  }>();
  const routeCourseId = firstParam(params.courseId);
  const knowledgePointId = firstParam(params.knowledgePointId);
  const { user } = useStudentSession();
  const { selectedCourse, selectCourse } = useCurrentCourse();
  const effectiveCourseId = routeCourseId ?? selectedCourse?.id ?? null;
  const data = useStudentCourseData(user?.id ?? "", effectiveCourseId);

  useEffect(() => {
    if (routeCourseId && selectedCourse?.id !== routeCourseId) {
      selectCourse(routeCourseId);
    }
  }, [routeCourseId, selectCourse, selectedCourse?.id]);

  const chapter = useMemo(
    () =>
      data.chapters.find((item) =>
        item.knowledge_points.some((point) => point.id === knowledgePointId),
      ) ?? null,
    [data.chapters, knowledgePointId],
  );
  const point = useMemo(
    () =>
      knowledgePointId
        ? data.knowledgePointsById.get(knowledgePointId) ?? null
        : null,
    [data.knowledgePointsById, knowledgePointId],
  );
  const state = useMemo(
    () =>
      data.masteryStates.find(
        (item) => item.knowledge_point_id === knowledgePointId,
      ) ?? null,
    [data.masteryStates, knowledgePointId],
  );
  const relatedPoints = useMemo(
    () =>
      (chapter?.knowledge_points ?? []).filter(
        (item) => item.id !== knowledgePointId,
      ),
    [chapter, knowledgePointId],
  );

  if (!user || !effectiveCourseId || !knowledgePointId) return null;

  if (data.loading && !data.course) {
    return <KnowledgeDetailSkeleton />;
  }

  if (data.error && !data.course) {
    return isOfflineError(data.error) ? (
      <OfflineState onRetry={() => void data.reload()} />
    ) : (
      <ErrorState
        description="暂时无法加载知识点内容，请稍后重试。"
        onAction={() => void data.reload()}
        title="知识点加载失败"
      />
    );
  }

  if (!point || !chapter) {
    return (
      <ErrorState
        description="没有找到这个知识点，或知识点不属于当前课程。"
        onAction={() => router.back()}
        title="知识点不可用"
      />
    );
  }

  const offline = isOfflineError(data.error);
  const courseName = data.course?.name ?? "当前课程";

  function openPoint(target: KnowledgePoint) {
    router.replace({
      pathname: "/knowledge/[knowledgePointId]",
      params: { courseId: effectiveCourseId, knowledgePointId: target.id },
    });
  }

  return (
    <SafeAreaView edges={["top"]} style={styles.screen}>
      <PageFade>
        <DetailHeader
          onBack={() => router.back()}
          subtitle={`${courseName} · ${chapter.title}`}
          title="知识点详情"
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
              description="已加载的知识内容仍可查看，问答和巩固提交暂不可用。"
              onRetry={() => void data.reload()}
            />
          ) : null}

          <View style={styles.identityCard}>
            <View style={styles.identityTop}>
              <View style={styles.identityIcon}>
                <SymbolView
                  name={{ android: "lightbulb", web: "lightbulb" }}
                  size={22}
                  tintColor={studentTheme.color.violet}
                />
              </View>
              <View style={styles.identityCopy}>
                <Text style={styles.eyebrow}>知识点</Text>
                <Text style={styles.pointName}>{point.name}</Text>
              </View>
            </View>
            <View style={styles.chapterBadge}>
              <Text style={styles.chapterBadgeText}>{chapter.title}</Text>
            </View>
            <Text style={styles.pointDescription}>
              {point.description || "教师暂未补充知识点说明。"}
            </Text>
          </View>

          <View style={styles.masteryCard}>
            <View style={styles.masteryHeader}>
              <View>
                <Text style={styles.sectionEyebrow}>当前学习状态</Text>
                <Text style={styles.masteryValue}>
                  {state ? `${Math.round(state.score)}%` : "暂无足够学习证据"}
                </Text>
              </View>
              <View
                style={[
                  styles.masteryRing,
                  state ? styles.masteryRingActive : styles.masteryRingEmpty,
                ]}
              >
                <Text
                  style={[
                    styles.masteryRingText,
                    state && styles.masteryRingTextActive,
                  ]}
                >
                  {state ? "已记录" : "待学习"}
                </Text>
              </View>
            </View>
            <Text style={styles.masteryHint}>
              {state
                ? `最近更新：${formatUpdatedAt(state.updated_at)}。学习状态由服务器维护，客户端不重新计算。`
                : "完成 AI 提问、提示或快速检测后，服务器会形成新的学习证据。"}
            </Text>
          </View>

          <Text style={styles.sectionTitle}>同章知识点</Text>
          {relatedPoints.length === 0 ? (
            <Text style={styles.emptyText}>本章暂无其他知识点。</Text>
          ) : (
            <View style={styles.relatedList}>
              {relatedPoints.map((item) => (
                <Pressable
                  key={item.id}
                  onPress={() => openPoint(item)}
                  style={({ pressed }) => [
                    styles.relatedRow,
                    pressed && styles.pressed,
                  ]}
                >
                  <View style={styles.relatedDot} />
                  <View style={styles.relatedCopy}>
                    <Text style={styles.relatedTitle}>{item.name}</Text>
                    <Text numberOfLines={1} style={styles.relatedText}>
                      {item.description || "教师暂未补充说明"}
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
          )}

          <Text style={styles.sectionTitle}>教材来源</Text>
          <View style={styles.unavailableCard}>
            <SymbolView
              name={{ android: "menu_book", web: "menu_book" }}
              size={18}
              tintColor={studentTheme.color.warning}
            />
            <View style={styles.unavailableCopy}>
              <Text style={styles.unavailableTitle}>暂无课程教材来源</Text>
              <Text style={styles.unavailableText}>
                暂未提供可追溯的教材名称、章节和页码。
              </Text>
            </View>
          </View>

          <Text style={styles.sectionTitle}>最近学习证据</Text>
          <View style={styles.evidenceCard}>
            <Text style={styles.evidenceTitle}>
              {state ? "已有学习状态记录" : "暂无学习证据"}
            </Text>
            <Text style={styles.evidenceText}>
              {state
                ? `当前状态 ${Math.round(state.score)}%，更新时间 ${formatUpdatedAt(state.updated_at)}。`
                : "完成一次学习活动后，证据会显示在这里。"}
            </Text>
            <Text style={styles.gapText}>
              更多学习证据将在后续开放。
            </Text>
          </View>

          <Text style={styles.sectionTitle}>ECHO 学习建议</Text>
          <View style={styles.suggestionCard}>
            <View style={styles.suggestionIcon}>
              <SymbolView
                name={{ android: "auto_awesome", web: "auto_awesome" }}
                size={18}
                tintColor={studentTheme.color.violet}
              />
            </View>
            <View style={styles.suggestionCopy}>
              <Text style={styles.suggestionTitle}>
                {state
                  ? `继续围绕“${point.name}”提出问题或完成练习。`
                  : `先阅读“${point.name}”的说明，再向 ECHO 提问。`}
              </Text>
              <Text style={styles.suggestionText}>
                当前建议基于真实课程结构和学习状态生成，不调用额外 LLM。
              </Text>
            </View>
          </View>

          <View style={styles.actions}>
            <View style={[styles.actionButton, styles.actionDisabled]}>
              <SymbolView
                name={{ android: "quiz", web: "quiz" }}
                size={18}
                tintColor={studentTheme.color.textSubtle}
              />
              <Text style={styles.actionDisabledText}>5 分钟巩固 · 即将开放</Text>
            </View>
            <Pressable
              onPress={() =>
                router.push({
                  pathname: "/chat",
                  params: { courseId: effectiveCourseId, knowledgePointId: point.id },
                })
              }
              style={({ pressed }) => [
                styles.actionButton,
                styles.actionPrimary,
                pressed && styles.pressed,
              ]}
            >
              <SymbolView
                name={{ android: "forum", web: "forum" }}
                size={18}
                tintColor="#ffffff"
              />
              <Text style={styles.actionPrimaryText}>继续提问</Text>
            </Pressable>
          </View>
        </ScrollView>
      </PageFade>
    </SafeAreaView>
  );
}

function KnowledgeDetailSkeleton() {
  return (
    <SafeAreaView edges={["top"]} style={styles.screen}>
      <DetailHeader onBack={() => router.back()} title="知识点详情" />
      <View style={styles.skeletonContent}>
        <SkeletonBlock style={styles.skeletonIdentity} />
        <SkeletonBlock style={styles.skeletonMastery} />
        <SkeletonLine width={98} height={16} />
        {[0, 1, 2].map((item) => (
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
  identityCard: {
    backgroundColor: studentTheme.color.surface,
    borderColor: studentTheme.color.border,
    borderRadius: studentTheme.radius.hero,
    borderWidth: 1,
    padding: 18,
  },
  identityTop: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
  },
  identityIcon: {
    alignItems: "center",
    backgroundColor: studentTheme.color.hintSoft,
    borderRadius: 12,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  identityCopy: {
    flex: 1,
  },
  eyebrow: {
    color: studentTheme.color.violet,
    fontSize: 11,
    fontWeight: "800",
  },
  pointName: {
    color: studentTheme.color.text,
    fontSize: 23,
    fontWeight: "900",
    marginTop: 4,
  },
  chapterBadge: {
    alignSelf: "flex-start",
    backgroundColor: studentTheme.color.primarySoft,
    borderRadius: studentTheme.radius.pill,
    marginTop: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  chapterBadgeText: {
    color: studentTheme.color.primary,
    fontSize: 11,
    fontWeight: "800",
  },
  pointDescription: {
    color: studentTheme.color.textMuted,
    fontSize: 14,
    lineHeight: 22,
    marginTop: 14,
  },
  masteryCard: {
    backgroundColor: studentTheme.color.successSoft,
    borderColor: studentTheme.color.successBorder,
    borderRadius: studentTheme.radius.card,
    borderWidth: 1,
    padding: 16,
  },
  masteryHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  sectionEyebrow: {
    color: "#2f7455",
    fontSize: 11,
    fontWeight: "800",
  },
  masteryValue: {
    color: studentTheme.color.text,
    fontSize: 22,
    fontWeight: "900",
    marginTop: 5,
  },
  masteryRing: {
    alignItems: "center",
    borderRadius: studentTheme.radius.pill,
    height: 56,
    justifyContent: "center",
    width: 56,
  },
  masteryRingActive: {
    backgroundColor: studentTheme.color.success,
  },
  masteryRingEmpty: {
    backgroundColor: studentTheme.color.surfaceSoft,
  },
  masteryRingText: {
    color: studentTheme.color.textMuted,
    fontSize: 9,
    fontWeight: "800",
  },
  masteryRingTextActive: {
    color: "#ffffff",
  },
  masteryHint: {
    color: "#39725a",
    fontSize: 11,
    lineHeight: 18,
    marginTop: 13,
  },
  sectionTitle: {
    color: studentTheme.color.text,
    fontSize: 17,
    fontWeight: "900",
  },
  relatedList: {
    gap: 9,
  },
  relatedRow: {
    alignItems: "center",
    backgroundColor: studentTheme.color.surface,
    borderColor: studentTheme.color.border,
    borderRadius: studentTheme.radius.card,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    padding: 13,
  },
  relatedDot: {
    backgroundColor: studentTheme.color.violet,
    borderRadius: studentTheme.radius.pill,
    height: 8,
    width: 8,
  },
  relatedCopy: {
    flex: 1,
    minWidth: 0,
  },
  relatedTitle: {
    color: studentTheme.color.text,
    fontSize: 13,
    fontWeight: "800",
  },
  relatedText: {
    color: studentTheme.color.textMuted,
    fontSize: 11,
    marginTop: 4,
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
    marginTop: 4,
  },
  evidenceCard: {
    backgroundColor: studentTheme.color.surface,
    borderColor: studentTheme.color.border,
    borderRadius: studentTheme.radius.card,
    borderWidth: 1,
    padding: 14,
  },
  evidenceTitle: {
    color: studentTheme.color.text,
    fontSize: 13,
    fontWeight: "800",
  },
  evidenceText: {
    color: studentTheme.color.textMuted,
    fontSize: 11,
    lineHeight: 17,
    marginTop: 5,
  },
  gapText: {
    color: studentTheme.color.warning,
    fontSize: 10,
    marginTop: 8,
  },
  suggestionCard: {
    alignItems: "flex-start",
    backgroundColor: studentTheme.color.hintSoft,
    borderColor: studentTheme.color.hintBorder,
    borderRadius: studentTheme.radius.card,
    borderWidth: 1,
    flexDirection: "row",
    gap: 11,
    padding: 14,
  },
  suggestionIcon: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 10,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  suggestionCopy: {
    flex: 1,
  },
  suggestionTitle: {
    color: studentTheme.color.text,
    fontSize: 13,
    fontWeight: "800",
    lineHeight: 19,
  },
  suggestionText: {
    color: studentTheme.color.textMuted,
    fontSize: 11,
    lineHeight: 17,
    marginTop: 5,
  },
  actions: {
    gap: 10,
    marginTop: 4,
  },
  actionButton: {
    alignItems: "center",
    borderRadius: studentTheme.radius.medium,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    minHeight: 46,
    paddingHorizontal: 14,
  },
  actionPrimary: {
    backgroundColor: studentTheme.color.primary,
  },
  actionDisabled: {
    backgroundColor: studentTheme.color.surface,
    borderColor: studentTheme.color.border,
    borderWidth: 1,
  },
  actionPrimaryText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "800",
  },
  actionDisabledText: {
    color: studentTheme.color.textMuted,
    fontSize: 13,
    fontWeight: "700",
  },
  emptyText: {
    color: studentTheme.color.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  skeletonContent: {
    gap: 14,
    padding: 16,
  },
  skeletonIdentity: {
    height: 178,
  },
  skeletonMastery: {
    height: 140,
  },
  skeletonRow: {
    height: 68,
  },
  pressed: {
    opacity: 0.76,
  },
});
