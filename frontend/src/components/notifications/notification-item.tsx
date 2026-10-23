"use client";

import Image from "next/image";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { confirmBooking } from "@/lib/bookings-api";
import { BOOKING_STATUS_LABEL } from "@/lib/booking-format";
import { getErrorMessage } from "@/lib/get-error-message";
import {
  formatFullDateTime,
  formatRelativeTime,
  notificationKind,
} from "@/lib/notification-kinds";
import type { AppNotification, NotificationBookingState } from "@/lib/notifications-api";

/** Ô biểu tượng: ảnh thiết bị (nếu có) kèm huy hiệu loại, hoặc icon theo loại. */
function NotificationThumb({ notification }: { notification: AppNotification }) {
  const kind = notificationKind(notification.type);
  const Icon = kind.icon;
  const image = notification.metadata?.deviceImage;
  if (image) {
    return (
      <span className="relative size-11 shrink-0">
        <Image
          src={image}
          alt=""
          width={44}
          height={44}
          className="size-11 rounded-xl border border-border object-cover"
        />
        <span
          className={cn(
            "absolute -right-1 -bottom-1 flex size-5 items-center justify-center rounded-full ring-2 ring-popover",
            kind.tone,
          )}
        >
          <Icon className="size-3" aria-hidden />
        </span>
      </span>
    );
  }
  return (
    <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl", kind.tone)}>
      <Icon className="size-5" aria-hidden />
    </span>
  );
}

/** Mô tả trạng thái thật của đơn sau khi đã có người xử lý. */
function handledText(state: NotificationBookingState): string {
  if (state.status === "cancelled") {
    if (!state.cancelledByName) return "Đơn đã tự huỷ (quá hạn thanh toán)";
    return `Đã từ chối/huỷ bởi ${state.cancelledByName}${state.cancellationReason ? ` — ${state.cancellationReason}` : ""}`;
  }
  const by = state.confirmedByName ? `bởi ${state.confirmedByName}` : "qua thanh toán VNPay";
  return `Đã xác nhận ${by}`;
}

/**
 * Nút Xác nhận/Từ chối cho đơn chờ xác nhận (chỉ staff/admin). Nếu đơn đã được
 * xử lý ở nơi khác thì hiện trạng thái thật thay vì nút. Gọi đúng API có sẵn —
 * phân quyền vẫn do backend kiểm tra (@Roles ở PATCH /bookings/:id/confirm).
 */
function PendingBookingActions({
  notification,
  onReject,
}: {
  notification: AppNotification;
  onReject: (notification: AppNotification) => void;
}) {
  const queryClient = useQueryClient();
  const state = notification.bookingState;
  const bookingId = notification.metadata.bookingId;

  const confirmMutation = useMutation({
    mutationFn: () => confirmBooking(bookingId!),
    onSuccess: () => {
      toast.success(`Đã xác nhận đơn ${notification.metadata.bookingCode ?? ""}`);
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
    },
    onError: (error) => {
      toast.error(getErrorMessage(error));
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  if (!bookingId || !state) return null;
  if (state.status !== "pending") {
    const status = BOOKING_STATUS_LABEL[state.status];
    return (
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
        <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", status.className)}>
          {status.label}
        </span>
        <span className="min-w-0">{handledText(state)}</span>
      </div>
    );
  }
  return (
    <div className="mt-2.5 flex gap-2">
      <Button
        size="sm"
        className="h-8 px-3 text-[13px]"
        disabled={confirmMutation.isPending}
        onClick={() => confirmMutation.mutate()}
      >
        {confirmMutation.isPending ? <Loader2 className="animate-spin" /> : <Check />}
        Xác nhận
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="h-8 px-3 text-[13px] text-red-300 hover:text-red-200"
        disabled={confirmMutation.isPending}
        onClick={() => onReject(notification)}
      >
        <X />
        Từ chối
      </Button>
    </div>
  );
}

export function NotificationItem({
  notification,
  canModerate,
  onOpen,
  onReject,
  onDelete,
  deleting,
}: {
  notification: AppNotification;
  /** Người xem là staff/admin — hiện nút xử lý đơn chờ xác nhận. */
  canModerate: boolean;
  onOpen: (notification: AppNotification) => void;
  onReject: (notification: AppNotification) => void;
  onDelete?: (notification: AppNotification) => void;
  deleting?: boolean;
}) {
  const kind = notificationKind(notification.type);
  const title = notification.title ?? kind.label;
  return (
    <div
      className={cn(
        "group relative rounded-xl transition-colors hover:bg-muted/50 focus-within:bg-muted/50",
        !notification.isRead && "bg-primary/[0.04]",
      )}
    >
      <button
        type="button"
        onClick={() => onOpen(notification)}
        className="flex w-full items-start gap-3 rounded-xl px-3 pt-3 pb-1 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <NotificationThumb notification={notification} />
        <span className="min-w-0 flex-1 pr-6">
          <span className="flex items-center gap-2">
            <span className={cn("truncate text-sm", notification.isRead ? "font-medium text-foreground/85" : "font-semibold text-foreground")}>
              {title}
            </span>
          </span>
          <span className="mt-0.5 line-clamp-2 text-[13.5px] leading-snug text-muted-foreground">
            {notification.message}
          </span>
          <time
            dateTime={notification.createdAt}
            title={formatFullDateTime(notification.createdAt)}
            className="mt-1 block text-xs text-muted-foreground/80"
          >
            {formatRelativeTime(notification.createdAt)}
          </time>
        </span>
      </button>
      {!notification.isRead && (
        <span
          aria-label="Chưa đọc"
          className="pointer-events-none absolute top-4 right-3 size-2.5 rounded-full bg-primary shadow-[0_0_8px] shadow-primary/60"
        />
      )}
      <div className="pr-3 pb-3 pl-[4.25rem]">
        {canModerate && notification.type === "booking_pending" && (
          <PendingBookingActions notification={notification} onReject={onReject} />
        )}
      </div>
      {onDelete && (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Xoá thông báo"
          disabled={deleting}
          onClick={() => onDelete(notification)}
          className="absolute right-2 bottom-2 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 hover:text-red-300"
        >
          <Trash2 />
        </Button>
      )}
    </div>
  );
}
