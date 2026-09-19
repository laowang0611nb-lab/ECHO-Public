import * as Clipboard from "expo-clipboard";
import { SymbolView, type AndroidSymbol } from "expo-symbols";
import { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Markdown from "react-native-markdown-display";
import type {
  AIMessageBlock,
  HintBlock,
  Message,
  MessageCitation,
  QuickCheckAttemptResponse,
  QuickCheckBlock,
  MasteryUpdateBlock,
} from "@echo/shared-types";

import { studentTheme } from "@/constants/student-theme";

function createAttemptId(questionId: string): string {
  return `quick-${questionId}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function messageStatusLabel(message: Message): string {
  if (message.role === "user") {
    if (message.status === "sending") return "发送中";
    if (message.status === "failed") return "发送失败";
    if (message.status === "sent") return "已发送";
  }
  if (message.status === "streaming") return "生成中";
  if (message.status === "interrupted") return "回答中断";
  if (message.status === "failed") return "生成失败";
  return "";
}

function blockKey(block: AIMessageBlock, index: number): string {
  if (block.type === "quick_check") return `${block.type}-${block.question_id}-${index}`;
  return `${block.type}-${index}`;
}

function MarkdownContent({ content }: { content: string }) {
  return (
    <Markdown
      style={{
        body: {
          color: studentTheme.color.text,
          fontSize: 15,
          lineHeight: 23,
        },
        code_inline: {
          backgroundColor: "#eef4fb",
          borderRadius: 5,
          color: studentTheme.color.primaryDark,
          paddingHorizontal: 4,
        },
        fence: {
          backgroundColor: "#f5f8fc",
          borderColor: studentTheme.color.border,
          borderRadius: studentTheme.radius.medium,
          borderWidth: 1,
          color: studentTheme.color.text,
          padding: 10,
        },
        bullet_list: { marginVertical: 4 },
        ordered_list: { marginVertical: 4 },
      }}
    >
      {content}
    </Markdown>
  );
}

export function HintCard({
  block,
  disabled,
  onRequestMore,
  onThought,
}: {
  block: HintBlock;
  disabled: boolean;
  onRequestMore: () => Promise<void>;
  onThought: () => void;
}) {
  const [loading, setLoading] = useState(false);

  async function requestMore() {
    if (disabled || loading || !block.can_request_more) {
      return;
    }
    setLoading(true);
    try {
      await onRequestMore();
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={styles.hintCard}>
      <View style={styles.blockTitleRow}>
        <View style={styles.hintIcon}>
          <SymbolView
            name={{ android: "lightbulb", web: "lightbulb" }}
            size={17}
            tintColor={studentTheme.color.orange}
          />
        </View>
        <Text style={styles.blockTitle}>提示 {block.level}</Text>
      </View>
      {block.title ? <Text style={styles.hintTitle}>{block.title}</Text> : null}
      <Text style={styles.hintText}>{block.content}</Text>
      <View style={styles.actionRow}>
        <Pressable
          disabled={disabled}
          onPress={onThought}
          style={({ pressed }) => [
            styles.secondaryAction,
            disabled && styles.disabled,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.secondaryActionText}>我想到了</Text>
        </Pressable>
        <Pressable
          disabled={disabled || loading || !block.can_request_more}
          onPress={() => void requestMore()}
          style={({ pressed }) => [
            styles.primarySmallAction,
            (disabled || loading || !block.can_request_more) && styles.disabled,
            pressed && styles.pressed,
          ]}
        >
          {loading ? (
            <ActivityIndicator color="#ffffff" size="small" />
          ) : (
            <Text style={styles.primarySmallActionText}>
              {block.can_request_more ? "再给一点提示" : "已到最后一层"}
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

export function QuickCheckCard({
  block,
  disabled,
  onSubmit,
}: {
  block: QuickCheckBlock;
  disabled: boolean;
  onSubmit: (
    optionId: string,
    attemptId: string,
  ) => Promise<QuickCheckAttemptResponse>;
}) {
  const [selected, setSelected] = useState(block.selected_option_id);
  const [attemptId, setAttemptId] = useState(() => createAttemptId(block.question_id));
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<QuickCheckAttemptResponse | null>(null);
  const [resultVisible, setResultVisible] = useState(false);
  const locked = block.status === "locked" || block.status === "correct";
  const canSelect = !locked && !submitting;

  async function submit() {
    if (!selected || disabled || locked || submitting) {
      return;
    }
    setSubmitting(true);
    try {
      const response = await onSubmit(selected, attemptId);
      setResult(response);
      setResultVisible(true);
      if (!response.correct && !response.locked) {
        setAttemptId(createAttemptId(block.question_id));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <View style={styles.quickCard}>
      <View style={styles.blockTitleRow}>
        <View style={styles.quickIcon}>
          <SymbolView
            name={{ android: "quiz", web: "quiz" }}
            size={17}
            tintColor={studentTheme.color.primary}
          />
        </View>
        <Text style={styles.blockTitle}>{block.title || "快速检测"}</Text>
        {block.attempts_remaining !== null ? (
          <Text style={styles.attemptCount}>
            还可尝试 {block.attempts_remaining} 次
          </Text>
        ) : null}
      </View>
      <Text style={styles.quickPrompt}>{block.prompt}</Text>
      <View style={styles.optionList}>
        {block.options.map((option) => {
          const isSelected = selected === option.id;
          const isCorrect = block.correct === true && isSelected;
          const isWrong = block.correct === false && isSelected;
          return (
            <Pressable
              key={option.id}
              disabled={!canSelect}
              onPress={() => setSelected(option.id)}
              style={({ pressed }) => [
                styles.option,
                isSelected && styles.optionSelected,
                isCorrect && styles.optionCorrect,
                isWrong && styles.optionWrong,
                pressed && styles.pressed,
              ]}
            >
              <View
                style={[
                  styles.optionMarker,
                  isSelected && styles.optionMarkerSelected,
                  isCorrect && styles.optionMarkerCorrect,
                  isWrong && styles.optionMarkerWrong,
                ]}
              >
                <Text style={styles.optionMarkerText}>{option.id.toUpperCase()}</Text>
              </View>
              <Text style={styles.optionText}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {block.hint ? <Text style={styles.quickHint}>提示：{block.hint}</Text> : null}
      {block.explanation ? (
        <Text style={styles.quickExplanation}>解析：{block.explanation}</Text>
      ) : null}
      {!locked ? (
        <Pressable
          disabled={disabled || !selected || submitting}
          onPress={() => void submit()}
          style={({ pressed }) => [
            styles.quickSubmit,
            (disabled || !selected || submitting) && styles.disabled,
            pressed && styles.pressed,
          ]}
        >
          {submitting ? (
            <ActivityIndicator color="#ffffff" />
          ) : (
            <Text style={styles.quickSubmitText}>提交答案</Text>
          )}
        </Pressable>
      ) : null}
      <QuizResultSheet
        block={block}
        onClose={() => setResultVisible(false)}
        result={result}
        visible={resultVisible}
      />
    </View>
  );
}

export function MasteryUpdateCard({ block }: { block: MasteryUpdateBlock }) {
  return (
    <View style={styles.masteryCard}>
      <View style={styles.masteryIcon}>
        <SymbolView
          name={{ android: "trending_up", web: "trending_up" }}
          size={18}
          tintColor={studentTheme.color.success}
        />
      </View>
      <View style={styles.masteryCopy}>
        <Text style={styles.masteryTitle}>
          掌握度 {block.before === null ? "已记录" : `${Math.round(block.before)}% → `}
          {Math.round(block.after)}%
        </Text>
        <Text style={styles.masteryReason}>{block.reason}</Text>
      </View>
    </View>
  );
}

function WarningCard({ message }: { message: string }) {
  return (
    <View style={styles.warningCard}>
      <SymbolView
        name={{ android: "info", web: "info" }}
        size={16}
        tintColor={studentTheme.color.warning}
      />
      <Text style={styles.warningText}>{message}</Text>
    </View>
  );
}

function QuizResultSheet({
  block,
  result,
  visible,
  onClose,
}: {
  block: QuickCheckBlock;
  result: QuickCheckAttemptResponse | null;
  visible: boolean;
  onClose: () => void;
}) {
  if (!result) {
    return null;
  }
  const correct = result.correct;
  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.sheetOverlay}>
        <View style={styles.resultSheet}>
          <View style={[styles.resultMark, correct ? styles.resultCorrect : styles.resultWrong]}>
            <SymbolView
              name={{
                android: correct ? "check" : "close",
                web: correct ? "check" : "close",
              }}
              size={24}
              tintColor="#ffffff"
            />
          </View>
          <Text style={styles.resultTitle}>{correct ? "回答正确" : result.locked ? "再复习一下" : "还差一点"}</Text>
          <Text style={styles.resultDescription}>
            {correct
              ? "这次回答已经形成学习证据，掌握度由服务器自动更新。"
              : result.hint || result.explanation || "回到课程材料，再比较一次关键词。"}
          </Text>
          {result.mastery_update ? (
            <MasteryUpdateCard block={result.mastery_update} />
          ) : null}
          <Pressable onPress={onClose} style={styles.resultButton}>
            <Text style={styles.resultButtonText}>完成</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function CitationSheet({
  citations,
  visible,
  onClose,
}: {
  citations: MessageCitation[];
  visible: boolean;
  onClose: () => void;
}) {
  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.sheetOverlay}>
        <View style={styles.citationSheet}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>课程来源</Text>
            <Pressable onPress={onClose} style={styles.iconButton}>
              <SymbolView
                name={{ android: "close", web: "close" }}
                size={19}
                tintColor={studentTheme.color.text}
              />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.citationList}>
            {citations.map((citation) => (
              <View key={citation.citation_index} style={styles.citationItem}>
                <Text style={styles.citationIndex}>[{citation.citation_index}]</Text>
                <View style={styles.citationCopy}>
                  <Text style={styles.citationTitle}>
                    {citation.document_name || "课程资料"}
                  </Text>
                  {citation.chapter_title ? (
                    <Text style={styles.citationChapter}>{citation.chapter_title}</Text>
                  ) : null}
                  <Text style={styles.citationPage}>
                    第 {citation.page_start}
                    {citation.page_end !== citation.page_start
                      ? `–${citation.page_end}`
                      : ""}{" "}
                    页
                  </Text>
                  {citation.quote ? (
                    <Text style={styles.citationQuote}>
                      {citation.quote.slice(0, 220)}
                    </Text>
                  ) : null}
                </View>
              </View>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function MessageActionsSheet({
  message,
  visible,
  onClose,
  onNotResolved,
}: {
  message: Message;
  visible: boolean;
  onClose: () => void;
  onNotResolved: () => Promise<void>;
}) {
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackDone, setFeedbackDone] = useState(false);
  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <Pressable onPress={onClose} style={styles.sheetOverlay}>
        <Pressable onPress={() => undefined} style={styles.actionSheet}>
          <Text style={styles.sheetTitle}>回答操作</Text>
          <Pressable
            onPress={() => {
              void Clipboard.setStringAsync(message.content);
              onClose();
            }}
            style={styles.actionItem}
          >
            <SymbolView
              name={{ android: "content_copy", web: "content_copy" }}
              size={18}
              tintColor={studentTheme.color.text}
            />
            <Text style={styles.actionText}>复制回答</Text>
          </Pressable>
          <Pressable
            disabled={feedbackLoading || feedbackDone}
            onPress={() => {
              setFeedbackLoading(true);
              void onNotResolved()
                .then(() => setFeedbackDone(true))
                .finally(() => setFeedbackLoading(false));
            }}
            style={styles.actionItem}
          >
            <SymbolView
              name={{ android: "feedback", web: "feedback" }}
              size={18}
              tintColor={studentTheme.color.warning}
            />
            <Text style={styles.actionText}>
              {feedbackDone ? "已提交反馈" : "没解决"}
            </Text>
            {feedbackLoading ? <ActivityIndicator size="small" /> : null}
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function MessageBubble({
  message,
  disabled,
  onQuickCheck,
  onHint,
  onThought,
  onRetry,
  onContinue,
  onNotResolved,
}: {
  message: Message;
  disabled: boolean;
  onQuickCheck: (
    block: QuickCheckBlock,
    optionId: string,
    attemptId: string,
  ) => Promise<QuickCheckAttemptResponse>;
  onHint: (block: HintBlock) => Promise<void>;
  onThought: () => void;
  onRetry: () => Promise<void>;
  onContinue: () => Promise<void>;
  onNotResolved: () => Promise<void>;
}) {
  const [citationsVisible, setCitationsVisible] = useState(false);
  const [actionsVisible, setActionsVisible] = useState(false);
  const isUser = message.role === "user";
  const blocks =
    message.blocks && message.blocks.length > 0
      ? message.blocks
      : message.content
        ? [{ type: "markdown" as const, markdown: message.content }]
        : [];
  const statusLabel = messageStatusLabel(message);

  if (isUser) {
    return (
      <View style={styles.userMessageRow}>
        <View style={styles.userBubble}>
          <Text style={styles.userMessageText}>{message.content}</Text>
          <View style={styles.userStatusRow}>
            <Text style={styles.userStatus}>{statusLabel}</Text>
            {message.status === "failed" ? (
              <Pressable onPress={() => void onRetry()}>
                <Text style={styles.userRetryText}>重试</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.assistantRow}>
      <View style={styles.assistantAvatar}>
        <Text style={styles.assistantAvatarText}>E</Text>
      </View>
      <View style={styles.assistantColumn}>
        <View style={styles.assistantCard}>
          {blocks.map((block, index) => {
            if (block.type === "markdown") {
              return <MarkdownContent content={block.markdown} key={blockKey(block, index)} />;
            }
            if (block.type === "text") {
              return (
                <Text key={blockKey(block, index)} style={styles.assistantText}>
                  {block.text}
                </Text>
              );
            }
            if (block.type === "hint") {
              return (
                <HintCard
                  block={block}
                  disabled={disabled}
                  key={blockKey(block, index)}
                  onRequestMore={() => onHint(block)}
                  onThought={onThought}
                />
              );
            }
            if (block.type === "quick_check") {
              return (
                <QuickCheckCard
                  block={block}
                  disabled={disabled}
                  key={blockKey(block, index)}
                  onSubmit={(optionId, attemptId) =>
                    onQuickCheck(block, optionId, attemptId)
                  }
                />
              );
            }
            if (block.type === "mastery_update") {
              return <MasteryUpdateCard block={block} key={blockKey(block, index)} />;
            }
            if (block.type === "warning") {
              return <WarningCard key={blockKey(block, index)} message={block.message} />;
            }
            return null;
          })}
          {message.status === "streaming" ? (
            <View style={styles.streamingRow}>
              <ActivityIndicator color={studentTheme.color.primary} size="small" />
              <Text style={styles.streamingText}>ECHO 正在组织回答...</Text>
            </View>
          ) : null}
          {statusLabel ? <Text style={styles.assistantStatus}>{statusLabel}</Text> : null}
        </View>

        <View style={styles.messageActions}>
          {message.citations.length > 0 ? (
            <Pressable
              onPress={() => setCitationsVisible(true)}
              style={styles.messageActionButton}
            >
              <SymbolView
                name={{ android: "menu_book", web: "menu_book" }}
                size={16}
                tintColor={studentTheme.color.primary}
              />
              <Text style={styles.messageActionText}>
                查看来源 {message.citations.length}
              </Text>
            </Pressable>
          ) : null}
          {message.status === "interrupted" ? (
            <Pressable
              disabled={disabled}
              onPress={() => void onContinue()}
              style={styles.messageActionButton}
            >
              <SymbolView
                name={{ android: "play_arrow", web: "play_arrow" }}
                size={16}
                tintColor={studentTheme.color.primary}
              />
              <Text style={styles.messageActionText}>继续生成</Text>
            </Pressable>
          ) : null}
          <Pressable
            onPress={() => setActionsVisible(true)}
            style={styles.messageActionButton}
          >
            <SymbolView
              name={{ android: "more_horiz", web: "more_horiz" }}
              size={17}
              tintColor={studentTheme.color.textMuted}
            />
            <Text style={styles.messageActionText}>更多</Text>
          </Pressable>
        </View>
        <CitationSheet
          citations={message.citations}
          onClose={() => setCitationsVisible(false)}
          visible={citationsVisible}
        />
        <MessageActionsSheet
          message={message}
          onClose={() => setActionsVisible(false)}
          onNotResolved={onNotResolved}
          visible={actionsVisible}
        />
      </View>
    </View>
  );
}

export function ActionIconButton({
  icon,
  label,
  onPress,
}: {
  icon: AndroidSymbol;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.headerIconButton, pressed && styles.pressed]}
    >
      <SymbolView name={{ android: icon, web: icon }} size={21} tintColor={studentTheme.color.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  userMessageRow: {
    alignItems: "flex-end",
    paddingLeft: 42,
  },
  userBubble: {
    backgroundColor: studentTheme.color.primary,
    borderRadius: 18,
    borderBottomRightRadius: 5,
    maxWidth: "100%",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  userMessageText: {
    color: "#ffffff",
    fontSize: 15,
    lineHeight: 22,
  },
  userStatusRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "flex-end",
    marginTop: 5,
  },
  userStatus: {
    color: "rgba(255,255,255,0.72)",
    fontSize: 10,
  },
  userRetryText: {
    color: "#ffffff",
    fontSize: 11,
    fontWeight: "900",
    textDecorationLine: "underline",
  },
  assistantRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 9,
    paddingRight: 18,
  },
  assistantAvatar: {
    alignItems: "center",
    backgroundColor: studentTheme.color.surfaceBlue,
    borderRadius: 16,
    height: 32,
    justifyContent: "center",
    marginTop: 2,
    width: 32,
  },
  assistantAvatarText: {
    color: studentTheme.color.primary,
    fontSize: 15,
    fontWeight: "900",
  },
  assistantColumn: {
    flex: 1,
    minWidth: 0,
  },
  assistantCard: {
    backgroundColor: studentTheme.color.surface,
    borderColor: studentTheme.color.border,
    borderRadius: 18,
    borderTopLeftRadius: 5,
    borderWidth: 1,
    gap: 12,
    padding: 14,
    shadowColor: "#17345c",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.04,
    shadowRadius: 14,
  },
  assistantText: {
    color: studentTheme.color.text,
    fontSize: 15,
    lineHeight: 23,
  },
  assistantStatus: {
    color: studentTheme.color.textMuted,
    fontSize: 10,
    marginTop: -4,
  },
  streamingRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 7,
  },
  streamingText: {
    color: studentTheme.color.textMuted,
    fontSize: 12,
  },
  messageActions: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginTop: 7,
    paddingHorizontal: 4,
  },
  messageActionButton: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
    minHeight: 30,
  },
  messageActionText: {
    color: studentTheme.color.textMuted,
    fontSize: 11,
    fontWeight: "700",
  },
  blockTitleRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  blockTitle: {
    color: studentTheme.color.text,
    flex: 1,
    fontSize: 14,
    fontWeight: "900",
  },
  hintCard: {
    backgroundColor: "#fffaf0",
    borderColor: "#fde2af",
    borderRadius: studentTheme.radius.medium,
    borderWidth: 1,
    gap: 9,
    padding: 12,
  },
  hintIcon: {
    alignItems: "center",
    backgroundColor: "#fff1d4",
    borderRadius: 9,
    height: 28,
    justifyContent: "center",
    width: 28,
  },
  hintTitle: {
    color: studentTheme.color.text,
    fontSize: 13,
    fontWeight: "900",
  },
  hintText: {
    color: "#704f20",
    fontSize: 13,
    lineHeight: 20,
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  primarySmallAction: {
    alignItems: "center",
    backgroundColor: studentTheme.color.orange,
    borderRadius: studentTheme.radius.small,
    justifyContent: "center",
    minHeight: 36,
    paddingHorizontal: 12,
  },
  primarySmallActionText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "900",
  },
  secondaryAction: {
    alignItems: "center",
    borderColor: "#e8c47d",
    borderRadius: studentTheme.radius.small,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 36,
    paddingHorizontal: 12,
  },
  secondaryActionText: {
    color: "#8a5a00",
    fontSize: 12,
    fontWeight: "800",
  },
  quickCard: {
    backgroundColor: studentTheme.color.surfaceBlue,
    borderColor: "#c7dcf8",
    borderRadius: studentTheme.radius.medium,
    borderWidth: 1,
    gap: 11,
    padding: 13,
  },
  quickIcon: {
    alignItems: "center",
    backgroundColor: "#d9eaff",
    borderRadius: 9,
    height: 28,
    justifyContent: "center",
    width: 28,
  },
  attemptCount: {
    color: studentTheme.color.textMuted,
    fontSize: 10,
    fontWeight: "700",
  },
  quickPrompt: {
    color: studentTheme.color.text,
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 21,
  },
  optionList: {
    gap: 8,
  },
  option: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: "#cddff4",
    borderRadius: studentTheme.radius.medium,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: 48,
    paddingHorizontal: 11,
    paddingVertical: 9,
  },
  optionSelected: {
    backgroundColor: "#e7f1ff",
    borderColor: studentTheme.color.primary,
  },
  optionCorrect: {
    backgroundColor: "#ecfdf5",
    borderColor: "#5ec596",
  },
  optionWrong: {
    backgroundColor: "#fff1f0",
    borderColor: "#ee8f87",
  },
  optionMarker: {
    alignItems: "center",
    backgroundColor: "#edf3fa",
    borderRadius: 9,
    height: 28,
    justifyContent: "center",
    width: 28,
  },
  optionMarkerSelected: {
    backgroundColor: studentTheme.color.primary,
  },
  optionMarkerCorrect: {
    backgroundColor: studentTheme.color.success,
  },
  optionMarkerWrong: {
    backgroundColor: studentTheme.color.danger,
  },
  optionMarkerText: {
    color: studentTheme.color.text,
    fontSize: 11,
    fontWeight: "900",
  },
  optionText: {
    color: studentTheme.color.text,
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
  },
  quickHint: {
    color: "#8a5a00",
    fontSize: 12,
    lineHeight: 18,
  },
  quickExplanation: {
    color: studentTheme.color.textMuted,
    fontSize: 12,
    lineHeight: 19,
  },
  quickSubmit: {
    alignItems: "center",
    backgroundColor: studentTheme.color.primary,
    borderRadius: studentTheme.radius.medium,
    justifyContent: "center",
    minHeight: 42,
  },
  quickSubmitText: {
    color: "#ffffff",
    fontSize: 13,
    fontWeight: "900",
  },
  masteryCard: {
    alignItems: "center",
    backgroundColor: "#effbf5",
    borderColor: "#b8e6ce",
    borderRadius: studentTheme.radius.medium,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    padding: 12,
  },
  masteryIcon: {
    alignItems: "center",
    backgroundColor: "#d7f5e6",
    borderRadius: 11,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  masteryCopy: {
    flex: 1,
  },
  masteryTitle: {
    color: "#116b45",
    fontSize: 14,
    fontWeight: "900",
  },
  masteryReason: {
    color: "#38735a",
    fontSize: 11,
    marginTop: 3,
  },
  warningCard: {
    alignItems: "center",
    backgroundColor: "#fff8ed",
    borderColor: "#f7d7a4",
    borderRadius: studentTheme.radius.medium,
    borderWidth: 1,
    flexDirection: "row",
    gap: 8,
    padding: 10,
  },
  warningText: {
    color: studentTheme.color.warning,
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
  },
  sheetOverlay: {
    backgroundColor: "rgba(12, 28, 48, 0.42)",
    flex: 1,
    justifyContent: "flex-end",
  },
  resultSheet: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 22,
    paddingBottom: 30,
  },
  resultMark: {
    alignItems: "center",
    borderRadius: 25,
    height: 50,
    justifyContent: "center",
    width: 50,
  },
  resultCorrect: {
    backgroundColor: studentTheme.color.success,
  },
  resultWrong: {
    backgroundColor: studentTheme.color.danger,
  },
  resultTitle: {
    color: studentTheme.color.text,
    fontSize: 20,
    fontWeight: "900",
    marginTop: 12,
  },
  resultDescription: {
    color: studentTheme.color.textMuted,
    flexShrink: 1,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 8,
    textAlign: "center",
    width: "100%",
  },
  resultButton: {
    alignItems: "center",
    alignSelf: "stretch",
    backgroundColor: studentTheme.color.primary,
    borderRadius: studentTheme.radius.medium,
    justifyContent: "center",
    marginTop: 18,
    minHeight: 46,
  },
  resultButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900",
  },
  citationSheet: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "72%",
    padding: 18,
    paddingBottom: 28,
  },
  sheetHandle: {
    alignSelf: "center",
    backgroundColor: "#d7e0eb",
    borderRadius: 2,
    height: 4,
    width: 40,
  },
  sheetHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 12,
  },
  sheetTitle: {
    color: studentTheme.color.text,
    fontSize: 18,
    fontWeight: "900",
  },
  iconButton: {
    alignItems: "center",
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  citationList: {
    gap: 12,
    paddingTop: 14,
  },
  citationItem: {
    backgroundColor: "#f7faff",
    borderColor: studentTheme.color.border,
    borderRadius: studentTheme.radius.medium,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    padding: 12,
  },
  citationIndex: {
    color: studentTheme.color.primary,
    fontSize: 12,
    fontWeight: "900",
  },
  citationCopy: {
    flex: 1,
  },
  citationTitle: {
    color: studentTheme.color.text,
    fontSize: 13,
    fontWeight: "900",
  },
  citationChapter: {
    color: studentTheme.color.textMuted,
    fontSize: 11,
    marginTop: 3,
  },
  citationPage: {
    color: studentTheme.color.primary,
    fontSize: 11,
    fontWeight: "800",
    marginTop: 5,
  },
  citationQuote: {
    color: studentTheme.color.textMuted,
    fontSize: 12,
    lineHeight: 19,
    marginTop: 7,
  },
  actionSheet: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    gap: 4,
    padding: 18,
    paddingBottom: 30,
  },
  actionItem: {
    alignItems: "center",
    borderRadius: studentTheme.radius.medium,
    flexDirection: "row",
    gap: 12,
    minHeight: 52,
    paddingHorizontal: 12,
  },
  actionText: {
    color: studentTheme.color.text,
    flex: 1,
    fontSize: 14,
    fontWeight: "800",
  },
  headerIconButton: {
    alignItems: "center",
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  pressed: {
    opacity: 0.74,
  },
  disabled: {
    opacity: 0.46,
  },
});
