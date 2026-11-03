"use client";

import Image from "next/image";
import Link from "next/link";
import { AlarmClock, ArrowRight, CalendarClock, ChevronRight, LayoutGrid, PackageSearch, WifiOff } from "lucide-react";
import { cn } from "cn";
import { BookingStatusTimeline } from "@/components/bookings/booking-status-timeline";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BOOKING_STATUS_LABEL } from "@/lib/booking-format";
import { formatDateTimeVi, formatVnd } from "@/lib/device-format";
import type { Booking } from "@/lib/bookings-api";
import { SectionCard } from "./profile-shared";
import { summarizeBookings, useMyBookings } from "./use-my-bookings";

const RECENT_COUNT = 5;

function BookingRow({ booking }: { booking: Booking }) {
  const status = BOOKING_STATUS_LABEL[booking.status];
  const image = booking.device?.images[0];
  return (
    <Link
      href={`/bookings/${booking.id}`}
      className="group flex items-center gap-4 rounded-2xl border border-transparent p-3 outline-none transition-colors hover:border-border hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {image ? (
        <Image src={image} alt="" width={56} height={56} className="size-14 shrink-0 rounded-xl border border-border object-cover" />
      ) : (
        <span className="size-14 shrink-0 rounded-xl bg-muted" />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold">{booking.device?.name ?? "Thiết bị"}</p>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          {formatDateTimeVi(booking.startTime)} → {formatDateTimeVi(booking.endTime)}
        </p>
        <span className={cn("mt-1.5 inline-block rounded-full px-2 py-0.5 text-xs font-medium sm:hidden", status.className)}>
          {status.label}
        </span>
      </div>
      <div className="hidden shrink-0 flex-col items-end gap-1 sm:flex">
        <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", status.className)}>{status.label}</span>
        <span className="text-[13px] font-medium">{formatVnd(booking.totalPrice)}</span>
      </div>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
    </Link>
  );
}

export function AccountOverviewSection() {
  const query = useMyBookings(true);
  const bookings = query.data?.data ?? [];
  const { alerts } = summarizeBookings(bookings);
  // Ưu tiên đơn đang thuê, rồi tới đơn đã xác nhận/chờ thanh toán.
  const active =
    bookings.find((b) => b.status === "ongoing") ??
    bookings.find((b) => b.status === "confirmed" || b.status === "pending");

  return (
    <SectionCard
      id="overview"
      icon={LayoutGrid}
      title="Tổng quan tài khoản"
      description="Đơn thuê gần đây và những việc cần chú ý."
      action={
        <Button variant="outline" className="h-10" nativeButton={false} render={<Link href="/bookings" />}>
          Tất cả đơn thuê
          <ArrowRight />
        </Button>
      }
    >
      {query.isPending ? (
        <div className="flex flex-col gap-3" aria-label="Đang tải đơn thuê">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-2xl" />
          ))}
        </div>
      ) : query.isError ? (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <WifiOff className="size-7 text-destructive" aria-hidden />
          <p className="text-sm text-muted-foreground">Không tải được đơn thuê.</p>
          <Button size="sm" variant="outline" onClick={() => void query.refetch()}>
            Thử lại
          </Button>
        </div>
      ) : bookings.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-muted/60 text-muted-foreground">
            <PackageSearch className="size-6" aria-hidden />
          </span>
          <p className="text-[15px]">Bạn chưa có đơn thuê nào.</p>
          <Button nativeButton={false} render={<Link href="/devices" />}>
            Khám phá thiết bị
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {alerts.map(({ booking, kind }) => (
            <Link
              key={booking.id}
              href={`/bookings/${booking.id}`}
              className={cn(
                "flex items-start gap-3 rounded-2xl border px-4 py-3.5 outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/50",
                kind === "overdue"
                  ? "border-red-500/40 bg-red-500/10 hover:bg-red-500/15"
                  : "border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/15",
              )}
            >
              {kind === "overdue" ? (
                <AlarmClock className="mt-0.5 size-5 shrink-0 text-red-300" aria-hidden />
              ) : (
                <CalendarClock className="mt-0.5 size-5 shrink-0 text-amber-300" aria-hidden />
              )}
              <div className="min-w-0 text-sm">
                <p className="font-semibold">
                  {kind === "overdue" ? "Đơn đã quá hạn trả" : "Sắp đến hạn trả máy"}: {booking.device?.name}
                </p>
                <p className="text-muted-foreground">
                  Hạn trả {formatDateTimeVi(booking.endTime)}.{" "}
                  {kind === "overdue"
                    ? "Phí trễ hạn tăng dần theo từng ngày — vui lòng trả máy hoặc liên hệ cửa hàng ngay."
                    : "Vui lòng trả đúng hạn để tránh phí trễ hạn."}
                </p>
              </div>
            </Link>
          ))}

          {active && (
            <div className="rounded-2xl border border-white/10 bg-background/40 p-4 sm:p-5">
              <p className="mb-4 text-sm text-muted-foreground">
                Đơn đang xử lý: <span className="font-medium text-foreground">{active.device?.name}</span>
              </p>
              <BookingStatusTimeline booking={active} />
            </div>
          )}

          <div className="flex flex-col gap-1">
            <h3 className="px-3 pb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Đơn gần đây</h3>
            {bookings.slice(0, RECENT_COUNT).map((booking) => (
              <BookingRow key={booking.id} booking={booking} />
            ))}
          </div>
        </div>
      )}
    </SectionCard>
  );
}
