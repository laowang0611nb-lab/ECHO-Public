import type {
  ChatAttachment,
  AIMessageBlock,
  ChatStreamEvent,
  Conversation,
  HintBlock,
  Message,
  QuickCheckAttemptResponse,
  QuickCheckBlock,
} from "@echo/shared-types";
import type { ChatAttachmentDraft } from "@/features/chat/chat-attachment-draft";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { apiClient } from "@/lib/api-client";
import { isOfflineError } from "@/lib/service-status";
import { useCurrentCourse } from "@/providers/current-course-provider";
import { useStudentSession } from "@/providers/student-session-provider";
import { studentStorage } from "@/services/student-storage";

export interface ChatController {
  conversations: Conversation[];
  conversationsLoading: boolean;
  messages: Message[];
  messagesLoading: boolean;
  conversationError: Error | null;
  activeConversationId: string | null;
  draft: string;
  setDraft: (value: string) => void;
  attachments: ChatAttachmentDraft[];
  attachmentError: string | null;
  addAttachment: (attachment: ChatAttachmentDraft) => void;
  removeAttachment: (localId: string) => void;
  isStreaming: boolean;
  offline: boolean;
  retryConnection: () => void;
  sendMessage: (content: string) => Promise<void>;
  retryMessage: (message: Message) => Promise<void>;
  stopStream: () => void;
  continueMessage: (message: Message) => Promise<void>;
  selectConversation: (conversationId: string) => void;
  newConversation: () => void;
  requestHint: (messageId: string, level?: number) => Promise<HintBlock>;
  submitQuickCheck: (
    messageId: string,
    block: QuickCheckBlock,
    optionId: string,
    attemptId: string,
  ) => Promise<QuickCheckAttemptResponse>;
  reportNotResolved: (messageId: string, note?: string) => Promise<void>;
}

interface ChatControllerOptions {
  courseId: string | null;
  conversationId: string | null;
  knowledgePointId: string | null;
  initialQuestion: string | null;
}

interface PendingRequest {
  clientRequestId: string;
  content: string;
  userId: string;
  assistantId: string;
}

type MessageOverride = Partial<
  Pick<Message, "content" | "status" | "blocks" | "citations" | "attachments">
>;

function createClientId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function friendlyError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (isOfflineError(error)) {
    return "ECHO 服务暂时不可用，请检查连接后重试。";
  }
  if (/501|not implemented|NOT_IMPLEMENTED|multimodal|多模态/i.test(message)) {
    return "多模态接口已预留，等待后端补全后即可发送。";
  }
  if (/401|403|permission|forbidden/i.test(message)) {
    return "当前课程或会话不可访问，请返回课程后重试。";
  }
  if (/422|invalid|validation/i.test(message)) {
    return "这条消息暂时无法发送，请调整内容后重试。";
  }
  return "回答暂时没有完成，请稍后重试。";
}

function draftStorageKey(
  userId: string,
  courseId: string,
  conversationId: string | null,
): string {
  return `echo.chat.draft.${userId}.${courseId}.${conversationId ?? "new"}`;
}

