"use client";

import { useCallback, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck, Inbox, Loader2, WifiOff } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useNotificationRealtime } from "@/hooks/use-notification-realtime";
import { formatDateTimeVi } from "@/lib/device-format";
import {
  fetchNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
} from "@/lib/notifications-api";

const UNREAD_COUNT_KEY = ["notifications", "unread-count"];
const RECENT_LIST_KEY = ["notifications", "recent"];

function NotificationSkeleton() {
  return (
    <div className="flex flex-col gap-3 p-3">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="flex flex-col gap-1.5">
          <Skeleton className="h-3.5 w-4/5" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      ))}
    </div>
  );
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();

  const unreadCountQuery = useQuery({
    queryKey: UNREAD_COUNT_KEY,
    queryFn: () => fetchNotifications({ isRead: false, limit: 1 }),
    select: (result) => result.meta.total,
    // Chỉ cần con số cho badge — không cần refetch liên tục theo interval vì
    // realtime (WebSocket) đã tự invalidate đúng lúc có thông báo mới.
    staleTime: 60_000,
  });
  const unreadCount = unreadCountQuery.data ?? 0;

  // Chỉ fetch danh sách chi tiết khi popover thật sự mở (lazy) — tránh gọi
  // API mỗi lần Header render trong khi phần lớn thời gian người dùng không
  // bấm vào chuông.
  const listQuery = useQuery({
    queryKey: RECENT_LIST_KEY,
    queryFn: () => fetchNotifications({ limit: 20 }),
    enabled: open,
  });

  const handleNotificationCreated = useCallback(() => {
    // Thông báo mới tới — làm mới cả số đếm chưa đọc lẫn danh sách gần đây.
    // Số lượng thông báo/phiên thấp (không phải chat realtime tần suất cao)
    // nên invalidate rồi refetch đơn giản hơn hẳn tự ghép thủ công vào
    // cache, mà chi phí không đáng kể.
    queryClient.invalidateQueries({ queryKey: ["notifications"] });
  }, [queryClient]);
  useNotificationRealtime(handleNotificationCreated);

  const markReadMutation = useMutation({
    mutationFn: markNotificationAsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: markAllNotificationsAsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const notifications = listQuery.data?.data ?? [];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        className="relative inline-flex size-9 items-center justify-center rounded-full text-foreground/80 outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
        aria-label="Thông báo"
      >
        <Bell className="size-4.5" />
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 flex size-2 rounded-full bg-primary ring-2 ring-background" />
        )}
      </PopoverTrigger>

      <PopoverContent className="p-0">
        <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-2.5">
          <p className="text-sm font-semibold">Thông báo</p>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            disabled={unreadCount === 0 || markAllReadMutation.isPending}
            onClick={() => markAllReadMutation.mutate()}
          >
            {markAllReadMutation.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <CheckCheck className="size-3.5" />
            )}
            Đánh dấu tất cả đã đọc
          </Button>
        </div>

        <div className="max-h-80 overflow-y-auto">
          {listQuery.isPending ? (
            <NotificationSkeleton />
          ) : listQuery.isError ? (
            <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
              <WifiOff className="size-6 text-muted-foreground/50" />
              <p className="text-xs text-muted-foreground">
                Không thể tải thông báo
              </p>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => listQuery.refetch()}
              >
                Thử lại
              </Button>
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
              <Inbox className="size-6 text-muted-foreground/40" />
              <p className="text-xs text-muted-foreground">
                Chưa có thông báo nào
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border/60">
              {notifications.map((notification) => (
                <li key={notification.id}>
                  <button
                    type="button"
                    onClick={() =>
                      !notification.isRead &&
                      markReadMutation.mutate(notification.id)
                    }
                    className={cn(
                      "flex w-full flex-col gap-1 px-3 py-2.5 text-left transition-colors hover:bg-muted/60",
                      !notification.isRead && "bg-primary/[0.04]",
                    )}
                  >
                    <div className="flex items-start gap-2">
                      {!notification.isRead && (
                        <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                      )}
                      <p
                        className={cn(
                          "text-sm leading-snug",
                          notification.isRead
                            ? "text-muted-foreground"
                            : "text-foreground",
                        )}
                      >
                        {notification.message}
                      </p>
                    </div>
                    <span className="pl-3.5 text-xs text-muted-foreground/70">
                      {formatDateTimeVi(notification.createdAt)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
