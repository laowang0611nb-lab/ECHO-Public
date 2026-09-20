import * as Clipboard from "expo-clipboard";
import { SymbolView, type AndroidSymbol } from "expo-symbols";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, {
  FadeIn,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
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
  }
  if (message.status === "interrupted") return "回答已停止";
  if (message.status === "failed") return "ECHO 暂时没有回答成功";
  return "";
}

function blockKey(block: AIMessageBlock, index: number): string {
  if (block.type === "quick_check") return `${block.type}-${block.question_id}-${index}`;
  return `${block.type}-${index}`;
}

function StreamingWaiting() {
  return (
    <View style={styles.streamingRow}>
      <ActivityIndicator color={studentTheme.color.primary} size="small" />
      <Text style={styles.streamingText}>ECHO 正在思考…</Text>
    </View>
  );
}

function StreamingCursor() {
  const opacity = useSharedValue(0.22);

  useEffect(() => {
    opacity.value = withRepeat(withTiming(1, { duration: 520 }), -1, true);
    return () => cancelAnimation(opacity);
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return <Animated.View style={[styles.streamingCursor, animatedStyle]} />;
}

function CodeFence({ content }: { content: string }) {
  const [copied, setCopied] = useState(false);
  const code = content.replace(/\n$/, "");

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1400);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <View style={styles.codeFence}>
      <View style={styles.codeHeader}>
        <Text style={styles.codeLabel}>代码</Text>
        <Pressable
          accessibilityLabel="复制代码"
          onPress={() => {
            void Clipboard.setStringAsync(code);
            setCopied(true);
          }}
          style={styles.codeCopyButton}
        >
          <SymbolView
            name={{ android: copied ? "check" : "content_copy", web: copied ? "check" : "content_copy" }}
            size={15}
            tintColor={studentTheme.color.primary}
          />
          <Text style={styles.codeCopyText}>{copied ? "已复制" : "复制"}</Text>
        </Pressable>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
      >
        <Text selectable style={styles.codeText}>
          {code}
        </Text>
      </ScrollView>
    </View>
  );
}

