import { useQuery, useQueryClient } from "@tanstack/react-query";
import { SymbolView } from "expo-symbols";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { EmptyState, ErrorState } from "@/components/states/page-state";
import { studentTheme } from "@/constants/student-theme";
import { QuickCheckCard } from "@/features/chat/chat-message";
import { apiClient } from "@/lib/api-client";
import { useStudentSession } from "@/providers/student-session-provider";

interface ConsolidationQuizSheetProps {
  courseId: string;
  knowledgePointId: string;
  knowledgePointName?: string | null;
  onClose: () => void;
  visible: boolean;
}

export function ConsolidationQuizSheet({
  courseId,
  knowledgePointId,
  knowledgePointName,
  onClose,
  visible,
}: ConsolidationQuizSheetProps) {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { user } = useStudentSession();
  const query = useQuery({
    queryKey: [
      "student-consolidation-quiz",
      user?.id ?? "",
      courseId,
      knowledgePointId,
    ],
    queryFn: () =>
      apiClient.getKnowledgePointQuickChecks(
        user?.id ?? "",
        courseId,
        knowledgePointId,
        3,
      ),
    enabled: Boolean(visible && user?.id && courseId && knowledgePointId),
    staleTime: 30_000,
  });

  async function submitAnswer(
    questionId: string,
    optionId: string,
    attemptId: string,
  ) {
    const result = await apiClient.submitQuickCheck(user?.id ?? "", questionId, {
      attempt_id: attemptId,
      question_id: questionId,
      selected_option_id: optionId,
    });
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["student-mastery", user?.id ?? "", courseId],
      }),
      queryClient.invalidateQueries({
        queryKey: ["student-course-progress", user?.id ?? "", courseId],
      }),
      queryClient.invalidateQueries({
        queryKey: ["student-learning-events"],
      }),
      queryClient.invalidateQueries({
        queryKey: ["knowledge-point-learning-events"],
      }),
      queryClient.invalidateQueries({
        queryKey: ["student-wrong-questions", user?.id ?? "", courseId],
      }),
    ]);
    return result;
  }

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={styles.eyebrow}>5 分钟巩固</Text>
              <Text numberOfLines={2} style={styles.title}>
                {knowledgePointName || query.data?.knowledge_point_name || "知识点巩固"}
              </Text>
              <Text style={styles.subtitle}>
                {query.data
                  ? `本轮 ${query.data.items.length} 道真实快速验证`
                  : "正在准备巩固题"}
              </Text>
            </View>
            <Pressable
              accessibilityLabel="关闭 5 分钟巩固"
              onPress={onClose}
              style={styles.closeButton}
            >
              <SymbolView
                name={{ android: "close", web: "close" }}
                size={20}
                tintColor={studentTheme.color.text}
              />
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
          >
            {query.isLoading ? (
              <View style={styles.loading}>
                <ActivityIndicator color={studentTheme.color.primary} />
                <Text style={styles.loadingText}>正在读取本知识点的巩固题</Text>
              </View>
            ) : null}

            {query.isError ? (
              <ErrorState
                description="暂时无法加载巩固题，请稍后重试。"
                onAction={() => void query.refetch()}
                title="巩固题加载失败"
              />
            ) : null}

            {query.data && query.data.items.length === 0 ? (
              <EmptyState
                description="当前知识点暂时没有可用的快速验证题，完成更多学习后再来试试。"
                title="暂无巩固题"
              />
            ) : null}

            {query.data?.items.map((block, index) => (
              <View key={block.question_id} style={styles.questionBlock}>
                <Text style={styles.questionIndex}>
                  第 {index + 1} / {query.data.items.length} 题
                </Text>
                <QuickCheckCard
                  block={block}
                  disabled={false}
                  onSubmit={(optionId, attemptId) =>
                    submitAnswer(block.question_id, optionId, attemptId)
                  }
                />
              </View>
            ))}
          </ScrollView>
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
  header: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
    marginTop: 14,
  },
  headerCopy: {
    flex: 1,
  },
  eyebrow: {
    color: studentTheme.color.primary,
    fontSize: 11,
    fontWeight: "800",
  },
  title: {
    color: studentTheme.color.text,
    fontSize: 20,
    fontWeight: "900",
    marginTop: 4,
  },
  subtitle: {
    color: studentTheme.color.textMuted,
    fontSize: 11,
    marginTop: 5,
  },
  closeButton: {
    alignItems: "center",
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  content: {
    gap: 16,
    paddingBottom: 24,
    paddingTop: 18,
  },
  loading: {
    alignItems: "center",
    gap: 10,
    justifyContent: "center",
    minHeight: 220,
  },
  loadingText: {
    color: studentTheme.color.textMuted,
    fontSize: 12,
  },
  questionBlock: {
    gap: 8,
  },
  questionIndex: {
    color: studentTheme.color.textMuted,
    fontSize: 11,
    fontWeight: "800",
  },
});
