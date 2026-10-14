import { router } from "expo-router";
import { BlurTargetView, BlurView } from "expo-blur";
import { SymbolView, type AndroidSymbol } from "expo-symbols";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import {
  ActivityIndicator,
  Image,
  ImageBackground,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type ImageSourcePropType,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

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

const ASK_ECHO_RESERVED_HEIGHT = 160;

export default function AISupportScreen() {
  const { user } = useStudentSession();
  const { courses, selectedCourse, loading, error, refreshCourses } =
    useCurrentCourse();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const compact = width < 390;
  const [question, setQuestion] = useState("");
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const blurTargetRef = useRef<View | null>(null);
  const archived = selectedCourse?.status === "archived";
  const offline = isOfflineError(error);

  const learning = useStudentLearningOverview(
    user?.id ?? "",
    selectedCourse?.id ?? null,
  );
  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSubscription = Keyboard.addListener(showEvent, (event) => {
      setKeyboardHeight(event.endCoordinates.height);
    });
    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);
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
  const currentChapterTitle = useMemo(() => {
    const latestState = [...learning.mastery].sort((left, right) =>
      right.updated_at.localeCompare(left.updated_at),
    )[0];
    if (!latestState) return null;
    return (
      learning.chapters.find((chapter) =>
        chapter.knowledge_points.some(
          (point) => point.id === latestState.knowledge_point_id,
        ),
      )?.title ?? null
    );
  }, [learning.chapters, learning.mastery]);

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
      <ScrollView contentContainerStyle={styles.emptyContent}>
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

  const progressPercent = Math.max(
    0,
    Math.min(100, learning.averageMastery ?? 0),
  );
  const progressLabel =
    learning.averageMastery === null ? "暂无证据" : `${progressPercent}%`;
  const heroTextWidth = Math.max(compact ? 158 : 202, width - (compact ? 146 : 180));

  function openCourse() {
    if (!selectedCourse) return;
    router.push(`/courses/${selectedCourse.id}`);
  }

  function openQuestion() {
    const content = question.trim();
    if (!content || archived) return;
    router.push({
      pathname: "/chat",
      params: { question: content },
    });
    setQuestion("");
  }

  return (
    <PageFade>
      <View style={styles.screen}>
        <BlurTargetView ref={blurTargetRef} style={styles.blurTarget}>
          <ScrollView
          contentContainerStyle={[
            styles.content,
            {
              paddingBottom: ASK_ECHO_RESERVED_HEIGHT + insets.bottom + 24,
              paddingHorizontal: compact ? 14 : 18,
            },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {offline ? (
            <OfflineBanner onRetry={() => void refreshCourses()} />
          ) : null}

          <HeroCard
            archived={archived}
            compact={compact}
            courseName={selectedCourse.name}
            courseTerm={selectedCourse.term ?? "当前学期"}
            heroTextWidth={heroTextWidth}
            onOpenCourse={openCourse}
          />

          {archived ? (
            <View style={styles.archivedBanner}>
              <SymbolView
                name={{ android: "archive", web: "archive" }}
                size={16}
                tintColor={studentTheme.color.warning}
              />
              <Text style={styles.archivedBannerText}>
                本课程已归档，仅可查看历史内容。
              </Text>
            </View>
          ) : null}

          <View style={styles.abilityGrid}>
            <AbilityCard
              description="课程上下文问答"
              disabled={archived}
              iconBackground={studentTheme.color.abilityBlue}
              iconSource={require("@/assets/images/student/ai-support.png")}
              onPress={() => router.push("/chat")}
              title="智能问答"
            />
            <AbilityCard
              description="章节与知识点导学"
              disabled={archived}
              iconBackground={studentTheme.color.abilityOrange}
              iconSource={require("@/assets/images/student/guided-learning.png")}
              onPress={openCourse}
              title="教材导学"
            />
            <AbilityCard
              description="拍照上传图片提问"
              disabled={archived}
              iconBackground={studentTheme.color.abilityPurple}
              iconSource={require("@/assets/images/student/photo-question.png")}
              onPress={() => router.push("/chat")}
              title="拍照识题"
            />
            <AbilityCard
              description="构建课程知识网络"
              disabled={archived}
              iconBackground={studentTheme.color.abilityGreen}
              iconSource={require("@/assets/images/student/knowledge-graph.png")}
              onPress={() =>
                router.push({
                  pathname: "/knowledge-graph",
                  params: {
                    courseId: selectedCourse.id,
                    courseName: selectedCourse.name,
                  },
                })
              }
              title="知识图谱"
            />
          </View>

          <CourseLearningCard
            archived={archived}
            compact={compact}
            courseName={selectedCourse.name}
            courseTerm={selectedCourse.term ?? "学期待同步"}
            currentChapterTitle={currentChapterTitle}
            loading={learning.loading}
            onContinue={openCourse}
            onOpenDetails={openCourse}
            onRefresh={learning.reload}
            progressLabel={progressLabel}
            progressPercent={progressPercent}
          />

          <SectionHeading title="快捷入口" />
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

          <SectionHeading title="ECHO 学习建议" />
          {learning.loading ? (
            <ActivityIndicator color={studentTheme.color.primary} />
          ) : null}
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
              <Text style={styles.emptyText}>
                完成学习后，这里会显示可执行的复习建议。
              </Text>
            </View>
          ) : null}
          {weakestStates.map((state, index) => (
            <Pressable
              key={state.id}
              onPress={() =>
                router.push(`/knowledge/${state.knowledge_point_id}`)
              }
              style={({ pressed }) => [
                styles.suggestion,
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.suggestionIndex}>
                <Text style={styles.suggestionIndexText}>{index + 1}</Text>
              </View>
              <View style={styles.suggestionCopy}>
                <Text style={styles.suggestionTitle}>
                  建议复习“
                  {knowledgePointNames.get(state.knowledge_point_id) ??
                    "薄弱知识点"}
                  ”
                </Text>
                <Text style={styles.suggestionMeta}>
                  当前掌握度 {Math.round(state.score)}%
                </Text>
              </View>
            </Pressable>
          ))}

          <Text style={styles.footerStats}>
            {courses.length} 门课程 · {learning.chapters.length} 个章节
          </Text>
          </ScrollView>
        </BlurTargetView>

        <View
          pointerEvents="box-none"
          style={[
            styles.floatingKeyboardLayer,
            { paddingBottom: keyboardHeight },
          ]}
        >
          <View
            pointerEvents="auto"
            style={[
              styles.floatingAskWrapper,
              { marginBottom: Math.max(insets.bottom, 10) },
            ]}
          >
            <AskEchoCard
              archived={archived}
              blurTarget={blurTargetRef}
              compact={compact}
              onChangeQuestion={setQuestion}
              onOpenChat={() => router.push("/chat")}
              onSubmit={openQuestion}
              question={question}
            />
          </View>
        </View>
      </View>
    </PageFade>
  );
}

function HeroCard({
  archived,
  compact,
  courseName,
  courseTerm,
  heroTextWidth,
  onOpenCourse,
}: {
  archived: boolean;
  compact: boolean;
  courseName: string;
  courseTerm: string;
  heroTextWidth: number;
  onOpenCourse: () => void;
}) {
  const robotSize = compact ? 112 : 136;
  return (
    <View
      style={[
        styles.hero,
        {
          minHeight: compact ? 198 : 212,
          padding: compact ? 14 : 16,
        },
      ]}
    >
      <View style={styles.heroGlowLarge} />
      <View style={styles.heroGlowSmall} />
      <View style={[styles.heroCopy, { maxWidth: heroTextWidth }]}>
        <Pressable
          accessibilityRole="button"
          onPress={onOpenCourse}
          style={({ pressed }) => [
            styles.courseCapsule,
            pressed && styles.pressed,
          ]}
        >
          <View style={styles.courseCapsuleIcon}>
            <SymbolView
              name={{ android: "menu_book", web: "menu_book" }}
              size={15}
              tintColor={studentTheme.color.primary}
            />
          </View>
          <Text numberOfLines={1} style={styles.courseCapsuleName}>
            {courseName}
          </Text>
          <Text numberOfLines={1} style={styles.courseCapsuleTerm}>
            / {archived ? "已归档" : courseTerm}
          </Text>
          <SymbolView
            name={{ android: "chevron_right", web: "chevron_right" }}
            size={16}
            tintColor={studentTheme.color.inkMuted}
          />
        </Pressable>

        <Text style={[styles.heroTitle, compact && styles.heroTitleCompact]}>
          今天想学什么？
        </Text>
        <Text style={styles.heroDescription}>
          AI 根据课程进度，为你推荐学习任务
        </Text>

        <Pressable
          accessibilityRole="button"
          disabled={archived}
          onPress={onOpenCourse}
          style={({ pressed }) => [
            styles.startButton,
            archived && styles.disabled,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.startButtonText}>开始学习</Text>
          <SymbolView
            name={{ android: "arrow_forward", web: "arrow_forward" }}
            size={17}
            tintColor="#ffffff"
          />
        </Pressable>
      </View>

      <View
        pointerEvents="none"
        style={[
          styles.heroRobotFrame,
          compact && styles.heroRobotFrameCompact,
        ]}
      >
        <Image
          resizeMode="contain"
          source={require("@/assets/images/student/ai-support.png")}
          style={{ height: robotSize, width: robotSize }}
        />
      </View>
    </View>
  );
}

function AbilityCard({
  title,
  description,
  iconSource,
  iconBackground,
  onPress,
  disabled = false,
  meta,
}: {
  title: string;
  description: string;
  iconSource: ImageSourcePropType;
  iconBackground: string;
  onPress?: () => void;
  disabled?: boolean;
  meta?: string;
}) {
  return (
    <Pressable
      disabled={disabled || !onPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.abilityCard,
        disabled && styles.abilityCardDisabled,
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.abilityIcon, { backgroundColor: iconBackground }]}>
        <Image
          resizeMode="cover"
          source={iconSource}
          style={styles.abilityImage}
        />
      </View>
      <View style={styles.abilityTitleRow}>
        <Text style={styles.abilityTitle}>{title}</Text>
        <SymbolView
          name={{ android: "chevron_right", web: "chevron_right" }}
          size={19}
          tintColor={studentTheme.color.inkMuted}
        />
      </View>
      <Text style={styles.abilityDescription}>{description}</Text>
      {meta ? <Text style={styles.abilityMeta}>{meta}</Text> : null}
    </Pressable>
  );
}

function CourseLearningCard({
  archived,
  compact,
  courseName,
  courseTerm,
  currentChapterTitle,
  progressLabel,
  progressPercent,
  loading,
  onOpenDetails,
  onContinue,
  onRefresh,
}: {
  archived: boolean;
  compact: boolean;
  courseName: string;
  courseTerm: string;
  currentChapterTitle: string | null;
  progressLabel: string;
  progressPercent: number;
  loading: boolean;
  onOpenDetails: () => void;
  onContinue: () => void;
  onRefresh: () => void;
}) {
  return (
    <View style={styles.courseCard}>
      <View style={styles.courseCardHeader}>
        <View style={styles.courseCardTitleRow}>
          <SymbolView
            name={{ android: "school", web: "school" }}
            size={20}
            tintColor={studentTheme.color.ink}
          />
          <Text style={styles.courseCardTitle}>当前课程学习卡</Text>
        </View>
        <View style={styles.courseCardActions}>
          <Pressable
            accessibilityLabel="刷新学习数据"
            onPress={onRefresh}
            style={({ pressed }) => [
              styles.refreshButton,
              pressed && styles.pressed,
            ]}
          >
            <SymbolView
              name={{ android: "refresh", web: "refresh" }}
              size={16}
              tintColor={studentTheme.color.inkMuted}
            />
          </Pressable>
          <Pressable
            onPress={onOpenDetails}
            style={({ pressed }) => [
              styles.detailLink,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.detailLinkText}>查看详情</Text>
            <SymbolView
              name={{ android: "chevron_right", web: "chevron_right" }}
              size={16}
              tintColor={studentTheme.color.inkMuted}
            />
          </Pressable>
        </View>
      </View>

      <View style={styles.courseBody}>
        <ImageBackground
          imageStyle={styles.courseCoverImage}
          resizeMode="cover"
          source={require("@/assets/images/student/course-code.png")}
          style={[
            styles.courseCover,
            {
              height: compact ? 96 : 108,
              width: compact ? 70 : 78,
            },
          ]}
        >
          <View style={styles.courseCoverOverlay} />
          <Text numberOfLines={3} style={styles.courseCoverText}>
            {courseName}
          </Text>
        </ImageBackground>

        <View style={styles.courseInfo}>
          <Text numberOfLines={1} style={styles.courseName}>
            {courseName}
          </Text>
          <Text numberOfLines={1} style={styles.courseTerm}>
            {courseTerm}
          </Text>

          <View style={styles.progressHeader}>
            <Text style={styles.progressLabel}>整体学习进度</Text>
            <Text style={styles.progressValue}>{progressLabel}</Text>
          </View>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                { width: `${progressPercent}%` },
              ]}
            />
          </View>
          <View style={styles.currentChapterRow}>
            <SymbolView
              name={{ android: "bookmark", web: "bookmark" }}
              size={15}
              tintColor={studentTheme.color.primary}
            />
            <Text numberOfLines={1} style={styles.currentChapterText}>
              当前章节：{currentChapterTitle ?? "暂无学习记录"}
            </Text>
          </View>
          {loading ? (
            <ActivityIndicator
              color={studentTheme.color.primary}
              size="small"
            />
          ) : null}
        </View>
      </View>

      <Pressable
        accessibilityRole="button"
        disabled={archived}
        onPress={onContinue}
        style={({ pressed }) => [
          styles.continueButton,
          archived && styles.disabled,
          pressed && styles.pressed,
        ]}
      >
        <Text style={styles.continueButtonText}>继续学习</Text>
        <SymbolView
          name={{ android: "arrow_forward", web: "arrow_forward" }}
          size={17}
          tintColor="#ffffff"
        />
      </Pressable>
    </View>
  );
}

