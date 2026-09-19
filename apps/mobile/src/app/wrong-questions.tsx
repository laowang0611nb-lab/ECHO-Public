import type {
  QuickCheckBlock,
  WrongQuestionDetail,
  WrongQuestionSummary,
} from "@echo/shared-types";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { SymbolView } from "expo-symbols";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
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
} from "@/components/states/page-state";
import { DetailHeader } from "@/components/student/detail-header";
import { PageFade } from "@/components/student/page-fade";
import { studentTheme } from "@/constants/student-theme";
import { QuickCheckCard } from "@/features/chat/chat-message";
import { apiClient } from "@/lib/api-client";
import { isOfflineError } from "@/lib/service-status";
import { useCurrentCourse } from "@/providers/current-course-provider";
import { useStudentSession } from "@/providers/student-session-provider";

type WrongFilter = "all" | "unresolved" | "resolved";

const filters: { id: WrongFilter; label: string }[] = [
  { id: "all", label: "全部" },
  { id: "unresolved", label: "待复习" },
  { id: "resolved", label: "已掌握" },
];

function formatDate(value: string): string {
  return new Date(value).toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function wrongQuestionBlock(question: WrongQuestionDetail): QuickCheckBlock {
  return {
    type: "quick_check",
    question_id: question.question.question_id,
    title: question.question.title,
    prompt: question.question.prompt,
    options: question.options,
    status: "unanswered",
    selected_option_id: null,
    attempts_remaining: null,
    correct: null,
    explanation: null,
    hint: null,
  };
}

export default function WrongQuestionsScreen() {
  const { user } = useStudentSession();
  const { selectedCourse } = useCurrentCourse();
  const queryClient = useQueryClient();
  const [activeFilter, setActiveFilter] = useState<WrongFilter>("all");
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(
    null,
  );
  const courseId = selectedCourse?.id ?? "";
  const userId = user?.id ?? "";

  const listQuery = useInfiniteQuery({
    queryKey: ["student-wrong-questions", userId, courseId, activeFilter],
    queryFn: ({ pageParam }) =>
      apiClient.listWrongQuestions(userId, courseId, userId, {
        cursor: pageParam,
        limit: 20,
        status: activeFilter === "all" ? undefined : activeFilter,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
    enabled: Boolean(userId && courseId),
  });

  const unresolvedCountQuery = useQuery({
    queryKey: ["student-wrong-questions-count", userId, courseId, "unresolved"],
    queryFn: () =>
      apiClient.listWrongQuestions(userId, courseId, userId, {
        limit: 1,
        status: "unresolved",
      }),
    enabled: Boolean(userId && courseId),
  });
  const resolvedCountQuery = useQuery({
    queryKey: ["student-wrong-questions-count", userId, courseId, "resolved"],
    queryFn: () =>
      apiClient.listWrongQuestions(userId, courseId, userId, {
        limit: 1,
        status: "resolved",
      }),
    enabled: Boolean(userId && courseId),
  });
  const detailQuery = useQuery({
    queryKey: ["student-wrong-question-detail", userId, courseId, selectedQuestionId],
    queryFn: () =>
      apiClient.getWrongQuestion(
        userId,
        courseId,
        userId,
        selectedQuestionId ?? "",
      ),
    enabled: Boolean(userId && courseId && selectedQuestionId),
  });

  const offline = isOfflineError(listQuery.error);
  const questions = useMemo(
    () => listQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [listQuery.data?.pages],
  );
  const suggestions = useMemo(
    () =>
      [...questions]
        .filter((question) => question.review_status === "unresolved")
        .sort(
          (left, right) =>
            right.wrong_count - left.wrong_count ||
            right.latest_wrong_at.localeCompare(left.latest_wrong_at),
        )
        .slice(0, 3),
    [questions],
  );
  const unresolvedCount =
    unresolvedCountQuery.data?.total ?? (activeFilter === "unresolved" ? listQuery.data?.pages[0]?.total : undefined);
  const resolvedCount =
    resolvedCountQuery.data?.total ?? (activeFilter === "resolved" ? listQuery.data?.pages[0]?.total : undefined);

  async function reload() {
    await Promise.all([
      listQuery.refetch(),
      unresolvedCountQuery.refetch(),
      resolvedCountQuery.refetch(),
    ]);
  }

  async function submitRetry(
    question: WrongQuestionDetail,
    optionId: string,
    attemptId: string,
  ) {
    const result = await apiClient.submitQuickCheck(
      userId,
      question.question.question_id,
      {
        attempt_id: attemptId,
        question_id: question.question.question_id,
        selected_option_id: optionId,
      },
    );
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["student-wrong-questions", userId, courseId],
      }),
      queryClient.invalidateQueries({
        queryKey: ["student-wrong-question-detail", userId, courseId],
      }),
      queryClient.invalidateQueries({
        queryKey: ["student-wrong-questions-count", userId, courseId],
      }),
      queryClient.invalidateQueries({
        queryKey: ["student-mastery", userId, courseId],
      }),
      queryClient.invalidateQueries({
        queryKey: ["student-course-progress", userId, courseId],
      }),
      queryClient.invalidateQueries({
        queryKey: ["student-learning-events", userId, courseId],
      }),
      queryClient.invalidateQueries({
        queryKey: ["knowledge-point-learning-events"],
      }),
    ]);
    return result;
  }

  if (!user || !selectedCourse) {
    return (
      <ErrorState
        description="请先选择一门课程。"
        onAction={() => router.replace("/(tabs)/courses")}
        title="还没有当前课程"
      />
    );
  }

  return (
    <SafeAreaView edges={["top"]} style={styles.screen}>
      <PageFade>
        <DetailHeader
          onBack={() => router.back()}
          subtitle={selectedCourse.name}
          title="错题整理"
        />
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              colors={[studentTheme.color.primary]}
              onRefresh={() => void reload()}
              refreshing={false}
              tintColor={studentTheme.color.primary}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          {offline ? (
            <OfflineBanner
              description="已缓存的错题仍可查看，再次练习暂不可用。"
              onRetry={() => void reload()}
            />
          ) : null}
          <View style={styles.hero}>
            <View style={styles.heroIcon}>
              <SymbolView
                name={{ android: "replay", web: "replay" }}
                size={23}
                tintColor={studentTheme.color.primary}
              />
            </View>
            <Text style={styles.eyebrow}>本周重点复习</Text>
            <Text style={styles.heroTitle}>把错误变成下一次学习行动</Text>
            <View style={styles.metrics}>
              <View style={styles.metric}>
                <Text style={styles.metricValue}>
                  {unresolvedCount ?? "--"}
                </Text>
                <Text style={styles.metricLabel}>待复习</Text>
              </View>
              <View style={styles.metric}>
                <Text style={styles.metricValue}>{resolvedCount ?? "--"}</Text>
                <Text style={styles.metricLabel}>已掌握</Text>
              </View>
            </View>
            <Pressable
              disabled={!questions.some(
                (question) => question.review_status === "unresolved",
              )}
              onPress={() => setActiveFilter("unresolved")}
              style={({ pressed }) => [
                styles.primaryButton,
                !questions.some(
                  (question) => question.review_status === "unresolved",
                ) && styles.disabled,
                pressed && styles.pressed,
              ]}
            >
              <SymbolView
                name={{ android: "play_arrow", web: "play_arrow" }}
                size={18}
                tintColor="#ffffff"
              />
              <Text style={styles.primaryButtonText}>开始复习</Text>
            </Pressable>
          </View>

          <View style={styles.filterRow}>
            {filters.map((filter) => {
              const selected = filter.id === activeFilter;
              return (
                <Pressable
                  key={filter.id}
                  onPress={() => setActiveFilter(filter.id)}
                  style={[styles.filter, selected && styles.filterSelected]}
                >
                  <Text
                    style={[
                      styles.filterText,
                      selected && styles.filterTextSelected,
                    ]}
                  >
                    {filter.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.sectionTitle}>错题卡</Text>
          {listQuery.isLoading ? (
            <View style={styles.loadingCard}>
              <ActivityIndicator color={studentTheme.color.primary} />
              <Text style={styles.loadingText}>正在读取真实错题记录</Text>
            </View>
          ) : listQuery.isError && questions.length === 0 ? (
            <ErrorState
              description="暂时无法加载错题，请稍后重试。"
              onAction={() => void listQuery.refetch()}
              title="错题加载失败"
            />
          ) : questions.length === 0 ? (
            <EmptyState
              description="完成快速验证后，答错的题目会在这里形成复习入口。"
              title="暂时没有需要复习的错题"
            />
          ) : (
            <View style={styles.questionList}>
              {questions.map((question) => (
                <WrongQuestionCard
                  key={question.question_id}
                  onPress={() => setSelectedQuestionId(question.question_id)}
                  question={question}
                />
              ))}
            </View>
          )}

          {listQuery.hasNextPage ? (
            <Pressable
              disabled={listQuery.isFetchingNextPage}
              onPress={() => void listQuery.fetchNextPage()}
              style={({ pressed }) => [
                styles.loadMore,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.loadMoreText}>
                {listQuery.isFetchingNextPage ? "正在加载..." : "加载更多错题"}
              </Text>
            </Pressable>
          ) : null}

          <Text style={styles.sectionTitle}>ECHO 复习建议</Text>
          <View style={styles.suggestionCard}>
            <SymbolView
              name={{ android: "auto_awesome", web: "auto_awesome" }}
              size={18}
              tintColor={studentTheme.color.violet}
            />
            <View style={styles.suggestionCopy}>
              {suggestions.length > 0 ? (
                <>
                  <Text style={styles.suggestionTitle}>
                    优先复习错误次数最多的知识点
                  </Text>
                  {suggestions.map((question) => (
                    <Text key={question.question_id} style={styles.suggestionItem}>
                      {question.knowledge_point_name || question.title} · 错误 {question.wrong_count} 次
                    </Text>
                  ))}
                </>
              ) : (
                <>
                  <Text style={styles.suggestionTitle}>暂无需要复习的错题</Text>
                  <Text style={styles.suggestionText}>
                    当前没有未解决的错题，继续保持。
                  </Text>
                </>
              )}
            </View>
          </View>
        </ScrollView>
      </PageFade>

      <WrongQuestionDetailSheet
        detail={detailQuery.data ?? null}
        error={
          detailQuery.error instanceof Error
            ? "暂时无法读取题目解析，请稍后重试。"
            : null
        }
        loading={detailQuery.isLoading}
        disabled={offline}
        onClose={() => setSelectedQuestionId(null)}
        onSubmit={(question, optionId, attemptId) =>
          submitRetry(question, optionId, attemptId)
        }
        visible={Boolean(selectedQuestionId)}
      />
    </SafeAreaView>
  );
}

function WrongQuestionCard({
  question,
  onPress,
}: {
  question: WrongQuestionSummary;
  onPress: () => void;
}) {
  const resolved = question.review_status === "resolved";
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.questionCard,
        resolved && styles.questionCardResolved,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.questionTop}>
        <Text numberOfLines={2} style={styles.questionTitle}>
          {question.title}
        </Text>
        <Text
          style={[
            styles.statusBadge,
            resolved && styles.statusBadgeResolved,
          ]}
        >
          {resolved ? "已掌握" : "待复习"}
        </Text>
      </View>
      <Text numberOfLines={2} style={styles.questionPrompt}>
        {question.prompt}
      </Text>
      <Text style={styles.questionMeta}>
        {[question.chapter_title, question.knowledge_point_name]
          .filter(Boolean)
          .join(" · ")}
      </Text>
      <View style={styles.questionFooter}>
        <Text style={styles.wrongCount}>错误 {question.wrong_count} 次</Text>
        <Text style={styles.wrongTime}>
          最近 {formatDate(question.latest_wrong_at)}
        </Text>
        {question.mastery !== null ? (
          <Text style={styles.masteryText}>
            掌握 {Math.round(question.mastery)}%
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

function WrongQuestionDetailSheet({
  detail,
  error,
  loading,
  disabled,
  onClose,
  onSubmit,
  visible,
}: {
  detail: WrongQuestionDetail | null;
  error: string | null;
  loading: boolean;
  disabled: boolean;
  onClose: () => void;
  onSubmit: (
    detail: WrongQuestionDetail,
    optionId: string,
    attemptId: string,
  ) => Promise<import("@echo/shared-types").QuickCheckAttemptResponse>;
  visible: boolean;
}) {
  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.sheetHeader}>
            <View>
              <Text style={styles.sheetTitle}>错题详情与再次练习</Text>
              <Text style={styles.sheetSubtitle}>复用真实快速验证提交链路</Text>
            </View>
            <Pressable onPress={onClose} style={styles.closeButton}>
              <SymbolView
                name={{ android: "close", web: "close" }}
                size={20}
                tintColor={studentTheme.color.text}
              />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.sheetContent}
            showsVerticalScrollIndicator={false}
          >
            {loading ? (
              <View style={styles.loadingCard}>
                <ActivityIndicator color={studentTheme.color.primary} />
                <Text style={styles.loadingText}>正在读取题目解析</Text>
              </View>
            ) : error && !detail ? (
              <ErrorState description={error} title="题目加载失败" />
            ) : detail ? (
              <>
                <View style={styles.detailCard}>
                  <Text style={styles.detailTitle}>{detail.question.title}</Text>
                  <Text style={styles.detailPrompt}>{detail.question.prompt}</Text>
                  <Text style={styles.detailMeta}>
                    {[detail.question.chapter_title, detail.question.knowledge_point_name]
                      .filter(Boolean)
                      .join(" · ")}
                  </Text>
                  {detail.explanation ? (
                    <View style={styles.explanationCard}>
                      <Text style={styles.explanationTitle}>原题解析</Text>
                      <Text style={styles.explanationText}>
                        {detail.explanation}
                      </Text>
                    </View>
                  ) : null}
                  {detail.source_page ? (
                    <Text style={styles.sourceText}>
                      教材来源第 {detail.source_page} 页
                    </Text>
                  ) : null}
                </View>
                {detail.question.review_status === "resolved" ? (
                  <View style={styles.resolvedNotice}>
                    <SymbolView
                      name={{ android: "check_circle", web: "check_circle" }}
                      size={20}
                      tintColor={studentTheme.color.success}
                    />
                    <View style={styles.resolvedCopy}>
                      <Text style={styles.resolvedTitle}>这道错题已经掌握</Text>
                      <Text style={styles.resolvedText}>
                        最近一次快速验证已经答对，ECHO 已将该错题标记为已掌握。
                      </Text>
                    </View>
                  </View>
                ) : (
                  disabled ? (
                    <View style={styles.offlineNotice}>
                      <Text style={styles.offlineNoticeText}>
                        当前为离线缓存，连接恢复后可以再次练习。
                      </Text>
                    </View>
                  ) : (
                    <QuickCheckCard
                      block={wrongQuestionBlock(detail)}
                      disabled={false}
                      onSubmit={(optionId, attemptId) =>
                        onSubmit(detail, optionId, attemptId)
                      }
                    />
                  )
                )}
              </>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: studentTheme.color.background,
    flex: 1,
  },
  content: {
    gap: 15,
    padding: 16,
    paddingBottom: 36,
  },
  hero: {
    backgroundColor: studentTheme.color.surface,
    borderColor: studentTheme.color.primaryBorder,
    borderRadius: studentTheme.radius.hero,
    borderWidth: 1,
    padding: 18,
  },
  heroIcon: {
    alignItems: "center",
    backgroundColor: studentTheme.color.primarySoft,
    borderRadius: 12,
    height: 44,
    justifyContent: "center",
    width: 44,
  },
  eyebrow: {
    color: studentTheme.color.primary,
    fontSize: 11,
    fontWeight: "800",
    marginTop: 13,
  },
  heroTitle: {
    color: studentTheme.color.text,
    fontSize: 21,
    fontWeight: "900",
    lineHeight: 29,
    marginTop: 5,
  },
  metrics: {
    flexDirection: "row",
    gap: 10,
    marginTop: 16,
  },
  metric: {
    backgroundColor: studentTheme.color.surfaceSoft,
    borderRadius: studentTheme.radius.card,
    flex: 1,
    padding: 12,
  },
  metricValue: {
    color: studentTheme.color.text,
    fontSize: 21,
    fontWeight: "900",
  },
  metricLabel: {
    color: studentTheme.color.textMuted,
    fontSize: 10,
    marginTop: 4,
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
    fontSize: 13,
    fontWeight: "800",
  },
  disabled: {
    opacity: 0.45,
  },
  filterRow: {
    flexDirection: "row",
    gap: 8,
  },
  filter: {
    alignItems: "center",
    backgroundColor: studentTheme.color.surface,
    borderColor: studentTheme.color.border,
    borderRadius: studentTheme.radius.pill,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
    minHeight: 36,
  },
  filterSelected: {
    backgroundColor: studentTheme.color.primarySoft,
    borderColor: studentTheme.color.primaryBorder,
  },
  filterText: {
    color: studentTheme.color.textMuted,
    fontSize: 11,
    fontWeight: "800",
  },
  filterTextSelected: {
    color: studentTheme.color.primary,
  },
  sectionTitle: {
    color: studentTheme.color.text,
    fontSize: 17,
    fontWeight: "900",
  },
  questionList: {
    gap: 10,
  },
  questionCard: {
    backgroundColor: studentTheme.color.surface,
    borderColor: studentTheme.color.border,
    borderRadius: studentTheme.radius.card,
    borderWidth: 1,
    padding: 15,
  },
  questionCardResolved: {
    borderColor: studentTheme.color.successBorder,
  },
  questionTop: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10,
  },
  questionTitle: {
    color: studentTheme.color.text,
    flex: 1,
    fontSize: 14,
    fontWeight: "900",
    lineHeight: 20,
  },
  statusBadge: {
    backgroundColor: studentTheme.color.warningSoft,
    borderRadius: studentTheme.radius.pill,
    color: studentTheme.color.warning,
    fontSize: 10,
    fontWeight: "800",
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusBadgeResolved: {
    backgroundColor: studentTheme.color.successSoft,
    color: studentTheme.color.success,
  },
  questionPrompt: {
    color: studentTheme.color.textMuted,
    fontSize: 12,
    lineHeight: 19,
    marginTop: 8,
  },
  questionMeta: {
    color: studentTheme.color.textSubtle,
    fontSize: 10,
    marginTop: 8,
  },
  questionFooter: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 11,
  },
  wrongCount: {
    color: studentTheme.color.warning,
    fontSize: 10,
    fontWeight: "800",
  },
  wrongTime: {
    color: studentTheme.color.textMuted,
    fontSize: 10,
  },
  masteryText: {
    color: studentTheme.color.success,
    fontSize: 10,
    fontWeight: "800",
  },
  loadingCard: {
    alignItems: "center",
    backgroundColor: studentTheme.color.surface,
    borderColor: studentTheme.color.border,
    borderRadius: studentTheme.radius.card,
    borderWidth: 1,
    gap: 10,
    justifyContent: "center",
    minHeight: 160,
  },
  loadingText: {
    color: studentTheme.color.textMuted,
    fontSize: 12,
  },
  loadMore: {
    alignItems: "center",
    backgroundColor: studentTheme.color.surface,
    borderColor: studentTheme.color.border,
    borderRadius: studentTheme.radius.medium,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 44,
  },
  loadMoreText: {
    color: studentTheme.color.primary,
    fontSize: 13,
    fontWeight: "800",
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
  suggestionCopy: {
    flex: 1,
  },
  suggestionTitle: {
    color: studentTheme.color.text,
    fontSize: 13,
    fontWeight: "900",
  },
  suggestionText: {
    color: studentTheme.color.textMuted,
    fontSize: 11,
    lineHeight: 17,
    marginTop: 5,
  },
  suggestionItem: {
    color: studentTheme.color.textMuted,
    fontSize: 11,
    lineHeight: 18,
    marginTop: 5,
  },
  overlay: {
    backgroundColor: "rgba(12, 28, 48, 0.38)",
    flex: 1,
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: studentTheme.color.background,
    borderTopLeftRadius: studentTheme.radius.sheet,
    borderTopRightRadius: studentTheme.radius.sheet,
    maxHeight: "92%",
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
  sheetHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 14,
  },
  sheetTitle: {
    color: studentTheme.color.text,
    fontSize: 18,
    fontWeight: "900",
  },
  sheetSubtitle: {
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
  sheetContent: {
    gap: 14,
    paddingBottom: 28,
    paddingTop: 16,
  },
  detailCard: {
    backgroundColor: studentTheme.color.surface,
    borderColor: studentTheme.color.border,
    borderRadius: studentTheme.radius.card,
    borderWidth: 1,
    padding: 15,
  },
  detailTitle: {
    color: studentTheme.color.text,
    fontSize: 14,
    fontWeight: "900",
  },
  detailPrompt: {
    color: studentTheme.color.textMuted,
    fontSize: 12,
    lineHeight: 19,
    marginTop: 8,
  },
  detailMeta: {
    color: studentTheme.color.textSubtle,
    fontSize: 10,
    marginTop: 8,
  },
  explanationCard: {
    backgroundColor: studentTheme.color.primarySoft,
    borderRadius: studentTheme.radius.medium,
    marginTop: 12,
    padding: 12,
  },
  explanationTitle: {
    color: studentTheme.color.primary,
    fontSize: 11,
    fontWeight: "900",
  },
  explanationText: {
    color: studentTheme.color.textMuted,
    fontSize: 12,
    lineHeight: 19,
    marginTop: 6,
  },
  sourceText: {
    color: studentTheme.color.textSubtle,
    fontSize: 10,
    marginTop: 10,
  },
  resolvedNotice: {
    alignItems: "flex-start",
    backgroundColor: studentTheme.color.successSoft,
    borderColor: studentTheme.color.successBorder,
    borderRadius: studentTheme.radius.card,
    borderWidth: 1,
    flexDirection: "row",
    gap: 11,
    padding: 15,
  },
  resolvedCopy: {
    flex: 1,
  },
  resolvedTitle: {
    color: studentTheme.color.success,
    fontSize: 13,
    fontWeight: "900",
  },
  resolvedText: {
    color: studentTheme.color.textMuted,
    fontSize: 11,
    lineHeight: 18,
    marginTop: 5,
  },
  offlineNotice: {
    backgroundColor: studentTheme.color.surface,
    borderColor: studentTheme.color.border,
    borderRadius: studentTheme.radius.card,
    borderWidth: 1,
    padding: 15,
  },
  offlineNoticeText: {
    color: studentTheme.color.textMuted,
    fontSize: 12,
    lineHeight: 19,
  },
  pressed: {
    opacity: 0.76,
  },
});
