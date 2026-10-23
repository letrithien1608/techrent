"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Bell, CheckCheck } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useNotificationRealtime } from "@/hooks/use-notification-realtime";
import { notificationKind } from "@/lib/notification-kinds";
import {
  fetchNotifications,
  markAllNotificationsAsRead,
  markNotificationAsRead,
  type AppNotification,
} from "@/lib/notifications-api";
import type { NotificationCreatedPayload } from "@/lib/realtime-socket";
import { useAuthStore } from "@/stores/auth-store";
import { NotificationList } from "./notification-list";
import { RejectBookingDialog } from "./reject-booking-dialog";

const UNREAD_COUNT_KEY = ["notifications", "unread-count"];
const POPOVER_LIMIT = 15;

type Tab = "all" | "unread";

export function useOpenNotification() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const markRead = useMutation({
    mutationFn: markNotificationAsRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });
  return useCallback(
    (notification: AppNotification, afterOpen?: () => void) => {
      if (!notification.isRead) markRead.mutate(notification.id);
      afterOpen?.();
      if (notification.link) router.push(notification.link);
    },
    [markRead, router],
  );
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("all");
  const [rejecting, setRejecting] = useState<AppNotification | null>(null);
  const queryClient = useQueryClient();
  const router = useRouter();
  const role = useAuthStore((state) => state.user?.role);
  const canModerate = role === "admin" || role === "staff";
  const openNotification = useOpenNotification();

  const unreadCountQuery = useQuery({
    queryKey: UNREAD_COUNT_KEY,
    queryFn: () => fetchNotifications({ isRead: false, limit: 1 }),
    select: (result) => result.meta.total,
    // Realtime tự invalidate khi có thông báo mới — không cần refetch định kỳ.
    staleTime: 60_000,
  });
  const unreadCount = unreadCountQuery.data ?? 0;

  // Chỉ tải danh sách khi popover mở; mở lại luôn lấy mới để thấy đúng trạng
  // thái đơn (có thể đã được admin khác xử lý).
  const listQuery = useQuery({
    queryKey: ["notifications", "popover", tab],
    queryFn: () =>
      fetchNotifications({ limit: POPOVER_LIMIT, ...(tab === "unread" ? { isRead: false } : {}) }),
    enabled: open,
    staleTime: 0,
  });

  const handleNotificationCreated = useCallback(
    (payload: NotificationCreatedPayload) => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      const kind = notificationKind(payload.type);
      toast(payload.title ?? kind.label, {
        description: payload.message,
        ...(payload.link
          ? { action: { label: "Xem", onClick: () => router.push(payload.link!) } }
          : {}),
      });
    },
    [queryClient, router],
  );
  useNotificationRealtime(handleNotificationCreated);

  const markAllReadMutation = useMutation({
    mutationFn: markAllNotificationsAsRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const badge = unreadCount > 9 ? "9+" : String(unreadCount);

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              className="relative size-10 rounded-full"
              aria-label={unreadCount > 0 ? `Thông báo, ${unreadCount} chưa đọc` : "Thông báo"}
            />
          }
        >
          <Bell className="size-5" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1 text-[11px] leading-none font-bold text-primary-foreground ring-2 ring-background">
              {badge}
            </span>
          )}
        </PopoverTrigger>
        <PopoverContent
          sideOffset={10}
          className="flex w-[400px] max-w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-2xl border border-border p-0 shadow-2xl shadow-black/40 ring-0"
        >
          <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-3">
            <h2 className="text-base font-semibold">Thông báo</h2>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-[13px] text-primary hover:text-primary"
              disabled={unreadCount === 0 || markAllReadMutation.isPending}
              onClick={() => markAllReadMutation.mutate()}
            >
              <CheckCheck />
              Đánh dấu đã đọc
            </Button>
          </div>
          <div role="tablist" aria-label="Lọc thông báo" className="flex gap-1 border-b border-border px-4">
            {(["all", "unread"] as const).map((value) => (
              <button
                key={value}
                role="tab"
                type="button"
                aria-selected={tab === value}
                onClick={() => setTab(value)}
                className={cn(
                  "-mb-px border-b-2 px-2 pb-2.5 text-sm font-medium outline-none transition-colors focus-visible:text-foreground",
                  tab === value
                    ? "border-primary text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {value === "all" ? "Tất cả" : `Chưa đọc${unreadCount > 0 ? ` (${badge})` : ""}`}
              </button>
            ))}
          </div>
          <div className="scrollbar-thin max-h-[min(480px,65vh)] overflow-y-auto p-2">
            <NotificationList
              query={listQuery}
              canModerate={canModerate}
              emptyText={tab === "unread" ? "Bạn đã đọc hết thông báo" : "Chưa có thông báo nào"}
              onOpen={(n) => openNotification(n, () => setOpen(false))}
              onReject={(n) => {
                setOpen(false);
                setRejecting(n);
              }}
            />
          </div>
          <Link
            href="/notifications"
            onClick={() => setOpen(false)}
            className="flex items-center justify-center gap-1.5 border-t border-border py-3 text-sm font-medium text-primary outline-none transition-colors hover:bg-muted/50 focus-visible:bg-muted/50"
          >
            Xem tất cả thông báo
            <ArrowRight className="size-4" />
          </Link>
        </PopoverContent>
      </Popover>
      <RejectBookingDialog notification={rejecting} onClose={() => setRejecting(null)} />
    </>
  );
}