function AskEchoCard({
  archived,
  blurTarget,
  compact,
  question,
  onChangeQuestion,
  onOpenChat,
  onSubmit,
}: {
  archived: boolean;
  blurTarget: RefObject<View | null>;
  compact: boolean;
  question: string;
  onChangeQuestion: (value: string) => void;
  onOpenChat: () => void;
  onSubmit: () => void;
}) {
  const submitDisabled = archived || !question.trim();
  return (
    <BlurView
      blurTarget={blurTarget}
      blurMethod="dimezisBlurViewSdk31Plus"
      intensity={62}
      tint="light"
      style={styles.askCard}
    >
      <View style={styles.askHeader}>
        <View style={styles.askBrand}>
          <SymbolView
            name={{ android: "auto_awesome", web: "auto_awesome" }}
            size={20}
            tintColor={studentTheme.color.primary}
          />
          <Text style={styles.askTitle}>问 ECHO</Text>
        </View>
        <View style={styles.askHint}>
          <Text numberOfLines={1} style={styles.askHintText}>
            深度思考，更好的学习体验
          </Text>
          <SymbolView
            name={{ android: "chevron_right", web: "chevron_right" }}
            size={14}
            tintColor={studentTheme.color.inkMuted}
          />
        </View>
      </View>

      <View style={styles.askInputRow}>
        <TextInput
          editable={!archived}
          onChangeText={onChangeQuestion}
          onSubmitEditing={onSubmit}
          placeholder={
            archived ? "本课程已归档，仅可查看历史内容" : "输入一个课程问题..."
          }
          placeholderTextColor="#8b96a8"
          returnKeyType="send"
          style={styles.askInput}
          value={question}
        />
        <Pressable
          accessibilityLabel="打开 AI 对话并上传图片"
          disabled={archived}
          onPress={onOpenChat}
          style={({ pressed }) => [
            styles.askImageButton,
            archived && styles.disabled,
            pressed && styles.pressed,
          ]}
        >
          <SymbolView
            name={{ android: "image", web: "image" }}
            size={20}
            tintColor={studentTheme.color.inkMuted}
          />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={submitDisabled}
          onPress={onSubmit}
          style={({ pressed }) => [
            styles.askSubmitButton,
            compact && styles.askSubmitButtonCompact,
            submitDisabled && styles.disabled,
            pressed && styles.pressed,
          ]}
        >
          <Text numberOfLines={1} style={styles.askSubmitText}>
            进入 AI 对话
          </Text>
        </Pressable>
      </View>
    </BlurView>
  );
}

