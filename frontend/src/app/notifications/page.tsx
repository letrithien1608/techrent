"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useInView } from "framer-motion";
import { CheckCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { useOpenNotification } from "@/components/notifications/notification-bell";
import {
  GroupedNotifications,
  NotificationEmpty,
  NotificationError,
  NotificationSkeleton,
} from "@/components/notifications/notification-list";
import { RejectBookingDialog } from "@/components/notifications/reject-booking-dialog";
import { getErrorMessage } from "@/lib/get-error-message";
import {
  NOTIFICATION_CATEGORY_LABEL,
  typesOfCategory,
  type NotificationCategory,
} from "@/lib/notification-kinds";
import {
  deleteNotification,
  fetchNotifications,
  markAllNotificationsAsRead,
  type AppNotification,
} from "@/lib/notifications-api";
import { useAuthStore } from "@/stores/auth-store";

const PAGE_SIZE = 20;
type ReadFilter = "all" | "unread" | "read";
const READ_FILTERS: { value: ReadFilter; label: string }[] = [
  { value: "all", label: "Tất cả" },
  { value: "unread", label: "Chưa đọc" },
  { value: "read", label: "Đã đọc" },
];
// Chỉ hiện nhóm mà backend hiện thật sự sinh thông báo (nhắc hạn/xác thực đã có
// sẵn icon trong NOTIFICATION_KINDS nhưng chưa có sự kiện tạo) — thêm vào đây
// khi backend bắt đầu gửi loại đó. Bảo trì chỉ gửi cho staff/admin.
const CUSTOMER_CATEGORIES: NotificationCategory[] = ["booking", "payment"];
const STAFF_CATEGORIES: NotificationCategory[] = ["booking", "payment", "maintenance"];

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "h-9 rounded-full border px-4 text-sm font-medium outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
        active
          ? "border-primary/60 bg-primary/15 text-primary"
          : "border-border text-foreground/75 hover:border-foreground/30 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

export default function NotificationsPage() {
  const router = useRouter();
  const { user, hasHydrated } = useAuthStore();
  const queryClient = useQueryClient();
  const openNotification = useOpenNotification();
  const [readFilter, setReadFilter] = useState<ReadFilter>("all");
  const [category, setCategory] = useState<NotificationCategory | "all">("all");
  const [rejecting, setRejecting] = useState<AppNotification | null>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const sentinelInView = useInView(sentinelRef, { margin: "300px" });
  const canModerate = user?.role === "admin" || user?.role === "staff";

  useEffect(() => {
    if (hasHydrated && !user) {
      router.push(`/login?redirect=${encodeURIComponent("/notifications")}`);
    }
  }, [hasHydrated, user, router]);

  const filters = useMemo(
    () => ({
      ...(readFilter === "all" ? {} : { isRead: readFilter === "read" }),
      ...(category === "all" ? {} : { types: typesOfCategory(category) }),
    }),
    [readFilter, category],
  );

  const query = useInfiniteQuery({
    queryKey: ["notifications", "page", filters],
    queryFn: ({ pageParam }) => fetchNotifications({ ...filters, page: pageParam, limit: PAGE_SIZE }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.meta.page < last.meta.totalPages ? last.meta.page + 1 : undefined),
    enabled: hasHydrated && !!user,
  });

  const unreadQuery = useQuery({
    queryKey: ["notifications", "unread-count"],
    queryFn: () => fetchNotifications({ isRead: false, limit: 1 }),
    select: (result) => result.meta.total,
    enabled: hasHydrated && !!user,
  });

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;
  useEffect(() => {
    if (sentinelInView && hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [sentinelInView, hasNextPage, isFetchingNextPage, fetchNextPage]);

  const markAll = useMutation({
    mutationFn: markAllNotificationsAsRead,
    onSuccess: ({ count }) => {
      toast.success(count > 0 ? `Đã đánh dấu ${count} thông báo là đã đọc` : "Không còn thông báo chưa đọc");
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  const remove = useMutation({
    mutationFn: (n: AppNotification) => deleteNotification(n.id),
    onSuccess: () => {
      toast.success("Đã xoá thông báo");
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  if (!hasHydrated || !user) return null;

  const items = query.data?.pages.flatMap((page) => page.data) ?? [];
  const total = query.data?.pages[0]?.meta.total ?? 0;
  const unread = unreadQuery.data ?? 0;

  return (
    <div className="mx-auto w-full max-w-4xl flex-1 px-4 py-10 sm:px-6 sm:py-14">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Thông báo</h1>
          <p className="mt-1.5 text-[15px] text-muted-foreground">
            {unread > 0 ? `Bạn có ${unread} thông báo chưa đọc.` : "Bạn đã đọc hết thông báo."}
          </p>
        </div>
        <Button
          variant="outline"
          className="h-10"
          disabled={unread === 0 || markAll.isPending}
          onClick={() => markAll.mutate()}
        >
          {markAll.isPending ? <Loader2 className="animate-spin" /> : <CheckCheck />}
          Đánh dấu tất cả đã đọc
        </Button>
      </div>

      <div className="mt-8 flex flex-col gap-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Lọc theo trạng thái đọc">
          {READ_FILTERS.map((f) => (
            <Chip key={f.value} active={readFilter === f.value} onClick={() => setReadFilter(f.value)}>
              {f.label}
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Lọc theo loại">
          <Chip active={category === "all"} onClick={() => setCategory("all")}>
            Mọi loại
          </Chip>
          {(canModerate ? STAFF_CATEGORIES : CUSTOMER_CATEGORIES).map((c) => (
            <Chip key={c} active={category === c} onClick={() => setCategory(c)}>
              {NOTIFICATION_CATEGORY_LABEL[c]}
            </Chip>
          ))}
        </div>
      </div>

      <div className="mt-6 rounded-3xl border border-white/10 bg-white/[0.03] p-2 backdrop-blur-xl sm:p-3">
        {query.isPending ? (
          <NotificationSkeleton rows={6} />
        ) : query.isError ? (
          <NotificationError onRetry={() => void query.refetch()} />
        ) : items.length === 0 ? (
          <NotificationEmpty text="Không có thông báo nào khớp bộ lọc." />
        ) : (
          <>
            <p className="px-3 pt-2 pb-1 text-[13px] text-muted-foreground">{total} thông báo</p>
            <GroupedNotifications
              items={items}
              canModerate={canModerate}
              onOpen={(n) => openNotification(n)}
              onReject={setRejecting}
              onDelete={(n) => remove.mutate(n)}
              deletingId={remove.isPending ? remove.variables?.id : null}
            />
            <div ref={sentinelRef} className="flex justify-center py-4">
              {isFetchingNextPage && <Loader2 className="size-5 animate-spin text-muted-foreground" />}
              {!hasNextPage && items.length > PAGE_SIZE && (
                <span className="text-[13px] text-muted-foreground">Đã hiển thị tất cả thông báo</span>
              )}
            </div>
          </>
        )}
      </div>
      <RejectBookingDialog notification={rejecting} onClose={() => setRejecting(null)} />
    </div>
  );
}