export function useChatController({
  courseId,
  conversationId,
  knowledgePointId,
  initialQuestion,
}: ChatControllerOptions): ChatController {
  const { user } = useStudentSession();
  const { selectedCourse, selectCourse } = useCurrentCourse();
  const queryClient = useQueryClient();
  const router = useRouter();
  const userId = user?.id ?? "";
  const effectiveCourseId = courseId ?? selectedCourse?.id ?? null;

  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(
    conversationId,
  );
  const [draft, setDraftState] = useState(initialQuestion ?? "");
  const [attachments, setAttachments] = useState<ChatAttachmentDraft[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [optimisticMessages, setOptimisticMessages] = useState<Message[]>([]);
  const [messageOverrides, setMessageOverrides] = useState<
    Record<string, MessageOverride>
  >({});
  const [isStreaming, setIsStreaming] = useState(false);
  const [isNewConversation, setIsNewConversation] = useState(!conversationId);
  const [failedRequest, setFailedRequest] = useState<PendingRequest | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const activeAssistantRef = useRef<string | null>(null);
  const contentRef = useRef<Record<string, string>>({});
  const blocksRef = useRef<Record<string, AIMessageBlock[]>>({});
  const citationsRef = useRef<Record<string, Message["citations"]>>({});
  const draftLoadedKeyRef = useRef<string | null>(null);

  const healthQuery = useQuery({
    queryKey: ["echo-health"],
    queryFn: () => apiClient.health(),
    retry: false,
    refetchInterval: 15_000,
  });
  const offline = healthQuery.isError;

  const conversationsQuery = useQuery({
    queryKey: ["student-conversations", userId, effectiveCourseId],
    queryFn: () => apiClient.listConversations(userId, effectiveCourseId ?? ""),
    enabled: Boolean(userId && effectiveCourseId),
  });
  const conversations = useMemo(
    () => conversationsQuery.data ?? [],
    [conversationsQuery.data],
  );
  const activeConversationId = useMemo(() => {
    if (isNewConversation) {
      return null;
    }
    if (selectedConversationId) {
      const belongsToCourse = conversations.some(
        (conversation) => conversation.id === selectedConversationId,
      );
      if (
        conversationsQuery.isLoading ||
        belongsToCourse
      ) {
        return selectedConversationId;
      }
    }
    return conversations[0]?.id ?? null;
  }, [
    conversations,
    conversationsQuery.isLoading,
    isNewConversation,
    selectedConversationId,
  ]);

  const messagesQuery = useQuery({
    queryKey: ["student-messages", userId, activeConversationId],
    queryFn: () => apiClient.listMessages(userId, activeConversationId ?? ""),
    enabled: Boolean(userId && activeConversationId),
  });

  useEffect(() => {
    if (!courseId || !selectedCourse || selectedCourse.id === courseId) {
      return;
    }
    selectCourse(courseId);
  }, [courseId, selectCourse, selectedCourse]);

  const draftKey = useMemo(
    () =>
      userId && effectiveCourseId
        ? draftStorageKey(userId, effectiveCourseId, activeConversationId)
        : null,
    [activeConversationId, effectiveCourseId, userId],
  );

  useEffect(() => {
    if (!draftKey || draftLoadedKeyRef.current === draftKey) {
      return;
    }
    draftLoadedKeyRef.current = draftKey;
    let cancelled = false;
    void studentStorage.getItem(draftKey).then((stored) => {
      if (!cancelled && stored !== null) {
        setDraftState((current) => (stored === current ? current : stored));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [draftKey]);

  useEffect(() => {
    if (!draftKey || draftLoadedKeyRef.current !== draftKey) {
      return;
    }
    const timer = setTimeout(() => {
      if (draft.trim()) {
        void studentStorage.setItem(draftKey, draft);
      } else {
        void studentStorage.removeItem(draftKey);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [draft, draftKey]);

  function addAttachment(attachment: ChatAttachmentDraft) {
    setAttachmentError(null);
    setAttachments((current) => {
      if (current.length >= 4) {
        setAttachmentError("每条消息最多添加 4 个附件。");
        return current;
      }
      return [...current, attachment];
    });
  }

  function removeAttachment(localId: string) {
    setAttachments((current) =>
      current.filter((attachment) => attachment.localId !== localId),
    );
    setAttachmentError(null);
  }

  const patchMessage = useCallback((messageId: string, patch: MessageOverride) => {
    setMessageOverrides((current) => ({
      ...current,
      [messageId]: {
        ...current[messageId],
        ...patch,
      },
    }));
    setOptimisticMessages((current) =>
      current.map((message) => (message.id === messageId ? { ...message, ...patch } : message)),
    );
  }, []);

  const renameMessage = useCallback((oldId: string, newId: string) => {
    if (oldId === newId) {
      return;
    }
    if (contentRef.current[oldId] !== undefined) {
      contentRef.current[newId] = contentRef.current[oldId];
      delete contentRef.current[oldId];
    }
    if (blocksRef.current[oldId] !== undefined) {
      blocksRef.current[newId] = blocksRef.current[oldId];
      delete blocksRef.current[oldId];
    }
    if (citationsRef.current[oldId] !== undefined) {
      citationsRef.current[newId] = citationsRef.current[oldId];
      delete citationsRef.current[oldId];
    }
    setOptimisticMessages((current) =>
      current.map((message) => (message.id === oldId ? { ...message, id: newId } : message)),
    );
    setMessageOverrides((current) => {
      const next = { ...current };
      if (next[oldId]) {
        next[newId] = next[oldId];
        delete next[oldId];
      }
      return next;
    });
  }, []);

  const consumeStream = useCallback(
    async (
      stream: AsyncGenerator<ChatStreamEvent>,
      localUserId: string | null,
      localAssistantId: string | null,
    ): Promise<boolean> => {
      let userIdForMessage = localUserId;
      let assistantId = localAssistantId;
      for await (const event of stream) {
        if (event.event === "message_start") {
          const serverUserId = event.data.user_message_id;
          const serverAssistantId = event.data.assistant_message_id;
          if (userIdForMessage && serverUserId && userIdForMessage !== serverUserId) {
            renameMessage(userIdForMessage, serverUserId);
          }
          if (serverUserId) {
            patchMessage(serverUserId, { status: "sent" });
          } else if (userIdForMessage) {
            patchMessage(userIdForMessage, { status: "sent" });
          }
          if (assistantId && serverAssistantId && assistantId !== serverAssistantId) {
            renameMessage(assistantId, serverAssistantId);
          }
          userIdForMessage = serverUserId || userIdForMessage;
          assistantId = serverAssistantId || assistantId;
          if (assistantId) {
            activeAssistantRef.current = assistantId;
            patchMessage(assistantId, { status: "streaming" });
          }
          continue;
        }

        if (event.event === "text_delta" && assistantId) {
          const nextContent = `${contentRef.current[assistantId] ?? ""}${event.data.delta}`;
          contentRef.current[assistantId] = nextContent;
          patchMessage(assistantId, {
            content: nextContent,
            status: "streaming",
          });
          continue;
        }

        if (event.event === "block" && assistantId) {
          const nextBlocks = [...(blocksRef.current[assistantId] ?? [])];
          const block = event.data.block;
          const existingIndex = nextBlocks.findIndex((item) => {
            if (item.type !== block.type) {
              return false;
            }
            if (item.type === "quick_check" && block.type === "quick_check") {
              return item.question_id === block.question_id;
            }
            return true;
          });
          if (existingIndex >= 0) {
            nextBlocks[existingIndex] = block;
          } else {
            nextBlocks.push(block);
          }
          blocksRef.current[assistantId] = nextBlocks;
          patchMessage(assistantId, { blocks: nextBlocks });
          continue;
        }

        if (event.event === "citation" && assistantId) {
          const citations = citationsRef.current[assistantId] ?? [];
          const alreadyPresent = citations.some(
            (citation) => citation.citation_index === event.data.index,
          );
          if (!alreadyPresent) {
            const nextCitations = [
              ...citations,
              {
                citation_index: event.data.index,
                chunk_id: event.data.chunk_id,
                document_id: event.data.document_id,
                page_start: event.data.page_start,
                page_end: event.data.page_end,
                quote: "",
              },
            ];
            citationsRef.current[assistantId] = nextCitations;
            patchMessage(assistantId, {
              citations: nextCitations,
            });
          }
          continue;
        }

        if (event.event === "error") {
          const message = friendlyError(event.data.detail);
          if (assistantId) {
            const nextBlocks = [
              ...(blocksRef.current[assistantId] ?? []),
              { type: "warning" as const, message },
            ];
            blocksRef.current[assistantId] = nextBlocks;
            patchMessage(assistantId, {
              status: "failed",
              blocks: nextBlocks,
            });
          }
          return false;
        }

        if (event.event === "done" && assistantId) {
          patchMessage(assistantId, { status: "complete" });
          activeAssistantRef.current = null;
          return true;
        }
      }
      return false;
    },
    [patchMessage, renameMessage],
  );

  const sendMessage = useCallback(
    async (rawContent: string, reusedRequestId?: string) => {
      const content = rawContent.trim();
      const hasAttachments = attachments.length > 0;
      if (
        !user ||
        !effectiveCourseId ||
        (!content && !hasAttachments) ||
        isStreaming
      ) {
        return;
      }
      if (offline) {
        throw new Error("ECHO 服务暂时不可用");
      }

      const attachmentDrafts = attachments;
      const messageContent = content || "请分析我上传的内容。";

      const clientRequestId = reusedRequestId ?? createClientId("request");
      const localUserId = createClientId("user");
      const localAssistantId = createClientId("assistant");
      const now = new Date().toISOString();
      const baseUserMessage: Message = {
        id: localUserId,
        conversation_id: activeConversationId ?? "",
        role: "user",
        content: messageContent,
        status: "sending",
        client_request_id: clientRequestId,
        blocks: [{ type: "text", text: messageContent }],
        created_at: now,
        citations: [],
        attachments: [],
      };
      const baseAssistantMessage: Message = {
        id: localAssistantId,
        conversation_id: activeConversationId ?? "",
        role: "assistant",
        content: "",
        status: "sending",
        client_request_id: clientRequestId,
        blocks: [],
        created_at: new Date(Date.now() + 1).toISOString(),
        citations: [],
      };
      setOptimisticMessages((current) => [
        ...current.filter((message) => message.id !== localUserId),
        baseUserMessage,
        baseAssistantMessage,
      ]);
      contentRef.current[localAssistantId] = "";
      blocksRef.current[localAssistantId] = [];
      citationsRef.current[localAssistantId] = [];
      setDraftState("");
      if (draftKey) {
        void studentStorage.removeItem(draftKey);
      }
      setFailedRequest(null);
      setIsStreaming(true);
      activeAssistantRef.current = localAssistantId;

      const controller = new AbortController();
      abortRef.current = controller;
      let conversationIdForRequest = activeConversationId;
      try {
        const uploadedAttachments: ChatAttachment[] = [];
        for (const attachment of attachmentDrafts) {
          const uploaded = await apiClient.uploadChatAttachment(
            user.id,
            attachment.kind,
            {
              uri: attachment.uri,
              name: attachment.fileName,
              type: attachment.mimeType,
            },
            attachment.fileName,
          );
          uploadedAttachments.push(uploaded.attachment);
        }
        if (uploadedAttachments.length > 0) {
          patchMessage(localUserId, { attachments: uploadedAttachments });
        }
        if (!conversationIdForRequest) {
          const conversation = await apiClient.createConversation(
            user.id,
            effectiveCourseId,
            messageContent.slice(0, 80),
          );
          conversationIdForRequest = conversation.id;
          queryClient.setQueryData<Conversation[]>(
            ["student-conversations", user.id, effectiveCourseId],
            (current) => [conversation, ...(current ?? [])],
          );
          setSelectedConversationId(conversation.id);
          setIsNewConversation(false);
          router.setParams({ conversationId: conversation.id });
        }

        const stream = apiClient.streamConversationMessage(
          user.id,
          conversationIdForRequest,
          {
            content: messageContent,
            client_request_id: clientRequestId,
            knowledge_point_id: knowledgePointId,
            retrieval_limit: 5,
            attachments: uploadedAttachments,
          },
          { signal: controller.signal },
        );
        const completed = await consumeStream(
          stream,
          localUserId,
          localAssistantId,
        );
        if (!completed) {
          if (attachmentDrafts.length > 0) {
            setAttachmentError("多模态内容会保留在输入区，可直接重试。");
          }
          setFailedRequest({
            clientRequestId,
            content,
            userId: localUserId,
            assistantId: localAssistantId,
          });
        } else {
          setAttachments([]);
          setAttachmentError(null);
        }
      } catch (error) {
        const interrupted = controller.signal.aborted;
        const status = interrupted ? "interrupted" : "failed";
        const warning: AIMessageBlock = {
          type: "warning",
          message: interrupted
            ? "回答已停止，已保留已经生成的内容。"
            : friendlyError(error),
        };
        const nextBlocks = [...(blocksRef.current[localAssistantId] ?? []), warning];
        blocksRef.current[localAssistantId] = nextBlocks;
        patchMessage(localAssistantId, { status, blocks: nextBlocks });
        if (!interrupted) {
          if (attachmentDrafts.length > 0) setAttachmentError(friendlyError(error));
          setFailedRequest({
            clientRequestId,
            content,
            userId: localUserId,
            assistantId: localAssistantId,
          });
        }
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
        activeAssistantRef.current = null;
        await Promise.allSettled([
          queryClient.invalidateQueries({
            queryKey: ["student-messages", user.id, conversationIdForRequest],
          }),
          queryClient.invalidateQueries({
            queryKey: ["student-conversations", user.id, effectiveCourseId],
          }),
        ]);
      }
    },
    [
      activeConversationId,
      attachments,
      consumeStream,
      draftKey,
      effectiveCourseId,
      isStreaming,
      knowledgePointId,
      offline,
      patchMessage,
      queryClient,
      router,
      user,
    ],
  );

  const retryMessage = useCallback(
    async (message: Message) => {
      const previousUser = messagesQuery.data?.find(
        (item) =>
          item.role === "user" &&
          item.created_at <= message.created_at &&
          item.client_request_id,
      );
      const optimisticUser = optimisticMessages.find(
        (item) =>
          item.role === "user" &&
          item.created_at <= message.created_at &&
          item.client_request_id,
      );
      const sourceUser = previousUser ?? optimisticUser;
      const content = sourceUser?.content ?? message.content;
      const requestId = sourceUser?.client_request_id ?? failedRequest?.clientRequestId;
      await sendMessage(content, requestId ?? undefined);
    },
    [
      failedRequest?.clientRequestId,
      messagesQuery.data,
      optimisticMessages,
      sendMessage,
    ],
  );

  const stopStream = useCallback(() => {
    abortRef.current?.abort();
    const assistantId = activeAssistantRef.current;
    if (assistantId) {
      patchMessage(assistantId, { status: "interrupted" });
    }
    setIsStreaming(false);
    abortRef.current = null;
    activeAssistantRef.current = null;
  }, [patchMessage]);

  const continueMessage = useCallback(
    async (message: Message) => {
      if (!user || offline || isStreaming || !activeConversationId) {
        return;
      }
      const assistantId = message.id;
      contentRef.current[assistantId] = message.content;
      blocksRef.current[assistantId] = message.blocks ?? [];
      patchMessage(assistantId, { status: "streaming" });
      setIsStreaming(true);
      activeAssistantRef.current = assistantId;
      const controller = new AbortController();
      abortRef.current = controller;
      const stream = apiClient.continueConversationMessage(
        user.id,
        activeConversationId,
        message.id,
        {},
        { signal: controller.signal },
      );
      try {
        await consumeStream(stream, null, assistantId);
      } catch (error) {
        const nextBlocks = [
          ...(blocksRef.current[assistantId] ?? []),
          {
            type: "warning" as const,
            message: controller.signal.aborted
              ? "回答已停止，已保留已经生成的内容。"
              : friendlyError(error),
          },
        ];
        blocksRef.current[assistantId] = nextBlocks;
        patchMessage(assistantId, {
          status: controller.signal.aborted ? "interrupted" : "failed",
          blocks: nextBlocks,
        });
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
        activeAssistantRef.current = null;
        await queryClient.invalidateQueries({
          queryKey: ["student-messages", user.id, activeConversationId],
        });
      }
    },
    [
      activeConversationId,
      consumeStream,
      isStreaming,
      offline,
      patchMessage,
      queryClient,
      user,
    ],
  );

  const requestHint = useCallback(
    async (messageId: string, level?: number) => {
      if (!user || offline) {
        throw new Error("ECHO 服务暂时不可用");
      }
      const response = await apiClient.requestHint(user.id, messageId, {
        level: level ?? null,
      });
      const current = messagesQuery.data?.find((message) => message.id === messageId);
      const override = messageOverrides[messageId];
      const existingBlocks = override?.blocks ?? current?.blocks ?? [];
      const nextBlocks = [
        ...existingBlocks.filter((block) => block.type !== "hint"),
        response.hint,
      ];
      patchMessage(messageId, { blocks: nextBlocks });
      return response.hint;
    },
    [messageOverrides, messagesQuery.data, offline, patchMessage, user],
  );

  const submitQuickCheck = useCallback(
    async (
      messageId: string,
      block: QuickCheckBlock,
      optionId: string,
      attemptId: string,
    ): Promise<QuickCheckAttemptResponse> => {
      if (!user || offline || !activeConversationId) {
        throw new Error("ECHO 服务暂时不可用");
      }
      const response = await apiClient.submitQuickCheck(user.id, block.question_id, {
        question_id: block.question_id,
        attempt_id: attemptId,
        selected_option_id: optionId,
        conversation_id: activeConversationId,
        message_id: messageId,
      });
      const current = messagesQuery.data?.find((message) => message.id === messageId);
      const override = messageOverrides[messageId];
      const existingBlocks = override?.blocks ?? current?.blocks ?? [];
      const nextBlocks: AIMessageBlock[] = existingBlocks.map((item) => {
        if (item.type !== "quick_check" || item.question_id !== block.question_id) {
          return item;
        }
        return {
          ...item,
          status: response.correct
            ? "correct"
            : response.locked
              ? "locked"
              : response.hint
                ? "wrong"
                : "selected",
          selected_option_id: optionId,
          attempts_remaining:
            response.correct || response.locked
              ? 0
              : Math.max(0, (item.attempts_remaining ?? 1) - 1),
          correct: response.correct,
          explanation: response.explanation,
          hint: response.hint,
        };
      });
      if (response.mastery_update) {
        nextBlocks.push(response.mastery_update);
      }
      patchMessage(messageId, { blocks: nextBlocks });
      return response;
    },
    [
      activeConversationId,
      messageOverrides,
      messagesQuery.data,
      offline,
      patchMessage,
      user,
    ],
  );

  const reportNotResolved = useCallback(
    async (messageId: string, note?: string) => {
      if (!user || !effectiveCourseId || offline) {
        throw new Error("ECHO 服务暂时不可用");
      }
      await apiClient.reportMessageNotResolved(user.id, effectiveCourseId, messageId, {
        note,
      });
      const current = messagesQuery.data?.find((message) => message.id === messageId);
      const override = messageOverrides[messageId];
      const existingBlocks = override?.blocks ?? current?.blocks ?? [];
      patchMessage(messageId, {
        blocks: [
          ...existingBlocks,
          {
            type: "warning",
            message: "已提交“没解决”，教师端会在回答审核中看到这条反馈。",
          },
        ],
      });
    },
    [
      effectiveCourseId,
      messageOverrides,
      messagesQuery.data,
      offline,
      patchMessage,
      user,
    ],
  );

  const selectConversation = useCallback(
    (conversationIdToSelect: string) => {
      stopStream();
      setOptimisticMessages([]);
      setMessageOverrides({});
      setAttachments([]);
      setAttachmentError(null);
      setIsNewConversation(false);
      setSelectedConversationId(conversationIdToSelect);
      setFailedRequest(null);
      router.setParams({ conversationId: conversationIdToSelect });
    },
    [router, stopStream],
  );

  const newConversation = useCallback(() => {
    stopStream();
    setOptimisticMessages([]);
    setMessageOverrides({});
    setAttachments([]);
    setAttachmentError(null);
    setIsNewConversation(true);
    setSelectedConversationId(null);
    setFailedRequest(null);
    router.setParams({ conversationId: "" });
  }, [router, stopStream]);

  const retryConnection = useCallback(() => {
    void healthQuery.refetch();
    void conversationsQuery.refetch();
    if (activeConversationId) {
      void messagesQuery.refetch();
    }
  }, [
    activeConversationId,
    conversationsQuery,
    healthQuery,
    messagesQuery,
  ]);

  const messages = useMemo(() => {
    const persisted = messagesQuery.data ?? [];
    const withOverrides = persisted.map((message) => ({
      ...message,
      ...(messageOverrides[message.id] ?? {}),
    }));
    const persistedIds = new Set(withOverrides.map((message) => message.id));
    const optimistic = optimisticMessages
      .filter((message) => !persistedIds.has(message.id))
      .map((message) => ({
        ...message,
        ...(messageOverrides[message.id] ?? {}),
      }));
    return [...withOverrides, ...optimistic].sort((left, right) =>
      left.created_at.localeCompare(right.created_at),
    );
  }, [messageOverrides, messagesQuery.data, optimisticMessages]);

  return {
    conversations,
    conversationsLoading: conversationsQuery.isLoading,
    messages,
    messagesLoading: messagesQuery.isLoading,
    conversationError:
      messagesQuery.error instanceof Error ? messagesQuery.error : null,
    activeConversationId,
    draft,
    setDraft: setDraftState,
    attachments,
    attachmentError,
    addAttachment,
    removeAttachment,
    isStreaming,
    offline,
    retryConnection,
    sendMessage: (content) => sendMessage(content),
    retryMessage,
    stopStream,
    continueMessage,
    selectConversation,
    newConversation,
    requestHint,
    submitQuickCheck,
    reportNotResolved,
  };
}
