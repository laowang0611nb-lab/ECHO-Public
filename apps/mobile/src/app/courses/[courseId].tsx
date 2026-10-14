import { SymbolView } from "expo-symbols";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  EmptyState,
  ErrorState,
  OfflineBanner,
  OfflineState,
} from "@/components/states/page-state";
import { SkeletonBlock, SkeletonLine } from "@/components/states/skeleton";
import { DetailHeader } from "@/components/student/detail-header";
import { CourseAnnouncementSheet } from "@/components/student/course-announcement-sheet";
import { PageFade } from "@/components/student/page-fade";
import {
  ResourceListSheet,
} from "@/components/student/course-resource-sheet";
import { studentTheme } from "@/constants/student-theme";
import { learningEventIcon } from "@/features/learning/learning-event-view-model";
import { useStudentCourseData } from "@/features/learning/use-student-course-data";
import { isOfflineError } from "@/lib/service-status";
import { useCurrentCourse } from "@/providers/current-course-provider";
import { useStudentSession } from "@/providers/student-session-provider";

function firstParam(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function formatShortDate(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
}

function courseStatusLabel(status: string): string {
  if (status === "archived") return "已归档";
  if (status === "draft") return "准备中";
  return "进行中";
}

function taskStatusLabel(status: string): string {
  if (status === "completed") return "已完成";
  if (status === "in_progress") return "进行中";
  if (status === "overdue") return "已延期";
  return "未开始";
}

function chapterStatusLabel(status: string): string {
  if (status === "completed") return "已完成";
  if (status === "in_progress") return "学习中";
  return "未开始";
}

export default function CourseDetailScreen() {
  const params = useLocalSearchParams<{ courseId?: string | string[] }>();
  const routeCourseId = firstParam(params.courseId);
  const { user } = useStudentSession();
  const { selectedCourse, selectCourse } = useCurrentCourse();
  const effectiveCourseId = routeCourseId ?? selectedCourse?.id ?? null;
  const data = useStudentCourseData(user?.id ?? "", effectiveCourseId);
  const [resourceSheetVisible, setResourceSheetVisible] = useState(false);
  const [announcementSheetVisible, setAnnouncementSheetVisible] = useState(false);

  useEffect(() => {
    if (routeCourseId && selectedCourse?.id !== routeCourseId) {
      selectCourse(routeCourseId);
    }
  }, [routeCourseId, selectCourse, selectedCourse?.id]);

  if (!user) return null;

  if (!effectiveCourseId) {
    return (
      <ErrorState
        description="请先选择一门课程。"
        onAction={() => router.replace("/(tabs)/courses")}
        title="还没有当前课程"
      />
    );
  }

  if (data.loading && !data.course) {
    return <CourseDetailSkeleton />;
  }

  if (data.error && !data.course) {
    return isOfflineError(data.error) ? (
      <OfflineState onRetry={() => void data.reload()} />
    ) : (
      <ErrorState
        description="暂时无法加载课程内容，请稍后重试。"
        onAction={() => void data.reload()}
        title="课程加载失败"
      />
    );
  }

  const course = data.course;
  if (!course) {
    return (
      <ErrorState
        description="没有找到这门课程，或当前账号不在课程中。"
        onAction={() => router.replace("/(tabs)/courses")}
        title="课程不可用"
      />
    );
  }

  const offline = isOfflineError(data.error);
  const continueTarget = data.continueTarget;
  const courseIdForLinks = course.id;
  const progressPercent = data.progress?.overall_progress_percent ?? 0;
  const teacherLabel = data.teachers.length
    ? data.teachers.map((teacher) => teacher.display_name).join("、")
    : "授课教师待同步";
  const currentTasks = [...data.planTasks]
    .sort((left, right) => {
      const rank = (status: string) => {
        if (status === "overdue") return 0;
        if (status === "in_progress") return 1;
        if (status === "not_started") return 2;
        return 3;
      };
      return rank(left.status) - rank(right.status) || left.week_number - right.week_number;
    })
    .slice(0, 3);

  function openContinue() {
    if (!continueTarget) return;
    if (continueTarget.knowledgePointId) {
      router.push({
        pathname: "/knowledge/[knowledgePointId]",
        params: {
          knowledgePointId: continueTarget.knowledgePointId,
          courseId: courseIdForLinks,
        },
      });
      return;
    }
    router.push({
      pathname: "/courses/[courseId]/chapters/[chapterId]",
      params: { courseId: courseIdForLinks, chapterId: continueTarget.chapterId },
    });
  }

  return (
    <SafeAreaView edges={["top"]} style={styles.screen}>
      <PageFade>
        <DetailHeader
          onBack={() => router.back()}
          subtitle={[course.term, courseStatusLabel(course.status)]
            .filter(Boolean)
            .join(" · ")}
          title="课程详情"
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
              description="已缓存的课程内容仍可查看，学习写操作暂时不可用。"
              onRetry={() => void data.reload()}
            />
          ) : null}

          <View style={styles.hero}>
            <View style={styles.heroTop}>
              <View style={styles.courseBadge}>
                <Text style={styles.courseBadgeText}>{courseStatusLabel(course.status)}</Text>
              </View>
              {course.course_type ? (
                <Text style={styles.courseType}>{course.course_type}</Text>
              ) : null}
            </View>
            <Text style={styles.courseName}>{course.name}</Text>
            <Text style={styles.courseMeta}>
              {[course.term ?? "学期待同步", teacherLabel].join(" · ")}
            </Text>
            {course.description ? (
              <Text style={styles.courseDescription}>{course.description}</Text>
            ) : (
              <Text style={styles.courseDescription}>教师暂未补充课程简介。</Text>
            )}
          </View>

          <View style={styles.progressCard}>
            <View style={styles.progressHeader}>
              <View>
                <Text style={styles.sectionEyebrow}>当前学习进度</Text>
                <Text style={styles.progressValue}>
                  {`总体进度 ${progressPercent}%`}
                </Text>
              </View>
              <View style={styles.chapterCountBadge}>
                <Text style={styles.chapterCountValue}>
                  {data.touchedChapterCount}/{data.chapters.length}
                </Text>
                <Text style={styles.chapterCountLabel}>已接触章节</Text>
              </View>
            </View>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${progressPercent}%`,
                  },
                ]}
              />
            </View>
            {data.averageMastery !== null ? (
              <Text style={styles.derivedHint}>
                综合掌握 {data.averageMastery}% · 章节完成标准：全部知识点有证据且掌握度不低于 80%
              </Text>
            ) : null}
            <Pressable
              disabled={!continueTarget}
              onPress={openContinue}
              style={({ pressed }) => [
                styles.primaryButton,
                !continueTarget && styles.disabled,
                pressed && styles.pressed,
              ]}
            >
              <SymbolView
                name={{ android: "play_arrow", web: "play_arrow" }}
                size={18}
                tintColor="#ffffff"
              />
              <Text style={styles.primaryButtonText}>
                {continueTarget ? "继续学习" : "暂无可用章节"}
              </Text>
            </Pressable>
            <Pressable
              accessibilityLabel="查看知识图谱"
              accessibilityRole="button"
              onPress={() =>
                router.push({
                  pathname: "/knowledge-graph",
                  params: { courseId: course.id, courseName: course.name },
                })
              }
              style={({ pressed }) => [
                styles.graphButton,
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.graphButtonIcon}>
                <SymbolView
                  name={{ android: "account_tree", web: "account_tree" }}
                  size={18}
                  tintColor={studentTheme.color.primary}
                />
              </View>
              <View style={styles.graphButtonCopy}>
                <Text style={styles.graphButtonTitle}>查看知识图谱</Text>
                <Text style={styles.graphButtonText}>缩放、拖动并聚焦课程知识点关系</Text>
              </View>
              <SymbolView
                name={{ android: "chevron_right", web: "chevron_right" }}
                size={19}
                tintColor={studentTheme.color.textSubtle}
              />
            </Pressable>
            {continueTarget ? (
              <Text style={styles.derivedHint}>
                根据最近学习活动和章节顺序，为你推荐下一步。
              </Text>
            ) : null}
          </View>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>章节目录</Text>
            <Text style={styles.sectionMeta}>{data.chapters.length} 章</Text>
          </View>
          {data.chapters.length === 0 ? (
            <EmptyState
              description="老师暂未发布章节内容。"
              title="暂无章节"
            />
          ) : (
            <View style={styles.chapterList}>
              {data.chapterSummaries.map((item, index) => (
                <Pressable
                  key={item.chapter.id}
                  onPress={() =>
                    router.push({
                      pathname: "/courses/[courseId]/chapters/[chapterId]",
                      params: {
                        courseId: course.id,
                        chapterId: item.chapter.id,
                      },
                    })
                  }
                  style={({ pressed }) => [
                    styles.chapterRow,
                    pressed && styles.pressed,
                  ]}
                >
                  <View style={styles.chapterIndex}>
                    <Text style={styles.chapterIndexText}>
                      {String(index + 1).padStart(2, "0")}
                    </Text>
                  </View>
                  <View style={styles.chapterCopy}>
                    <Text numberOfLines={1} style={styles.chapterTitle}>
                      {item.chapter.title}
                    </Text>
                    <Text numberOfLines={2} style={styles.chapterSummary}>
                      {item.chapter.summary ||
                        `${item.knowledgePointCount} 个核心知识点`}
                    </Text>
                    <View style={styles.chapterMetaRow}>
                      <Text
                        style={[
                          styles.chapterStatus,
                          item.status === "in_progress" && styles.chapterStatusLearning,
                          item.status === "completed" && styles.chapterStatusCompleted,
                        ]}
                      >
                        {chapterStatusLabel(item.status)}
                      </Text>
                      {item.status !== "not_started" ? (
                        <Text style={styles.chapterMastery}>
                          {item.progressPercent}%
                        </Text>
                      ) : null}
                      {item.averageMastery !== null ? (
                        <Text style={styles.chapterMastery}>
                          掌握 {item.averageMastery}%
                        </Text>
                      ) : null}
                    </View>
                  </View>
                  <SymbolView
                    name={{ android: "chevron_right", web: "chevron_right" }}
                    size={20}
                    tintColor={studentTheme.color.textSubtle}
                  />
                </Pressable>
              ))}
            </View>
          )}

          <Text style={styles.sectionTitle}>本周任务</Text>
          {currentTasks.length === 0 ? (
            <View style={styles.unavailableCard}>
              <SymbolView
                name={{ android: "assignment", web: "assignment" }}
                size={18}
                tintColor={studentTheme.color.warning}
              />
              <View style={styles.unavailableCopy}>
                <Text style={styles.unavailableTitle}>暂无学习任务</Text>
                <Text style={styles.unavailableText}>
                  当前计划中没有分配给自己的学习任务。
                </Text>
              </View>
            </View>
          ) : (
            <View style={styles.taskList}>
              {currentTasks.map((task) => (
                <Pressable
                  key={task.id}
                  onPress={() =>
                    task.knowledge_point_ids[0]
                      ? router.push({
                          pathname: "/knowledge/[knowledgePointId]",
                          params: {
                            courseId: course.id,
                            knowledgePointId: task.knowledge_point_ids[0],
                          },
                        })
                      : undefined
                  }
                  style={({ pressed }) => [
                    styles.taskCard,
                    pressed && styles.pressed,
                  ]}
                >
                  <View style={styles.taskTop}>
                    <Text numberOfLines={1} style={styles.taskTitle}>
                      {task.title}
                    </Text>
                    <Text
                      style={[
                        styles.taskStatus,
                        task.status === "completed" && styles.taskStatusCompleted,
                        task.status === "overdue" && styles.taskStatusOverdue,
                      ]}
                    >
                      {taskStatusLabel(task.status)}
                    </Text>
                  </View>
                  <Text numberOfLines={2} style={styles.taskDescription}>
                    {task.description}
                  </Text>
                  <Text style={styles.taskMeta}>
                    {[task.plan_title, `第 ${task.week_number} 周`, task.due_at ? `截止 ${formatShortDate(task.due_at)}` : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>课程资料</Text>
            <Pressable onPress={() => setResourceSheetVisible(true)}>
              <Text style={styles.sectionAction}>查看</Text>
            </Pressable>
          </View>
          <Pressable
            onPress={() => setResourceSheetVisible(true)}
            style={({ pressed }) => [styles.resourceCard, pressed && styles.pressed]}
          >
            <View style={styles.resourceIcon}>
              <SymbolView
                name={{ android: "folder", web: "folder" }}
                size={19}
                tintColor={studentTheme.color.primary}
              />
            </View>
            <View style={styles.resourceCopy}>
              <Text style={styles.resourceTitle}>课程资料清单</Text>
              <Text style={styles.resourceText}>
                {data.resourcesLoading
                  ? "正在读取真实课程资料"
                  : data.resources.length > 0
                    ? `${data.resources.length} 份资料可查看`
                    : "当前课程还没有可查看的资料"}
              </Text>
            </View>
            <SymbolView
              name={{ android: "chevron_right", web: "chevron_right" }}
              size={19}
              tintColor={studentTheme.color.textSubtle}
            />
          </Pressable>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>课程公告</Text>
            <Pressable onPress={() => setAnnouncementSheetVisible(true)}>
              <Text style={styles.sectionAction}>查看</Text>
            </Pressable>
          </View>
          <Pressable
            onPress={() => setAnnouncementSheetVisible(true)}
            style={({ pressed }) => [styles.resourceCard, pressed && styles.pressed]}
          >
            <View style={styles.resourceIcon}>
              <SymbolView
                name={{ android: "campaign", web: "campaign" }}
                size={19}
                tintColor={studentTheme.color.violet}
              />
            </View>
            <View style={styles.resourceCopy}>
              <Text style={styles.resourceTitle}>课程公告与教师消息</Text>
              <Text style={styles.resourceText}>查看老师发布的最新课程安排</Text>
            </View>
            <SymbolView
              name={{ android: "chevron_right", web: "chevron_right" }}
              size={19}
              tintColor={studentTheme.color.textSubtle}
            />
          </Pressable>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>最近学习动态</Text>
            <Pressable onPress={() => router.push("/learning-records")}>
              <Text style={styles.sectionAction}>全部记录</Text>
            </Pressable>
          </View>
          {data.recentActivities.length === 0 ? (
            <EmptyState
              description="完成一次学习后，这里会记录你的学习过程。"
              title="暂无学习动态"
            />
          ) : (
            <View style={styles.activityList}>
              {data.recentActivities.slice(0, 5).map((activity) => (
                <Pressable
                  key={activity.id}
                  onPress={() => {
                    if (activity.conversationId) {
                      router.push({
                        pathname: "/chat",
                        params: {
                          courseId: course.id,
                          conversationId: activity.conversationId,
                        },
                      });
                    } else if (activity.knowledgePointId) {
                      router.push({
                        pathname: "/knowledge/[knowledgePointId]",
                        params: {
                          courseId: course.id,
                          knowledgePointId: activity.knowledgePointId,
                        },
                      });
                    }
                  }}
                  style={({ pressed }) => [
                    styles.activityRow,
                    pressed && styles.pressed,
                  ]}
                >
                  <View
                    style={[
                      styles.activityIcon,
                      activity.kind === "mastery" && styles.activityIconSuccess,
                    ]}
                  >
                    <SymbolView
                      name={{
                        android: activity.eventType
                          ? learningEventIcon(activity.eventType)
                          : activity.kind === "conversation"
                            ? "chat_bubble"
                            : "trending_up",
                        web: activity.eventType
                          ? learningEventIcon(activity.eventType)
                          : activity.kind === "conversation"
                            ? "chat_bubble"
                            : "trending_up",
                      }}
                      size={16}
                      tintColor={
                        activity.kind === "mastery"
                          ? studentTheme.color.success
                          : studentTheme.color.primary
                      }
                    />
                  </View>
                  <View style={styles.activityCopy}>
                    <Text numberOfLines={1} style={styles.activityTitle}>
                      {activity.title}
                    </Text>
                    <Text numberOfLines={1} style={styles.activityText}>
                      {activity.description}
                    </Text>
                  </View>
                  <Text style={styles.activityTime}>
                    {formatShortDate(activity.createdAt)}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
        </ScrollView>
      </PageFade>

      <ResourceListSheet
        error={
          data.resourcesError ? "暂时无法读取课程资料，请稍后重试。" : null
        }
        loading={data.resourcesLoading}
        onClose={() => setResourceSheetVisible(false)}
        onOpenResource={(resource) => {
          if (resource.externalUrl) void Linking.openURL(resource.externalUrl);
        }}
        resources={data.resources.map((resource) => ({
          available: resource.available,
          chapterTitle: resource.chapter_title,
          externalUrl: resource.external_url,
          id: resource.id,
          openable: Boolean(resource.external_url),
          resourceType: resource.resource_type,
          status: resource.status,
          summary: resource.summary,
          title: resource.title,
        }))}
        unavailableReason="课程资料暂未开放查看，请稍后再试。"
        visible={resourceSheetVisible}
      />
      <CourseAnnouncementSheet
        courseId={course.id}
        onClose={() => setAnnouncementSheetVisible(false)}
        visible={announcementSheetVisible}
      />
    </SafeAreaView>
  );
}

function CourseDetailSkeleton() {
  return (
    <SafeAreaView edges={["top"]} style={styles.screen}>
      <DetailHeader onBack={() => router.back()} title="课程详情" />
      <View style={styles.skeletonContent}>
        <SkeletonBlock style={styles.skeletonHero} />
        <SkeletonBlock style={styles.skeletonProgress} />
        <SkeletonLine width={90} height={16} />
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
  hero: {
    backgroundColor: studentTheme.color.surface,
    borderColor: studentTheme.color.border,
    borderRadius: studentTheme.radius.hero,
    borderWidth: 1,
    padding: 20,
    shadowColor: "#17345c",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.05,
    shadowRadius: 18,
  },
  heroTop: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  courseBadge: {
    backgroundColor: studentTheme.color.primarySoft,
    borderRadius: studentTheme.radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  courseBadgeText: {
    color: studentTheme.color.primary,
    fontSize: 11,
    fontWeight: "800",
  },
  courseType: {
    color: studentTheme.color.textMuted,
    fontSize: 11,
  },
  courseName: {
    color: studentTheme.color.text,
    fontSize: 24,
    fontWeight: "900",
    marginTop: 14,
  },
  courseMeta: {
    color: studentTheme.color.primary,
    fontSize: 12,
    fontWeight: "700",
    marginTop: 7,
  },
  courseDescription: {
    color: studentTheme.color.textMuted,
    fontSize: 14,
    lineHeight: 22,
    marginTop: 15,
  },
  progressCard: {
    backgroundColor: studentTheme.color.surface,
    borderColor: studentTheme.color.learningBorder,
    borderRadius: studentTheme.radius.card,
    borderWidth: 1,
    padding: 16,
  },
  progressHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  sectionEyebrow: {
    color: studentTheme.color.textMuted,
    fontSize: 11,
    fontWeight: "700",
  },
  progressValue: {
    color: studentTheme.color.text,
    fontSize: 18,
    fontWeight: "900",
    marginTop: 4,
  },
  chapterCountBadge: {
    alignItems: "center",
    backgroundColor: studentTheme.color.learningSoft,
    borderRadius: studentTheme.radius.medium,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chapterCountValue: {
    color: studentTheme.color.primary,
    fontSize: 16,
    fontWeight: "900",
  },
  chapterCountLabel: {
    color: studentTheme.color.textMuted,
    fontSize: 9,
    marginTop: 2,
  },
  progressTrack: {
    backgroundColor: studentTheme.color.divider,
    borderRadius: studentTheme.radius.pill,
    height: 7,
    marginTop: 15,
    overflow: "hidden",
  },
  progressFill: {
    backgroundColor: studentTheme.color.primary,
    borderRadius: studentTheme.radius.pill,
    height: 7,
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
  graphButton: {
    alignItems: "center",
    backgroundColor: studentTheme.color.primarySoft,
    borderColor: studentTheme.color.primaryBorder,
    borderRadius: studentTheme.radius.medium,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    marginTop: 10,
    minHeight: 58,
    paddingHorizontal: 12,
  },
  graphButtonIcon: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 11,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  graphButtonCopy: {
    flex: 1,
    minWidth: 0,
  },
  graphButtonTitle: {
    color: studentTheme.color.text,
    fontSize: 13,
    fontWeight: "900",
  },
  graphButtonText: {
    color: studentTheme.color.textMuted,
    fontSize: 10,
    marginTop: 3,
  },
  derivedHint: {
    color: studentTheme.color.textSubtle,
    fontSize: 10,
    lineHeight: 15,
    marginTop: 8,
  },
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 3,
  },
  sectionTitle: {
    color: studentTheme.color.text,
    fontSize: 17,
    fontWeight: "900",
  },
  sectionMeta: {
    color: studentTheme.color.textMuted,
    fontSize: 11,
  },
  sectionAction: {
    color: studentTheme.color.primary,
    fontSize: 12,
    fontWeight: "800",
  },
  chapterList: {
    gap: 10,
  },
  chapterRow: {
    alignItems: "center",
    backgroundColor: studentTheme.color.surface,
    borderColor: studentTheme.color.border,
    borderRadius: studentTheme.radius.card,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    padding: 14,
  },
  chapterIndex: {
    alignItems: "center",
    backgroundColor: studentTheme.color.primarySoft,
    borderRadius: 11,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  chapterIndexText: {
    color: studentTheme.color.primary,
    fontSize: 12,
    fontWeight: "900",
  },
  chapterCopy: {
    flex: 1,
    minWidth: 0,
  },
  chapterTitle: {
    color: studentTheme.color.text,
    fontSize: 14,
    fontWeight: "800",
  },
  chapterSummary: {
    color: studentTheme.color.textMuted,
    fontSize: 11,
    lineHeight: 17,
    marginTop: 4,
  },
  chapterMetaRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    marginTop: 7,
  },
  chapterStatus: {
    backgroundColor: studentTheme.color.surfaceSoft,
    borderRadius: studentTheme.radius.pill,
    color: studentTheme.color.textMuted,
    fontSize: 10,
    fontWeight: "800",
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  chapterStatusLearning: {
    backgroundColor: studentTheme.color.primarySoft,
    color: studentTheme.color.primary,
  },
  chapterStatusCompleted: {
    backgroundColor: studentTheme.color.successSoft,
    color: studentTheme.color.success,
  },
  chapterMastery: {
    color: studentTheme.color.success,
    fontSize: 10,
    fontWeight: "800",
  },
  taskList: {
    gap: 9,
  },
  taskCard: {
    backgroundColor: studentTheme.color.surface,
    borderColor: studentTheme.color.border,
    borderRadius: studentTheme.radius.card,
    borderWidth: 1,
    padding: 14,
  },
  taskTop: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  taskTitle: {
    color: studentTheme.color.text,
    flex: 1,
    fontSize: 13,
    fontWeight: "900",
  },
  taskStatus: {
    backgroundColor: studentTheme.color.primarySoft,
    borderRadius: studentTheme.radius.pill,
    color: studentTheme.color.primary,
    fontSize: 10,
    fontWeight: "800",
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  taskStatusCompleted: {
    backgroundColor: studentTheme.color.successSoft,
    color: studentTheme.color.success,
  },
  taskStatusOverdue: {
    backgroundColor: studentTheme.color.warningSoft,
    color: studentTheme.color.warning,
  },
  taskDescription: {
    color: studentTheme.color.textMuted,
    fontSize: 12,
    lineHeight: 19,
    marginTop: 8,
  },
  taskMeta: {
    color: studentTheme.color.textSubtle,
    fontSize: 10,
    marginTop: 9,
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
  resourceCard: {
    alignItems: "center",
    backgroundColor: studentTheme.color.surface,
    borderColor: studentTheme.color.border,
    borderRadius: studentTheme.radius.card,
    borderWidth: 1,
    flexDirection: "row",
    gap: 11,
    padding: 14,
  },
  resourceIcon: {
    alignItems: "center",
    backgroundColor: studentTheme.color.primarySoft,
    borderRadius: 10,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  resourceCopy: {
    flex: 1,
  },
  resourceTitle: {
    color: studentTheme.color.text,
    fontSize: 13,
    fontWeight: "800",
  },
  resourceText: {
    color: studentTheme.color.textMuted,
    fontSize: 11,
    lineHeight: 17,
    marginTop: 4,
  },
  activityList: {
    gap: 9,
  },
  activityRow: {
    alignItems: "center",
    backgroundColor: studentTheme.color.surface,
    borderColor: studentTheme.color.border,
    borderRadius: studentTheme.radius.card,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    padding: 13,
  },
  activityIcon: {
    alignItems: "center",
    backgroundColor: studentTheme.color.primarySoft,
    borderRadius: 10,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  activityIconSuccess: {
    backgroundColor: studentTheme.color.successSoft,
  },
  activityCopy: {
    flex: 1,
    minWidth: 0,
  },
  activityTitle: {
    color: studentTheme.color.text,
    fontSize: 13,
    fontWeight: "800",
  },
  activityText: {
    color: studentTheme.color.textMuted,
    fontSize: 11,
    marginTop: 4,
  },
  activityTime: {
    color: studentTheme.color.textSubtle,
    fontSize: 10,
  },
  skeletonContent: {
    gap: 14,
    padding: 16,
  },
  skeletonHero: {
    height: 176,
  },
  skeletonProgress: {
    height: 148,
  },
  skeletonRow: {
    height: 82,
  },
  pressed: {
    opacity: 0.76,
  },
  disabled: {
    opacity: 0.45,
  },
});
