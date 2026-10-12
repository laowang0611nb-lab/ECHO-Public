"use client";

import { Bot, CircleAlert, Eraser, LoaderCircle, Send, Square, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { Textarea } from "@/components/ui/textarea";
import { teacherAssistantNavigationHref } from "./navigation";
import { SafeMarkdown } from "./safe-markdown";
import { useTeacherAssistant } from "./teacher-assistant-provider";

export function TeacherAssistantPanel() {
  const router = useRouter();
  const {
    open,
    setOpen,
    messages,
    capabilities,
    capabilitiesLoading,
    unavailableReason,
    sending,
    statusLabel,
    courseId,
    pageLabel,
    sendMessage,
    stop,
    clear,
    retryCapabilities,
  } = useTeacherAssistant();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const nearBottomRef = useRef(true);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 120);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element || !nearBottomRef.current) return;
    element.scrollTop = element.scrollHeight;
  }, [messages, statusLabel]);

  async function submit() {
    const content = input.trim();
    if (!content) return;
    setInput("");
    await sendMessage(content);
  }

  return (
    <Drawer onOpenChange={setOpen} open={open} swipeDirection="right">
      <DrawerContent className="w-[min(100vw,460px)] sm:max-w-[460px]">
        <DrawerHeader className="border-b border-border px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                <Bot className="size-4" />
              </span>
              <div className="min-w-0">
                <DrawerTitle>ECHO AI 助手</DrawerTitle>
                <DrawerDescription className="truncate">当前页面：{pageLabel}</DrawerDescription>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button aria-label="清除对话" disabled={!messages.length} onClick={clear} size="icon-sm" type="button" variant="ghost">
                <Eraser />
              </Button>
              <Button aria-label="关闭 AI 助手" onClick={() => setOpen(false)} size="icon-sm" type="button" variant="ghost">
                <X />
              </Button>
            </div>
          </div>
        </DrawerHeader>

        <div
          className="min-h-0 flex-1 overflow-y-auto px-4 py-4"
          onScroll={(event) => {
            const element = event.currentTarget;
            nearBottomRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
          }}
          ref={scrollRef}
        >
          {capabilitiesLoading ? (
            <div className="flex min-h-40 items-center justify-center gap-2 text-sm text-muted-foreground">
              <LoaderCircle className="size-4 animate-spin" />
              正在确认 AI 助手服务…
            </div>
          ) : unavailableReason ? (
            <div className="flex min-h-40 flex-col items-center justify-center rounded-xl border border-dashed border-border px-5 text-center">
              <CircleAlert className="size-6 text-muted-foreground/60" />
              <p className="mt-3 text-sm font-medium text-foreground">AI 助手暂不可用</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{unavailableReason}</p>
              {!courseId ? null : (
                <Button className="mt-4" onClick={retryCapabilities} size="sm" type="button" variant="outline">重试</Button>
              )}
            </div>
          ) : messages.length === 0 ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-primary/15 bg-primary/5 px-4 py-4">
                <p className="text-sm font-medium text-foreground">我可以帮你查课程、讲功能、找页面。</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">回答只使用当前课程可访问的真实数据，不会替你执行审核或发布操作。</p>
              </div>
              <div className="space-y-2">
                {(capabilities?.suggested_prompts ?? []).map((prompt) => (
                  <button
                    className="w-full rounded-lg border border-border px-3 py-2.5 text-left text-sm transition-colors hover:border-primary/35 hover:bg-muted/40"
                    key={prompt}
                    onClick={() => void sendMessage(prompt)}
                    type="button"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-4" aria-live="polite">
              {messages.map((message) => (
                <div className={message.role === "user" ? "flex justify-end" : "flex justify-start"} key={message.id}>
                  <div className={message.role === "user" ? "max-w-[88%] rounded-2xl rounded-br-sm bg-primary px-3.5 py-2.5 text-sm text-primary-foreground" : "max-w-[92%] rounded-2xl rounded-bl-sm border border-border bg-card px-3.5 py-3 text-card-foreground"}>
                    {message.role === "assistant" ? (
                      <>
                        <SafeMarkdown content={message.content || (message.status === "streaming" ? "正在整理…" : "")} />
                        {message.insufficientEvidence ? <p className="mt-2 text-xs text-amber-700">证据不足，当前回答只覆盖已核实的数据。</p> : null}
                        {message.suggestedActions.length ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {message.suggestedActions.map((action) => {
                              const href = teacherAssistantNavigationHref(action.target, courseId);
                              if (!href) return null;
                              return (
                                <Button
                                  key={action.id}
                                  onClick={() => router.push(href)}
                                  size="sm"
                                  type="button"
                                  variant="outline"
                                >
                                  {action.label}
                                </Button>
                              );
                            })}
                          </div>
                        ) : null}
                      </>
                    ) : message.content}
                  </div>
                </div>
              ))}
              {statusLabel ? (
                <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
                  {sending ? <LoaderCircle className="size-3 animate-spin" /> : null}
                  <span>{statusLabel}</span>
                </div>
              ) : null}
            </div>
          )}
        </div>

        <div className="border-t border-border px-4 py-3">
          {unavailableReason ? null : (
            <>
              <Textarea
                aria-label="向 ECHO AI 助手提问"
                className="min-h-20 resize-none"
                disabled={sending || !capabilities?.enabled}
                maxLength={capabilities?.max_message_chars ?? 4000}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void submit();
                  }
                }}
                placeholder="例如：AI 审核功能在哪里？"
                ref={inputRef}
                value={input}
              />
              <div className="mt-2 flex items-center justify-between gap-3">
                <span className="text-[11px] text-muted-foreground">{input.length}/{capabilities?.max_message_chars ?? 4000}</span>
                {sending ? (
                  <Button onClick={stop} size="sm" type="button" variant="outline"><Square className="size-3" />停止</Button>
                ) : (
                  <Button disabled={!input.trim() || !capabilities?.enabled} onClick={() => void submit()} size="sm" type="button">
                    <Send className="size-3.5" />发送
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
