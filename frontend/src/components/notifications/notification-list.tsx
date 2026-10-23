"use client";

import type { UseQueryResult } from "@tanstack/react-query";
import { BellOff, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { groupByDay } from "@/lib/notification-kinds";
import type { AppNotification, PaginatedNotifications } from "@/lib/notifications-api";
import { NotificationItem } from "./notification-item";

export function NotificationSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-4 p-3" aria-label="Đang tải thông báo">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex gap-3">
          <Skeleton className="size-11 shrink-0 rounded-xl" />
          <div className="flex flex-1 flex-col gap-2 pt-1">
            <Skeleton className="h-3.5 w-2/5" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-1/4" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function NotificationEmpty({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-muted/60 text-muted-foreground">
        <BellOff className="size-6" aria-hidden />
      </span>
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

export function NotificationError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <WifiOff className="size-7 text-destructive" aria-hidden />
      <p className="text-sm text-muted-foreground">Không tải được thông báo.</p>
      <Button size="sm" variant="outline" onClick={onRetry}>
        Thử lại
      </Button>
    </div>
  );
}

/** Danh sách đã nhóm Hôm nay / Hôm qua / Trước đó — dùng chung popover và trang /notifications. */
export function GroupedNotifications({
  items,
  canModerate,
  onOpen,
  onReject,
  onDelete,
  deletingId,
}: {
  items: AppNotification[];
  canModerate: boolean;
  onOpen: (n: AppNotification) => void;
  onReject: (n: AppNotification) => void;
  onDelete?: (n: AppNotification) => void;
  deletingId?: string | null;
}) {
  return (
    <div className="flex flex-col gap-3">
      {groupByDay(items).map((group) => (
        <section key={group.label} aria-label={group.label}>
          <h3 className="px-3 pt-1 pb-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            {group.label}
          </h3>
          <div className="flex flex-col gap-1">
            {group.items.map((notification) => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                canModerate={canModerate}
                onOpen={onOpen}
                onReject={onReject}
                onDelete={onDelete}
                deleting={deletingId === notification.id}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export function NotificationList({
  query,
  canModerate,
  emptyText,
  onOpen,
  onReject,
}: {
  query: UseQueryResult<PaginatedNotifications>;
  canModerate: boolean;
  emptyText: string;
  onOpen: (n: AppNotification) => void;
  onReject: (n: AppNotification) => void;
}) {
  if (query.isPending) return <NotificationSkeleton />;
  if (query.isError) return <NotificationError onRetry={() => void query.refetch()} />;
  if (query.data.data.length === 0) return <NotificationEmpty text={emptyText} />;
  return (
    <GroupedNotifications
      items={query.data.data}
      canModerate={canModerate}
      onOpen={onOpen}
      onReject={onReject}
    />
  );
}