function MarkdownContent({ content }: { content: string }) {
  return (
    <Markdown
      rules={{
        fence: (node) => <CodeFence content={node.content} key={node.key} />,
      }}
      style={{
        body: {
          color: studentTheme.color.text,
          fontSize: studentTheme.type.body.fontSize + 1,
          lineHeight: 26,
        },
        paragraph: {
          marginBottom: 10,
          marginTop: 0,
        },
        heading1: {
          color: studentTheme.color.text,
          fontSize: 19,
          fontWeight: "800",
          lineHeight: 27,
          marginBottom: 8,
          marginTop: 4,
        },
        heading2: {
          color: studentTheme.color.text,
          fontSize: 17,
          fontWeight: "800",
          lineHeight: 25,
          marginBottom: 7,
          marginTop: 4,
        },
        heading3: {
          color: studentTheme.color.text,
          fontSize: 16,
          fontWeight: "800",
          lineHeight: 24,
          marginBottom: 6,
          marginTop: 3,
        },
        code_inline: {
          borderRadius: 5,
          color: studentTheme.color.primaryDark,
          backgroundColor: studentTheme.color.primarySoft,
          paddingHorizontal: 4,
        },
        fence: {
          backgroundColor: "#f3f6fa",
          borderColor: studentTheme.color.divider,
          borderRadius: studentTheme.radius.card,
          borderWidth: 1,
          color: studentTheme.color.text,
          fontFamily: "monospace",
          fontSize: 13,
          lineHeight: 20,
          padding: 12,
        },
        bullet_list: { marginVertical: 4 },
        ordered_list: { marginVertical: 4 },
        list_item: { marginVertical: 3 },
        blockquote: {
          backgroundColor: studentTheme.color.surfaceSoft,
          borderLeftColor: studentTheme.color.primaryBorder,
          borderLeftWidth: 3,
          marginVertical: 8,
          paddingHorizontal: 11,
          paddingVertical: 7,
        },
        link: {
          color: studentTheme.color.primary,
        },
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
      <View style={styles.hintHeader}>
        <View style={styles.hintIcon}>
          <SymbolView
            name={{ android: "lightbulb", web: "lightbulb" }}
            size={18}
            tintColor={studentTheme.color.violet}
          />
        </View>
        <View style={styles.hintHeading}>
          <Text style={styles.hintLabel}>提示 {block.level}</Text>
          <Text style={styles.hintBadge}>引导</Text>
        </View>
      </View>
      {block.title ? <Text style={styles.hintTitle}>{block.title}</Text> : null}
      <Text style={styles.hintText}>{block.content}</Text>
      <View style={styles.actionRow}>
        <Pressable
          disabled={disabled}
          onPress={onThought}
          style={({ pressed }) => [
            styles.thoughtAction,
            disabled && styles.disabled,
            pressed && styles.pressed,
          ]}
        >
          <Text style={styles.thoughtActionText}>我想到了</Text>
        </Pressable>
        <Pressable
          disabled={disabled || loading || !block.can_request_more}
          onPress={() => void requestMore()}
          style={({ pressed }) => [
            styles.moreHintAction,
            (disabled || loading || !block.can_request_more) && styles.disabled,
            pressed && styles.pressed,
          ]}
        >
          {loading ? (
            <ActivityIndicator color={studentTheme.color.violet} size="small" />
          ) : (
            <Text style={styles.moreHintActionText}>
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
      <View style={styles.quickHeader}>
        <View style={styles.quickIcon}>
          <SymbolView
            name={{ android: "quiz", web: "quiz" }}
            size={18}
            tintColor={studentTheme.color.primary}
          />
        </View>
        <View style={styles.quickHeading}>
          <Text style={styles.quickTitle}>{block.title || "理解检查"}</Text>
          <View style={styles.quickMetaRow}>
            <Text style={styles.quickBadge}>快速验证</Text>
            {block.attempts_remaining !== null ? (
              <Text style={styles.attemptCount}>
                还可尝试 {block.attempts_remaining} 次
              </Text>
            ) : null}
          </View>
        </View>
      </View>
      <Text style={styles.quickPrompt}>{block.prompt}</Text>
      <View style={styles.optionList}>
        {block.options.map((option) => {
          const isSelected = selected === option.id;
          const isCorrect = block.correct === true && isSelected;
          const isWrong = block.correct === false && isSelected;
          return (
            <Pressable
              accessibilityLabel={`${option.id.toUpperCase()} ${option.label}`}
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
                <Text
                  style={[
                    styles.optionMarkerText,
                    (isSelected || isCorrect || isWrong) && styles.optionMarkerTextActive,
                  ]}
                >
                  {option.id.toUpperCase()}
                </Text>
              </View>
              <Text style={styles.optionText}>{option.label}</Text>
              {isCorrect ? (
                <SymbolView
                  name={{ android: "check", web: "check" }}
                  size={17}
                  tintColor={studentTheme.color.success}
                />
              ) : isWrong ? (
                <SymbolView
                  name={{ android: "close", web: "close" }}
                  size={17}
                  tintColor={studentTheme.color.danger}
                />
              ) : (
                <View style={[styles.optionRadio, isSelected && styles.optionRadioSelected]} />
              )}
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
      <View style={styles.masteryHeader}>
        <View style={styles.masteryIcon}>
          <SymbolView
            name={{ android: "trending_up", web: "trending_up" }}
            size={19}
            tintColor={studentTheme.color.success}
          />
        </View>
        <View style={styles.masteryHeading}>
          <Text style={styles.masteryEyebrow}>学习状态更新</Text>
          <Text style={styles.masteryKnowledge}>
            {block.knowledge_point_name || "当前知识点"}
          </Text>
        </View>
      </View>
      <View style={styles.masteryScoreRow}>
        <Text style={styles.masteryBefore}>
          {block.before === null ? "首次记录" : `${Math.round(block.before)}%`}
        </Text>
        <SymbolView
          name={{ android: "arrow_forward", web: "arrow_forward" }}
          size={17}
          tintColor={studentTheme.color.success}
        />
        <Text style={styles.masteryAfter}>{Math.round(block.after)}%</Text>
      </View>
      <Text style={styles.masteryEvidence}>本次快速验证已作为新的学习证据。</Text>
      <Text style={styles.masteryReason}>{block.reason}</Text>
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
          <View style={styles.sheetHandle} />
          <ScrollView
            contentContainerStyle={styles.resultContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.resultHeader}>
              <View style={[styles.resultMark, correct ? styles.resultCorrect : styles.resultWrong]}>
                <SymbolView
                  name={{
                    android: correct ? "check" : "lightbulb",
                    web: correct ? "check" : "lightbulb",
                  }}
                  size={22}
                  tintColor="#ffffff"
                />
              </View>
              <View style={styles.resultHeading}>
                <Text style={styles.resultTitle}>
                  {correct ? "答对了" : result.locked ? "再复习一下" : "还差一点"}
                </Text>
                <Text style={styles.resultSubtitle}>
                  {correct ? "这次理解已经形成学习证据" : "看看针对性提示，再试一次"}
                </Text>
              </View>
            </View>
            <Text style={styles.resultDescription}>
              {correct
                ? result.explanation || "你的判断与课程材料一致，ECHO 已记录这次学习证据。"
                : result.hint || result.explanation || "回到课程材料，再比较一次关键词。"}
            </Text>
            {result.mastery_update ? (
              <MasteryUpdateCard block={result.mastery_update} />
            ) : null}
          </ScrollView>
          <Pressable onPress={onClose} style={styles.resultButton}>
            <Text style={styles.resultButtonText}>
              {correct ? "继续学习" : result.locked ? "知道了" : "再试一次"}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function CitationItem({ citation }: { citation: MessageCitation }) {
  const [expanded, setExpanded] = useState(false);
  const quote = citation.quote?.trim() ?? "";
  const pageLabel =
    citation.page_end !== citation.page_start
      ? `P.${citation.page_start}-${citation.page_end}`
      : `P.${citation.page_start}`;

  return (
    <View style={styles.citationItem}>
      <View style={styles.citationIndexWrap}>
        <Text style={styles.citationIndex}>{citation.citation_index}</Text>
      </View>
      <View style={styles.citationCopy}>
        <Text style={styles.citationTitle}>{citation.document_name || "课程资料"}</Text>
        <View style={styles.citationMetaRow}>
          {citation.chapter_title ? (
            <Text numberOfLines={1} style={styles.citationChapter}>
              {citation.chapter_title}
            </Text>
          ) : null}
          <Text style={styles.citationPage}>{pageLabel}</Text>
        </View>
        {quote ? (
          <>
            <Text numberOfLines={expanded ? undefined : 4} style={styles.citationQuote}>
              “{quote}”
            </Text>
            {quote.length > 120 ? (
              <Pressable onPress={() => setExpanded((current) => !current)}>
                <Text style={styles.citationExpand}>{expanded ? "收起" : "展开"}</Text>
              </Pressable>
            ) : null}
          </>
        ) : (
          <Text style={styles.citationQuoteUnavailable}>来源片段暂不可用</Text>
        )}
      </View>
    </View>
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
          <View style={styles.citationHeader}>
            <View>
              <Text style={styles.sheetTitle}>课程来源</Text>
              <Text style={styles.sheetSubtitle}>{citations.length} 个可追溯来源</Text>
            </View>
            <Pressable
              accessibilityLabel="关闭课程来源"
              onPress={onClose}
              style={styles.iconButton}
            >
              <SymbolView
                name={{ android: "close", web: "close" }}
                size={19}
                tintColor={studentTheme.color.text}
              />
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={styles.citationList}
            showsVerticalScrollIndicator={false}
          >
            {citations.map((citation) => (
              <CitationItem citation={citation} key={citation.citation_index} />
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
  onViewCitations,
}: {
  message: Message;
  visible: boolean;
  onClose: () => void;
  onNotResolved: () => Promise<void>;
  onViewCitations: () => void;
}) {
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackDone, setFeedbackDone] = useState(false);
  return (
    <Modal animationType="fade" onRequestClose={onClose} transparent visible={visible}>
      <Pressable onPress={onClose} style={styles.sheetOverlay}>
        <Pressable onPress={() => undefined} style={styles.actionSheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.actionSheetTitle}>AI 回答</Text>
          <Text style={styles.actionSheetDescription}>复制内容，或告诉 ECHO 这次回答是否解决了问题。</Text>
          {message.citations.length > 0 ? (
            <Pressable
              onPress={onViewCitations}
              style={styles.actionItem}
            >
              <SymbolView
                name={{ android: "menu_book", web: "menu_book" }}
                size={18}
                tintColor={studentTheme.color.primary}
              />
              <Text style={styles.actionText}>查看来源</Text>
            </Pressable>
          ) : null}
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
      <Animated.View entering={FadeIn.duration(180)} style={styles.userMessageRow}>
        <View
          style={[
            styles.userBubble,
            message.status === "failed" && styles.userBubbleFailed,
          ]}
        >
          <Text selectable style={styles.userMessageText}>
            {message.content}
          </Text>
        </View>
        {statusLabel ? (
          <View style={styles.userStatusRow}>
            <Text style={styles.userStatus}>{statusLabel}</Text>
            {message.status === "failed" ? (
              <Pressable
                accessibilityLabel="重新发送这条消息"
                onPress={() => void onRetry()}
                style={styles.userRetryButton}
              >
                <Text style={styles.userRetryText}>重试</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </Animated.View>
    );
  }

  return (
    <Animated.View entering={FadeIn.duration(180)} style={styles.assistantRow}>
      <View style={styles.assistantAvatar}>
        <Image
          resizeMode="cover"
          source={require("@/assets/images/student/ai-support.png")}
          style={styles.assistantAvatarImage}
        />
      </View>
      <View style={styles.assistantColumn}>
        <Text style={styles.assistantName}>ECHO AI</Text>
        {blocks.map((block, index) => {
          if (block.type === "markdown") {
            return (
              <Pressable
                delayLongPress={320}
                key={blockKey(block, index)}
                onLongPress={() => setActionsVisible(true)}
                style={styles.assistantBody}
              >
                <MarkdownContent content={block.markdown} />
              </Pressable>
            );
          }
          if (block.type === "text") {
            return (
              <Pressable
                delayLongPress={320}
                key={blockKey(block, index)}
                onLongPress={() => setActionsVisible(true)}
                style={styles.assistantBody}
              >
                <Text selectable style={styles.assistantText}>
                  {block.text}
                </Text>
              </Pressable>
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
        {message.status === "streaming" && blocks.length === 0 ? (
          <View style={styles.assistantBody}>
            <StreamingWaiting />
          </View>
        ) : null}
        {message.status === "streaming" && blocks.length > 0 ? (
          <View style={styles.streamingInlineRow}>
            <StreamingCursor />
            <Text style={styles.streamingInlineText}>正在生成</Text>
          </View>
        ) : null}
        {statusLabel ? <Text style={styles.assistantStatus}>{statusLabel}</Text> : null}
        <View style={styles.messageActions}>
          {message.citations.length > 0 ? (
            <Pressable
              accessibilityLabel={`查看 ${message.citations.length} 个课程来源`}
              onPress={() => setCitationsVisible(true)}
              style={styles.sourceChip}
            >
              <SymbolView
                name={{ android: "menu_book", web: "menu_book" }}
                size={15}
                tintColor={studentTheme.color.primary}
              />
              <Text style={styles.sourceChipText}>来源 · {message.citations.length}</Text>
            </Pressable>
          ) : null}
          {message.status === "interrupted" ? (
            <>
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
              <Pressable
                disabled={disabled}
                onPress={() => void onRetry()}
                style={styles.messageActionButton}
              >
                <SymbolView
                  name={{ android: "refresh", web: "refresh" }}
                  size={15}
                  tintColor={studentTheme.color.textMuted}
                />
                <Text style={styles.messageActionText}>重新提问</Text>
              </Pressable>
            </>
          ) : null}
          <Pressable
            accessibilityLabel="AI 回答操作"
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
          onViewCitations={() => {
            setActionsVisible(false);
            setCitationsVisible(true);
          }}
          visible={actionsVisible}
        />
      </View>
    </Animated.View>
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
    gap: 6,
    paddingLeft: 48,
  },
  userBubble: {
    backgroundColor: "#dcecff",
    borderColor: studentTheme.color.primaryBorder,
    borderRadius: studentTheme.radius.card,
    borderBottomRightRadius: 6,
    borderWidth: 1,
    maxWidth: "84%",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  userBubbleFailed: {
    borderColor: studentTheme.color.dangerBorder,
  },
  userMessageText: {
    color: studentTheme.color.text,
    fontSize: 15,
    lineHeight: 23,
  },
  userStatusRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    justifyContent: "flex-end",
  },
  userStatus: {
    color: studentTheme.color.textMuted,
    fontSize: 10,
  },
  userRetryButton: {
    backgroundColor: studentTheme.color.dangerSoft,
    borderRadius: studentTheme.radius.pill,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  userRetryText: {
    color: studentTheme.color.danger,
    fontSize: 10,
    fontWeight: "800",
  },
  assistantRow: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 10,
    paddingRight: 12,
  },
  assistantAvatar: {
    alignItems: "center",
    borderRadius: 17,
    height: 34,
    justifyContent: "center",
    overflow: "hidden",
    width: 34,
  },
  assistantAvatarText: {
    color: studentTheme.color.primary,
    fontSize: 15,
    fontWeight: "900",
  },
  assistantAvatarImage: {
    height: "100%",
    width: "100%",
  },
  assistantName: {
    color: studentTheme.color.text,
    fontSize: 13,
    fontWeight: "800",
    marginTop: -1,
  },
  assistantBody: {
    backgroundColor: studentTheme.color.surface,
    borderColor: studentTheme.color.divider,
    borderRadius: studentTheme.radius.card,
    borderTopLeftRadius: 6,
    borderWidth: 1,
    padding: 14,
    shadowColor: "#17345c",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.035,
    shadowRadius: 12,
  },
  codeFence: {
    backgroundColor: "#f3f6fa",
    borderColor: studentTheme.color.divider,
    borderRadius: studentTheme.radius.medium,
    borderWidth: 1,
    marginVertical: 8,
    overflow: "hidden",
  },
  codeHeader: {
    alignItems: "center",
    borderBottomColor: studentTheme.color.divider,
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    minHeight: 36,
    paddingHorizontal: 10,
  },
  codeLabel: {
    color: studentTheme.color.textSubtle,
    fontSize: 11,
    fontWeight: "700",
  },
  codeCopyButton: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
    minHeight: 30,
    paddingHorizontal: 4,
  },
  codeCopyText: {
    color: studentTheme.color.primary,
    fontSize: 11,
    fontWeight: "800",
  },
  codeText: {
    color: studentTheme.color.text,
    fontFamily: "monospace",
    fontSize: 13,
    lineHeight: 20,
    padding: 12,
  },
  assistantColumn: {
    flex: 1,
    gap: 10,
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
    fontSize: 16,
    lineHeight: 26,
  },
  assistantStatus: {
    alignSelf: "flex-start",
    backgroundColor: studentTheme.color.surfaceSoft,
    borderRadius: studentTheme.radius.pill,
    color: studentTheme.color.textMuted,
    fontSize: 10,
    overflow: "hidden",
    paddingHorizontal: 9,
    paddingVertical: 4,
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
  streamingInlineRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 4,
  },
  streamingInlineText: {
    color: studentTheme.color.textSubtle,
    fontSize: 10,
    fontWeight: "700",
  },
  streamingCursor: {
    backgroundColor: studentTheme.color.primary,
    borderRadius: 2,
    height: 14,
    width: 3,
  },
  messageActions: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    paddingHorizontal: 4,
  },
  messageActionButton: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
    minHeight: 30,
  },
  sourceChip: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: studentTheme.color.primaryBorder,
    borderRadius: studentTheme.radius.pill,
    borderWidth: 1,
    flexDirection: "row",
    gap: 5,
    minHeight: 30,
    paddingHorizontal: 10,
  },
  sourceChipText: {
    color: studentTheme.color.primary,
    fontSize: 11,
    fontWeight: "800",
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
    backgroundColor: studentTheme.color.hintSoft,
    borderColor: studentTheme.color.hintBorder,
    borderRadius: studentTheme.radius.card,
    borderWidth: 1,
    gap: 9,
    padding: 14,
  },
  hintHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 9,
  },
  hintHeading: {
    alignItems: "center",
    flex: 1,
    flexDirection: "row",
    gap: 7,
  },
  hintLabel: {
    color: studentTheme.color.text,
    fontSize: 14,
    fontWeight: "800",
  },
  hintBadge: {
    backgroundColor: "#ffffff",
    borderRadius: studentTheme.radius.pill,
    color: studentTheme.color.violet,
    fontSize: 10,
    fontWeight: "800",
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  hintIcon: {
    alignItems: "center",
    backgroundColor: studentTheme.color.hintIcon,
    borderRadius: 10,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  hintTitle: {
    color: studentTheme.color.text,
    fontSize: 13,
    fontWeight: "900",
  },
  hintText: {
    color: "#514a70",
    fontSize: 13,
    lineHeight: 21,
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  thoughtAction: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: studentTheme.color.hintBorder,
    borderRadius: studentTheme.radius.medium,
    borderWidth: 1,
    justifyContent: "center",
    minHeight: 36,
    paddingHorizontal: 12,
  },
  thoughtActionText: {
    color: studentTheme.color.violet,
    fontSize: 12,
    fontWeight: "800",
  },
  moreHintAction: {
    alignItems: "center",
    backgroundColor: studentTheme.color.violet,
    borderRadius: studentTheme.radius.medium,
    justifyContent: "center",
    minHeight: 36,
    paddingHorizontal: 12,
  },
  moreHintActionText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "800",
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
    backgroundColor: studentTheme.color.learningSoft,
    borderColor: studentTheme.color.learningBorder,
    borderRadius: studentTheme.radius.card,
    borderWidth: 1,
    gap: 11,
    padding: 14,
  },
  quickHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 9,
  },
  quickHeading: {
    alignItems: "flex-start",
    flex: 1,
    gap: 6,
  },
  quickTitle: {
    color: studentTheme.color.text,
    fontSize: 14,
    fontWeight: "800",
    lineHeight: 20,
  },
  quickMetaRow: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
  },
  quickBadge: {
    backgroundColor: "#ffffff",
    borderRadius: studentTheme.radius.pill,
    color: studentTheme.color.primary,
    fontSize: 10,
    fontWeight: "800",
    overflow: "hidden",
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  quickIcon: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderRadius: 10,
    height: 32,
    justifyContent: "center",
    width: 32,
  },
  attemptCount: {
    color: studentTheme.color.textMuted,
    fontSize: 10,
    fontWeight: "700",
    lineHeight: 16,
  },
  quickPrompt: {
    color: studentTheme.color.text,
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 23,
  },
  optionList: {
    gap: 8,
  },
  option: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderColor: studentTheme.color.divider,
    borderRadius: studentTheme.radius.medium,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: 50,
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
  optionMarkerTextActive: {
    color: "#ffffff",
  },
  optionRadio: {
    borderColor: studentTheme.color.textSubtle,
    borderRadius: studentTheme.radius.pill,
    borderWidth: 1,
    height: 16,
    width: 16,
  },
  optionRadioSelected: {
    backgroundColor: studentTheme.color.primary,
    borderColor: studentTheme.color.primary,
    borderWidth: 4,
  },
  optionText: {
    color: studentTheme.color.text,
    flex: 1,
    fontSize: 14,
    lineHeight: 21,
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
    backgroundColor: studentTheme.color.successSoft,
    borderColor: studentTheme.color.successBorder,
    borderRadius: studentTheme.radius.card,
    borderWidth: 1,
    gap: 10,
    padding: 14,
  },
  masteryHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
  },
  masteryHeading: {
    flex: 1,
  },
  masteryEyebrow: {
    color: "#287455",
    fontSize: 11,
    fontWeight: "800",
  },
  masteryKnowledge: {
    color: studentTheme.color.text,
    fontSize: 14,
    fontWeight: "800",
    marginTop: 3,
  },
  masteryScoreRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 9,
    marginTop: 2,
  },
  masteryBefore: {
    color: "#527565",
    fontSize: 15,
    fontWeight: "700",
  },
  masteryAfter: {
    color: studentTheme.color.success,
    fontSize: 22,
    fontWeight: "900",
  },
  masteryEvidence: {
    color: "#2f6d52",
    fontSize: 12,
    lineHeight: 18,
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
    backgroundColor: "#ffffff",
    borderTopLeftRadius: studentTheme.radius.sheet,
    borderTopRightRadius: studentTheme.radius.sheet,
    maxHeight: "84%",
    overflow: "hidden",
    paddingBottom: 18,
    paddingTop: 10,
  },
  resultContent: {
    gap: 14,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  resultHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
  },
  resultHeading: {
    flex: 1,
  },
  resultMark: {
    alignItems: "center",
    borderRadius: 22,
    height: 44,
    justifyContent: "center",
    width: 44,
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
    fontWeight: "800",
  },
  resultSubtitle: {
    color: studentTheme.color.textMuted,
    fontSize: 12,
    marginTop: 3,
  },
  resultDescription: {
    color: studentTheme.color.textMuted,
    fontSize: 14,
    lineHeight: 22,
  },
  resultButton: {
    alignItems: "center",
    backgroundColor: studentTheme.color.primary,
    borderRadius: studentTheme.radius.medium,
    justifyContent: "center",
    marginHorizontal: 20,
    marginTop: 14,
    minHeight: 46,
  },
  resultButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "900",
  },
  citationSheet: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: studentTheme.radius.sheet,
    borderTopRightRadius: studentTheme.radius.sheet,
    maxHeight: "78%",
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 24,
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
  citationHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 14,
  },
  sheetSubtitle: {
    color: studentTheme.color.textMuted,
    fontSize: 11,
    marginTop: 3,
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
    gap: 10,
    paddingBottom: 10,
    paddingTop: 16,
  },
  citationItem: {
    backgroundColor: studentTheme.color.surfaceSoft,
    borderColor: studentTheme.color.divider,
    borderRadius: studentTheme.radius.card,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    padding: 13,
  },
  citationIndexWrap: {
    alignItems: "center",
    backgroundColor: studentTheme.color.primarySoft,
    borderRadius: 10,
    height: 28,
    justifyContent: "center",
    width: 28,
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
    fontSize: 14,
    fontWeight: "800",
  },
  citationMetaRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    marginTop: 5,
  },
  citationChapter: {
    color: studentTheme.color.textMuted,
    flex: 1,
    fontSize: 11,
  },
  citationPage: {
    color: studentTheme.color.primary,
    fontSize: 11,
    fontWeight: "800",
  },
  citationQuote: {
    color: studentTheme.color.textMuted,
    fontSize: 12,
    lineHeight: 19,
    marginTop: 9,
  },
  citationExpand: {
    color: studentTheme.color.primary,
    fontSize: 11,
    fontWeight: "800",
    marginTop: 7,
  },
  citationQuoteUnavailable: {
    color: studentTheme.color.textSubtle,
    fontSize: 12,
    marginTop: 9,
  },
  actionSheet: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: studentTheme.radius.sheet,
    borderTopRightRadius: studentTheme.radius.sheet,
    gap: 4,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 28,
  },
  actionSheetTitle: {
    color: studentTheme.color.text,
    fontSize: 18,
    fontWeight: "800",
    marginTop: 14,
  },
  actionSheetDescription: {
    color: studentTheme.color.textMuted,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 8,
    marginTop: 4,
  },
  actionItem: {
    alignItems: "center",
    backgroundColor: studentTheme.color.surfaceSoft,
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
