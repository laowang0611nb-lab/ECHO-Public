"use client";

import type { Notification, NotificationType } from "@echo/shared-types";
import {
  Bell,
  CheckCheck,
  CircleAlert,
  LoaderCircle,
  ServerCog,
  ShieldAlert,
  TriangleAlert,
  UserPlus,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  useUnreadNotificationCount,
} from "@/features/notifications/queries";
import { cn } from "@/lib/utils";

const notificationMeta: Record<
  NotificationType,
  { label: string; icon: typeof Bell }
> = {
  ai_high_risk: { label: "AI 高风险审核", icon: ShieldAlert },
  student_abnormal: { label: "学生异常", icon: TriangleAlert },
  course_member_change: { label: "课程成员变化", icon: UserPlus },
  system_status: { label: "系统状态", icon: ServerCog },
};

function notificationHref(notification: Notification) {
  const actionUrl = notification.action_url;
  if (!actionUrl || !actionUrl.startsWith("/")) {
    return null;
  }

  const reviewMatch = actionUrl.match(/^\/review-flags\/([^/?#]+)/);
  if (reviewMatch) {
    const params = new URLSearchParams({ reviewId: reviewMatch[1] });
    if (notification.course_id) params.set("courseId", notification.course_id);
    return `/ai-review/pending?${params.toString()}`;
  }

  const courseStudentsMatch = actionUrl.match(/^\/courses\/([^/?#]+)\/students/);
  if (courseStudentsMatch) {
    return `/courses/${courseStudentsMatch[1]}?tab=students`;
  }

  return actionUrl;
}

function notificationTime(value: string) {
  return value.slice(0, 16).replace("T", " ");
}

export function NotificationCenter() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const notifications = useNotifications();
  const unread = useUnreadNotificationCount();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const items = useMemo(
    () => notifications.data?.pages.flatMap((page) => page.items) ?? [],
    [notifications.data?.pages],
  );
  const unreadCount = unread.data?.unreadCount ?? items.filter((item) => !item.read_at).length;

  async function openNotification(notification: Notification) {
    setActionError(null);
    try {
      if (!notification.read_at) {
        await markRead.mutateAsync(notification.id);
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "通知状态更新失败，请稍后重试。");
      return;
    }

    const href = notificationHref(notification);
    if (href) {
      setOpen(false);
      router.push(href);
    }
  }

  async function markEverythingRead() {
    setActionError(null);
    try {
      await markAllRead.mutateAsync();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "全部已读操作失败，请稍后重试。");
    }
  }

  return (
    <>
      <Button
        aria-label={unreadCount ? `通知中心，${unreadCount} 条未读` : "通知中心"}
        className="relative"
        onClick={() => setOpen(true)}
        size="icon"
        type="button"
        variant="ghost"
      >
        <Bell data-icon="inline-start" />
        {unreadCount ? (
          <span className="absolute right-0 top-0 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-4 text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </Button>

      <Drawer onOpenChange={setOpen} open={open} swipeDirection="right">
        <DrawerContent className="sm:max-w-md">
          <DrawerHeader className="border-b border-border px-5 py-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <DrawerTitle>通知中心</DrawerTitle>
                <DrawerDescription>{unreadCount ? `${unreadCount} 条未读通知` : "当前没有未读通知"}</DrawerDescription>
              </div>
              <Button
                disabled={!unreadCount || markAllRead.isPending}
                onClick={() => void markEverythingRead()}
                size="sm"
                type="button"
                variant="outline"
              >
                <CheckCheck data-icon="inline-start" />
                全部已读
              </Button>
            </div>
          </DrawerHeader>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
            {notifications.isPending ? (
              <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-muted-foreground">
                <LoaderCircle className="size-4 animate-spin" />
                正在加载通知...
              </div>
            ) : null}
            {notifications.isError ? (
              <div className="rounded-lg border-2 border-destructive/20 bg-destructive/5 px-4 py-4 text-sm text-destructive">
                <p>通知加载失败，请确认后端服务后重试。</p>
                <Button className="mt-3" onClick={() => void notifications.refetch()} size="sm" type="button" variant="outline">
                  重新加载
                </Button>
              </div>
            ) : null}
            {!notifications.isPending && !notifications.isError && !items.length ? (
              <div className="flex min-h-48 flex-col items-center justify-center px-6 text-center">
                <Bell className="size-8 text-muted-foreground/50" />
                <p className="mt-3 text-sm font-medium">暂无通知</p>
                <p className="mt-1 text-xs text-muted-foreground">AI 高风险审核和课程成员变化会显示在这里。</p>
              </div>
            ) : null}

            <div className="space-y-2">
              {items.map((notification) => {
                const meta = notificationMeta[notification.type];
                const Icon = meta.icon;
                const itemPending = markRead.isPending && markRead.variables === notification.id;
                return (
                  <button
                    className={cn(
                      "w-full rounded-xl border-2 px-4 py-3 text-left transition-colors hover:border-primary/35 hover:bg-muted/30",
                      notification.read_at ? "border-border bg-card" : "border-blue-200 bg-blue-50/45",
                    )}
                    disabled={itemPending}
                    key={notification.id}
                    onClick={() => void openNotification(notification)}
                    type="button"
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={cn(
                          "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg",
                          notification.severity === "critical"
                            ? "bg-red-50 text-red-600"
                            : notification.severity === "warning"
                              ? "bg-orange-50 text-orange-600"
                              : "bg-blue-50 text-primary",
                        )}
                      >
                        <Icon className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-sm font-semibold">{notification.title}</span>
                          {!notification.read_at ? <span className="size-2 shrink-0 rounded-full bg-primary" /> : null}
                        </span>
                        <span className="mt-1 line-clamp-2 block text-xs leading-5 text-muted-foreground">{notification.body}</span>
                        <span className="mt-2 flex items-center gap-2 text-[11px] text-muted-foreground">
                          <span>{meta.label}</span>
                          <span>·</span>
                          <span>{notificationTime(notification.created_at)}</span>
                          {itemPending ? <LoaderCircle className="size-3 animate-spin" /> : null}
                        </span>
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>

            {actionError ? (
              <p className="mt-3 rounded-lg border-2 border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {actionError}
              </p>
            ) : null}
          </div>

          <DrawerFooter className="border-t border-border px-5">
            {notifications.hasNextPage ? (
              <Button
                disabled={notifications.isFetchingNextPage}
                onClick={() => void notifications.fetchNextPage()}
                type="button"
                variant="outline"
              >
                {notifications.isFetchingNextPage ? <LoaderCircle className="size-4 animate-spin" /> : <CircleAlert className="size-4" />}
                加载更多
              </Button>
            ) : null}
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </>
  );
}
