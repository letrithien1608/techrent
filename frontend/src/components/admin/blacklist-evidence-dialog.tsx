"use client";

import { cn } from "cn";
import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, FileSearch, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { KycImagesViewer } from "@/components/admin/kyc-images-viewer";
import type { AdminUser } from "@/lib/admin-api";
import { fetchBookings } from "@/lib/bookings-api";
import { BOOKING_STATUS_LABEL } from "@/lib/booking-format";
import { formatDateTimeVi } from "@/lib/device-format";
import { getErrorMessage } from "@/lib/get-error-message";

/**
 * Gộp đủ bằng chứng cho 1 user đã bị blacklist — lý do, hồ sơ eKYC (3 ảnh
 * CCCD trước/sau + chân dung, qua signed URL có sẵn từ Phần 1), VÀ danh sách
 * đơn thuê liên quan kèm link mở hợp đồng đã ký (Phần 3) — để admin dùng khi
 * trình báo công an/khởi kiện (mục 7 Roadmap, mở rộng 22/10 buổi 6).
 */
export function BlacklistEvidenceDialog({ user }: { user: AdminUser }) {
  const [open, setOpen] = useState(false);

  const bookingsQuery = useQuery({
    queryKey: ["admin", "blacklist-bookings", user.id],
    queryFn: () => fetchBookings({ userId: user.id, limit: 50 }),
    enabled: open,
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <FileSearch className="size-4" />
        Xem bằng chứng
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Bằng chứng — {user.name}</DialogTitle>
        </DialogHeader>

        <div className="space-y-1 rounded-lg bg-destructive/10 p-3">
          <p className="text-sm font-medium text-destructive">
            Lý do đưa vào danh sách đen
          </p>
          <p className="text-sm text-muted-foreground">
            {user.blacklistReason || "(không có)"}
          </p>
          {user.blacklistedAt && (
            <p className="text-xs text-muted-foreground">
              Vào danh sách đen lúc {formatDateTimeVi(user.blacklistedAt)}
            </p>
          )}
        </div>

        <div>
          <p className="mb-2 text-sm font-medium">Hồ sơ eKYC</p>
          <KycImagesViewer userId={user.id} userName={user.name} />
        </div>

        <div>
          <p className="mb-2 text-sm font-medium">Đơn thuê liên quan</p>

          {bookingsQuery.isPending && (
            <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Đang tải...
            </div>
          )}

          {bookingsQuery.isError && (
            <p className="text-sm text-destructive">
              {getErrorMessage(bookingsQuery.error, "Không thể tải đơn thuê")}
            </p>
          )}

          {bookingsQuery.data && bookingsQuery.data.data.length === 0 && (
            <p className="text-sm text-muted-foreground">Chưa có đơn thuê nào.</p>
          )}

          {bookingsQuery.data && bookingsQuery.data.data.length > 0 && (
            <ul className="space-y-2">
              {bookingsQuery.data.data.map((booking) => {
                const status = BOOKING_STATUS_LABEL[booking.status];
                return (
                  <li
                    key={booking.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-border/60 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {booking.device?.name ?? "Thiết bị"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDateTimeVi(booking.startTime)} → {formatDateTimeVi(booking.endTime)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-xs font-medium",
                          status.className,
                        )}
                      >
                        {status.label}
                      </span>
                      {/* Đơn đã xác nhận trở đi mới có hợp đồng (trang hợp đồng tự
                       * dựng lại bản mới nhất từ dữ liệu đơn). */}
                      {["confirmed", "ongoing", "completed", "lost"].includes(booking.status) && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Xem hợp đồng"
                          render={
                            <Link
                              href={`/admin/bookings/${booking.id}/contract`}
                              target="_blank"
                              rel="noopener noreferrer"
                            />
                          }
                          nativeButton={false}
                        >
                          <ExternalLink className="size-4" />
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
