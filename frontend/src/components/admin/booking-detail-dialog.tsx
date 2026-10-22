"use client";

import { cn } from "cn";
import Link from "next/link";
import { Eye, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { KycImagesViewer } from "@/components/admin/kyc-images-viewer";
import type { Booking } from "@/lib/bookings-api";
import { BOOKING_STATUS_LABEL } from "@/lib/booking-format";
import { formatDateTimeVi, formatVnd } from "@/lib/device-format";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{children}</dd>
    </div>
  );
}

export function BookingDetailDialog({ booking }: { booking: Booking }) {
  const status = BOOKING_STATUS_LABEL[booking.status];

  return (
    <Dialog>
      <DialogTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Xem chi tiết" />}>
        <Eye className="size-4" />
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{booking.device?.name ?? "Chi tiết đơn thuê"}</DialogTitle>
        </DialogHeader>
        <dl className="divide-y divide-border/60">
          <Row label="Mã đơn">
            <span className="font-mono text-xs">{booking.id}</span>
          </Row>
          <Row label="Trạng thái">
            <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", status.className)}>
              {status.label}
            </span>
          </Row>
          <Row label="Bắt đầu">{formatDateTimeVi(booking.startTime)}</Row>
          <Row label="Kết thúc">{formatDateTimeVi(booking.endTime)}</Row>
          <Row label="Tổng tiền">{formatVnd(booking.totalPrice)}</Row>
          <Row label="Tiền cọc">{formatVnd(booking.depositAmount)}</Row>
          {!!Number(booking.lateFeeAmount) && (
            <Row label="Trong đó, phí trễ hạn">
              <span className="text-destructive">
                {formatVnd(booking.lateFeeAmount!)}
              </span>
            </Row>
          )}
          <Row label="Tạo lúc">{formatDateTimeVi(booking.createdAt)}</Row>
        </dl>

        {/* Xem hồ sơ eKYC của khách thuê — xác minh tranh chấp thật (ảnh mờ,
         * sai thông tin...). Không có tên khách sẵn trong `Booking` nên dùng
         * nhãn chung "Khách thuê" — KHÔNG gọi thêm API chỉ để lấy tên. */}
        <div className="flex flex-wrap justify-end gap-2 border-t border-border/60 pt-3">
          <Button
            variant="outline"
            size="sm"
            render={
              <Link
                href={`/admin/bookings/${booking.id}/contract`}
                target="_blank"
                rel="noopener noreferrer"
              />
            }
            nativeButton={false}
          >
            <FileText className="size-4" />
            Xem/In hợp đồng
          </Button>
          <KycImagesViewer userId={booking.userId} userName="Khách thuê" />
        </div>
      </DialogContent>
    </Dialog>
  );
}
