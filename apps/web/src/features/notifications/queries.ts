import type {
  Notification,
  NotificationMarkAllReadResponse,
  NotificationPage,
  NotificationUnreadCount,
} from "@echo/shared-types";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api";
import { useTeacherSession } from "@/providers/teacher-session-provider";

export const notificationQueryKeys = {
  list: (userId: string, unread: boolean) => ["teacher", "notifications", "list", userId, unread ? "unread" : "all"] as const,
  unread: (userId: string) => ["teacher", "notifications", "unread", userId] as const,
};

export function useNotifications(unread = false) {
  const { user } = useTeacherSession();
  const userId = user?.id;
  return useInfiniteQuery<NotificationPage>({
    queryKey: notificationQueryKeys.list(userId ?? "anonymous", unread),
    queryFn: ({ pageParam }) =>
      apiClient.listNotifications(userId!, {
        unread: unread ? true : undefined,
        cursor: typeof pageParam === "string" ? pageParam : undefined,
        limit: 20,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: Boolean(userId),
    staleTime: 15_000,
  });
}

export function useUnreadNotificationCount() {
  const { user } = useTeacherSession();
  const userId = user?.id;
  return useQuery<NotificationUnreadCount>({
    queryKey: notificationQueryKeys.unread(userId ?? "anonymous"),
    queryFn: () => apiClient.getUnreadNotificationCount(userId!),
    enabled: Boolean(userId),
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  const { user } = useTeacherSession();
  const userId = user?.id;
  return useMutation<Notification, Error, string>({
    mutationFn: (notificationId) => apiClient.markNotificationRead(userId!, notificationId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["teacher", "notifications"] });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  const { user } = useTeacherSession();
  const userId = user?.id;
  return useMutation<NotificationMarkAllReadResponse, Error, void>({
    mutationFn: () => apiClient.markAllNotificationsRead(userId!),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["teacher", "notifications"] });
    },
  });
}