function SectionHeading({ title }: { title: string }) {
  return <Text style={styles.sectionTitle}>{title}</Text>;
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
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.shortcut,
        pressed && styles.pressed,
      ]}
    >
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
  screen: {
    backgroundColor: studentTheme.color.background,
    flex: 1,
  },
  blurTarget: {
    flex: 1,
  },
  content: {
    gap: 11,
    paddingTop: 0,
  },
  emptyContent: {
    padding: 16,
  },
  floatingKeyboardLayer: {
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
    justifyContent: "flex-end",
    zIndex: 20,
    elevation: 20,
  },
  floatingAskWrapper: {
    marginHorizontal: 14,
  },
  hero: {
    backgroundColor: studentTheme.color.aiHero,
    borderRadius: studentTheme.radius.aiCard,
    overflow: "hidden",
    position: "relative",
  },
  heroGlowLarge: {
    backgroundColor: "rgba(255,255,255,0.72)",
    borderRadius: 999,
    height: 196,
    position: "absolute",
    right: -62,
    top: -54,
    width: 196,
  },
  heroGlowSmall: {
    backgroundColor: "rgba(255,255,255,0.58)",
    borderRadius: 999,
    bottom: -42,
    height: 124,
    left: -34,
    position: "absolute",
    width: 124,
  },
  heroCopy: {
    zIndex: 2,
  },
  courseCapsule: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.88)",
    borderColor: "rgba(193,218,248,0.75)",
    borderRadius: studentTheme.radius.pill,
    borderWidth: 1,
    flexDirection: "row",
    gap: 6,
    maxWidth: "100%",
    minHeight: 34,
    paddingHorizontal: 8,
  },
  courseCapsuleIcon: {
    alignItems: "center",
    backgroundColor: studentTheme.color.primarySoft,
    borderRadius: 9,
    height: 24,
    justifyContent: "center",
    width: 24,
  },
  courseCapsuleName: {
    color: studentTheme.color.ink,
    flexShrink: 1,
    fontSize: 12,
    fontWeight: "900",
  },
  courseCapsuleTerm: {
    color: studentTheme.color.inkMuted,
    flexShrink: 1,
    fontSize: 10,
  },
  heroTitle: {
    color: studentTheme.color.ink,
    fontSize: 27,
    fontWeight: "900",
    lineHeight: 34,
    marginTop: 11,
  },
  heroTitleCompact: {
    fontSize: 25,
    lineHeight: 31,
  },
  heroDescription: {
    color: studentTheme.color.inkMuted,
    fontSize: 12,
    lineHeight: 18,
    marginTop: 5,
  },
  startButton: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: studentTheme.color.primary,
    borderRadius: studentTheme.radius.pill,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    marginTop: 12,
    minHeight: 42,
    paddingHorizontal: 18,
  },
  startButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
  },
  heroRobotFrame: {
    alignItems: "center",
    bottom: -1,
    height: 150,
    justifyContent: "flex-end",
    position: "absolute",
    right: -1,
    width: 150,
  },
  heroRobotFrameCompact: {
    height: 122,
    width: 122,
  },
  archivedBanner: {
    alignItems: "center",
    backgroundColor: studentTheme.color.warningSoft,
    borderColor: studentTheme.color.warningBorder,
    borderRadius: studentTheme.radius.medium,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    padding: 12,
  },
  archivedBannerText: {
    color: studentTheme.color.warning,
    flex: 1,
    fontSize: 13,
    fontWeight: "800",
  },
  abilityGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  abilityCard: {
    backgroundColor: studentTheme.color.surface,
    borderColor: studentTheme.color.border,
    borderRadius: studentTheme.radius.ability,
    borderWidth: 1,
    flexBasis: "47%",
    flexGrow: 1,
    minHeight: 140,
    minWidth: 140,
    padding: 12,
    shadowColor: studentTheme.color.shadow,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 2,
  },
  abilityCardDisabled: {
    opacity: 0.58,
  },
  abilityIcon: {
    alignItems: "center",
    borderRadius: 16,
    height: 50,
    justifyContent: "center",
    overflow: "hidden",
    width: 50,
  },
  abilityImage: {
    height: "100%",
    width: "100%",
  },
  abilityTitleRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    justifyContent: "space-between",
    marginTop: 11,
  },
  abilityTitle: {
    color: studentTheme.color.ink,
    flex: 1,
    fontSize: 16,
    fontWeight: "900",
  },
  abilityDescription: {
    color: studentTheme.color.inkMuted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 5,
  },
  abilityMeta: {
    color: studentTheme.color.textSubtle,
    fontSize: 10,
    fontWeight: "700",
    marginTop: 5,
  },
  courseCard: {
    backgroundColor: studentTheme.color.surface,
    borderColor: studentTheme.color.border,
    borderRadius: studentTheme.radius.aiCard,
    borderWidth: 1,
    padding: 14,
    shadowColor: studentTheme.color.shadow,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.07,
    shadowRadius: 14,
    elevation: 2,
  },
  courseCardHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  courseCardTitleRow: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: 8,
  },
  courseCardTitle: {
    color: studentTheme.color.ink,
    flexShrink: 1,
    fontSize: 16,
    fontWeight: "900",
  },
  courseCardActions: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
  },
  refreshButton: {
    alignItems: "center",
    height: 34,
    justifyContent: "center",
    width: 30,
  },
  detailLink: {
    alignItems: "center",
    flexDirection: "row",
    minHeight: 34,
  },
  detailLinkText: {
    color: studentTheme.color.inkMuted,
    fontSize: 12,
    fontWeight: "700",
  },
  courseBody: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    marginTop: 13,
  },
  courseCover: {
    borderRadius: 14,
    overflow: "hidden",
  },
  courseCoverImage: {
    borderRadius: 14,
  },
  courseCoverOverlay: {
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
    backgroundColor: "rgba(21,74,153,0.26)",
  },
  courseCoverText: {
    bottom: 9,
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "900",
    left: 8,
    lineHeight: 16,
    position: "absolute",
    right: 8,
    textShadowColor: "rgba(0,0,0,0.18)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  courseInfo: {
    flex: 1,
    minWidth: 0,
  },
  courseName: {
    color: studentTheme.color.ink,
    fontSize: 17,
    fontWeight: "900",
  },
  courseTerm: {
    color: studentTheme.color.inkMuted,
    fontSize: 12,
    marginTop: 4,
  },
  progressHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 11,
  },
  progressLabel: {
    color: studentTheme.color.inkMuted,
    fontSize: 11,
    fontWeight: "700",
  },
  progressValue: {
    color: studentTheme.color.primary,
    fontSize: 15,
    fontWeight: "900",
  },
  progressTrack: {
    backgroundColor: "#e4edf8",
    borderRadius: studentTheme.radius.pill,
    height: 8,
    marginTop: 8,
    overflow: "hidden",
  },
  progressFill: {
    backgroundColor: studentTheme.color.primary,
    borderRadius: studentTheme.radius.pill,
    height: 8,
  },
  currentChapterRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    marginTop: 10,
  },
  currentChapterText: {
    color: studentTheme.color.inkMuted,
    flex: 1,
    fontSize: 12,
    fontWeight: "700",
  },
  continueButton: {
    alignItems: "center",
    backgroundColor: studentTheme.color.primary,
    borderRadius: 15,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    marginTop: 13,
    minHeight: 44,
  },
  continueButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "900",
  },
  sectionTitle: {
    color: studentTheme.color.ink,
    fontSize: 18,
    fontWeight: "900",
    marginTop: 4,
  },
  shortcutRow: {
    flexDirection: "row",
    gap: 9,
  },
  shortcut: {
    alignItems: "center",
    backgroundColor: studentTheme.color.surface,
    borderColor: studentTheme.color.border,
    borderRadius: studentTheme.radius.medium,
    borderWidth: 1,
    flex: 1,
    flexDirection: "column",
    gap: 5,
    justifyContent: "center",
    minHeight: 68,
  },
  shortcutText: {
    color: studentTheme.color.ink,
    fontSize: 12,
    fontWeight: "800",
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
    backgroundColor: studentTheme.color.primarySoft,
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
    color: studentTheme.color.ink,
    fontSize: 14,
    fontWeight: "900",
  },
  suggestionMeta: {
    color: studentTheme.color.inkMuted,
    fontSize: 12,
    marginTop: 4,
  },
  emptyCard: {
    backgroundColor: studentTheme.color.surface,
    borderColor: studentTheme.color.border,
    borderRadius: studentTheme.radius.card,
    borderWidth: 1,
    padding: 16,
  },
  emptyTitle: {
    color: studentTheme.color.ink,
    fontSize: 16,
    fontWeight: "900",
  },
  emptyText: {
    color: studentTheme.color.inkMuted,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 6,
  },
  askCard: {
    backgroundColor: "rgba(255,255,255,0.58)",
    borderColor: "rgba(214,229,247,0.76)",
    borderRadius: studentTheme.radius.aiCard,
    borderWidth: 1,
    overflow: "hidden",
    padding: 12,
    shadowColor: studentTheme.color.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 16,
    elevation: 8,
  },
  askHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  askBrand: {
    alignItems: "center",
    flexDirection: "row",
    flexShrink: 0,
    gap: 7,
  },
  askTitle: {
    color: studentTheme.color.ink,
    fontSize: 17,
    fontWeight: "900",
  },
  askHint: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    justifyContent: "flex-end",
    marginLeft: 8,
  },
  askHintText: {
    color: studentTheme.color.inkMuted,
    flexShrink: 1,
    fontSize: 10,
  },
  askInputRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
  },
  askInput: {
    backgroundColor: "#fbfdff",
    borderColor: "#dce8f7",
    borderRadius: 12,
    borderWidth: 1,
    color: studentTheme.color.ink,
    flex: 1,
    fontSize: 13,
    minHeight: 40,
    paddingHorizontal: 10,
  },
  askImageButton: {
    alignItems: "center",
    borderColor: "#dce8f7",
    borderRadius: 11,
    borderWidth: 1,
    height: 38,
    justifyContent: "center",
    width: 38,
  },
  askSubmitButton: {
    alignItems: "center",
    backgroundColor: studentTheme.color.primary,
    borderRadius: 12,
    justifyContent: "center",
    minHeight: 40,
    minWidth: 108,
    paddingHorizontal: 11,
  },
  askSubmitButtonCompact: {
    minWidth: 94,
    paddingHorizontal: 10,
  },
  askSubmitText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "900",
  },
  footerStats: {
    color: studentTheme.color.textSubtle,
    fontSize: 12,
    marginTop: 4,
    textAlign: "center",
  },
  pressed: {
    opacity: 0.76,
  },
  disabled: {
    opacity: 0.48,
  },
});
