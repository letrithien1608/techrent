"use client";

import { cn } from "cn";
import { Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
          <Row label="Tạo lúc">{formatDateTimeVi(booking.createdAt)}</Row>
        </dl>
      </DialogContent>
    </Dialog>
  );
}
