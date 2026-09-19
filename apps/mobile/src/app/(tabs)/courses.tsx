import { router } from "expo-router";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

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

export default function CoursesScreen() {
  const { user } = useStudentSession();
  const { courses, selectedCourse, selectedCourseId, loading, error, refreshCourses, selectCourse } =
    useCurrentCourse();
  const learning = useStudentLearningOverview(user?.id ?? "", selectedCourse?.id ?? null);
  const archived = selectedCourse?.status === "archived";
  const offline = isOfflineError(error);

  if (loading) {
    return <LoadingState message="正在加载课程..." />;
  }

  if (error && courses.length === 0) {
    return offline ? (
      <OfflineState onRetry={() => void refreshCourses()} />
    ) : (
      <ErrorState
        description="课程列表加载失败，请稍后重试。"
        onAction={() => void refreshCourses()}
      />
    );
  }

  if (courses.length === 0 || !selectedCourse) {
    return (
      <EmptyState
        actionLabel="输入课程码"
        description="输入教师提供的课程码即可开始学习。"
        onAction={() => router.push("/join-course")}
        secondaryActionDisabled
        secondaryActionLabel="扫码加入课程 · 增强版开放"
        title="还没有加入课程"
      />
    );
  }

  function openCourse(courseId: string) {
    selectCourse(courseId);
    router.push(`/courses/${courseId}`);
  }

  return (
    <PageFade>
    <ScrollView contentContainerStyle={styles.content}>
      {offline ? <OfflineBanner onRetry={() => void refreshCourses()} /> : null}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>当前学习课程</Text>
        <Pressable onPress={() => router.push("/join-course")}>
          <Text style={styles.actionText}>加入课程</Text>
        </Pressable>
      </View>

      <View style={styles.currentCard}>
        <View style={styles.currentCardHeader}>
          <Image
            source={require("@/assets/images/student/course-code.png")}
            style={styles.currentCardIcon}
          />
          <View style={styles.currentCardCopy}>
            <Text style={styles.currentEyebrow}>
              {archived ? "已归档" : (selectedCourse.term ?? "课程进行中")}
            </Text>
            <Text style={styles.currentTitle}>{selectedCourse.name}</Text>
            <Text style={styles.currentMeta}>
              {archived
                ? "本课程已归档，仅可查看历史内容。"
                : "授课教师待同步 · 当前章节待同步"}
            </Text>
          </View>
        </View>
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
          <Text style={styles.currentMeta}>
            学习进度待同步 · 综合掌握{" "}
            {learning.averageMastery === null ? "暂无证据" : `${learning.averageMastery}%`}
          </Text>
          <Pressable
            onPress={() => router.push(`/courses/${selectedCourse.id}`)}
            style={styles.continueButton}
          >
            <Text style={styles.continueText}>{archived ? "查看课程" : "继续学习"}</Text>
          </Pressable>
        </View>
      </View>

      <Text style={styles.sectionTitle}>我的课程</Text>
      {courses.map((course) => {
        const selected = course.id === selectedCourseId;
        return (
          <Pressable
            key={course.id}
            onPress={() => openCourse(course.id)}
            style={({ pressed }) => [
              styles.courseRow,
              selected && styles.courseRowSelected,
              pressed && styles.pressed,
            ]}
          >
            <Image
              source={require("@/assets/images/student/course-code.png")}
              style={styles.courseIconImage}
            />
            <View style={styles.courseCopy}>
              <Text style={styles.courseName}>{course.name}</Text>
              <Text style={styles.courseMeta}>
                {course.term ?? "学期待同步"} ·
                {course.status === "archived"
                  ? "已归档"
                  : selected
                    ? "当前课程"
                    : "点击切换"}
              </Text>
            </View>
            <Text style={styles.arrow}>›</Text>
          </Pressable>
        );
      })}

      <Text style={styles.sectionTitle}>最近课程动态</Text>
      <View style={styles.emptyCard}>
        <Text style={styles.emptyTitle}>暂无学习动态</Text>
        <Text style={styles.emptyText}>学习记录接口接入后将在这里展示最近活动。</Text>
      </View>
    </ScrollView>
    </PageFade>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 13,
    padding: 16,
    paddingBottom: 32,
  },
  sectionHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  sectionTitle: {
    color: studentTheme.color.text,
    fontSize: 18,
    fontWeight: "900",
  },
  actionText: {
    color: studentTheme.color.primary,
    fontSize: 13,
    fontWeight: "900",
  },
  currentCard: {
    backgroundColor: studentTheme.color.primary,
    borderRadius: studentTheme.radius.hero,
    padding: 20,
    shadowColor: "#174ea6",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.16,
    shadowRadius: 20,
  },
  currentCardHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 14,
  },
  currentCardCopy: {
    flex: 1,
  },
  currentCardIcon: {
    borderRadius: 16,
    height: 64,
    width: 64,
  },
  currentEyebrow: {
    color: "#dbe8ff",
    fontSize: 12,
    fontWeight: "800",
  },
  currentTitle: {
    color: "#ffffff",
    fontSize: 25,
    fontWeight: "900",
    marginTop: 6,
  },
  currentMeta: {
    color: "#e4eeff",
    fontSize: 12,
    lineHeight: 18,
    marginTop: 6,
  },
  progressTrack: {
    backgroundColor: "rgba(255,255,255,0.25)",
    borderRadius: 999,
    height: 8,
    marginTop: 17,
    overflow: "hidden",
  },
  progressFill: {
    backgroundColor: "#ffffff",
    borderRadius: 999,
    height: 8,
  },
  cardFooter: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 12,
  },
  continueButton: {
    backgroundColor: "#ffffff",
    borderRadius: studentTheme.radius.medium,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  continueText: {
    color: studentTheme.color.primary,
    fontSize: 12,
    fontWeight: "900",
  },
  courseRow: {
    alignItems: "center",
    backgroundColor: studentTheme.color.surface,
    borderColor: studentTheme.color.border,
    borderRadius: studentTheme.radius.card,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    padding: 14,
  },
  courseRowSelected: {
    backgroundColor: studentTheme.color.surfaceBlue,
    borderColor: studentTheme.color.primary,
  },
  courseIconImage: {
    borderRadius: 12,
    height: 42,
    width: 42,
  },
  courseCopy: {
    flex: 1,
  },
  courseName: {
    color: studentTheme.color.text,
    fontSize: 15,
    fontWeight: "900",
  },
  courseMeta: {
    color: studentTheme.color.textMuted,
    fontSize: 12,
    marginTop: 4,
  },
  arrow: {
    color: studentTheme.color.textMuted,
    fontSize: 24,
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
    fontSize: 15,
    fontWeight: "900",
  },
  emptyText: {
    color: studentTheme.color.textMuted,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 6,
  },
  pressed: {
    opacity: 0.76,
  },
});
