"use client";

import { cn } from "cn";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PackageSearch, Package, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CancelBookingDialog } from "@/components/bookings/cancel-booking-dialog";
import { BookingReviewDisplay } from "@/components/reviews/booking-review-display";
import { ReviewBookingDialog } from "@/components/reviews/review-booking-dialog";
import { fetchBookings, type Booking, type BookingStatus } from "@/lib/bookings-api";
import { BOOKING_STATUS_LABEL } from "@/lib/booking-format";
import { formatDateTimeVi, formatVnd } from "@/lib/device-format";
import { fetchReviewByBookingId } from "@/lib/reviews-api";
import { useAuthStore } from "@/stores/auth-store";

const FILTERS: { value: BookingStatus | "all"; label: string }[] = [
  { value: "all", label: "Tất cả" },
  { value: "pending", label: "Chờ thanh toán" },
  { value: "confirmed", label: "Đã xác nhận" },
  { value: "ongoing", label: "Đang thuê" },
  { value: "completed", label: "Hoàn tất" },
  { value: "cancelled", label: "Đã huỷ" },
];

function BookingCard({ booking, onChanged }: { booking: Booking; onChanged: () => void }) {
  const status = BOOKING_STATUS_LABEL[booking.status];
  const canCancel = booking.status === "pending" || booking.status === "confirmed";
  const isCompleted = booking.status === "completed";
  const image = booking.device?.images?.[0];

  const reviewQuery = useQuery({
    queryKey: ["review", booking.id],
    queryFn: () => fetchReviewByBookingId(booking.id),
    enabled: isCompleted,
  });

  return (
    <div className="rounded-2xl border border-border/60 bg-card/50 p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <Link
          href={`/bookings/${booking.id}`}
          className="flex flex-1 items-center gap-4"
        >
          <div className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-muted">
            {image ? (
              <Image src={image} alt={booking.device?.name ?? ""} fill sizes="64px" className="object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                <Package className="size-6" />
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-heading font-semibold">
              {booking.device?.name ?? "Thiết bị"}
            </p>
            <p className="truncate text-sm text-muted-foreground">
              {formatDateTimeVi(booking.startTime)} → {formatDateTimeVi(booking.endTime)}
            </p>
            <p className="mt-1 text-sm font-medium">{formatVnd(booking.totalPrice)}</p>
          </div>
        </Link>

        <div className="flex items-center gap-3 sm:flex-col sm:items-end sm:gap-2">
          <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-xs font-medium", status.className)}>
            {status.label}
          </span>
          {canCancel && <CancelBookingDialog booking={booking} onCancelled={onChanged} />}
        </div>
      </div>

      {isCompleted && (
        <div className="mt-4 border-t border-border/60 pt-4">
          {reviewQuery.isPending ? (
            <Skeleton className="h-14 w-full rounded-lg" />
          ) : reviewQuery.data ? (
            <BookingReviewDisplay review={reviewQuery.data} />
          ) : (
            <ReviewBookingDialog
              bookingId={booking.id}
              onSubmitted={() => reviewQuery.refetch()}
            />
          )}
        </div>
      )}
    </div>
  );
}

function BookingListSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="flex items-center gap-4 rounded-2xl border border-border/60 p-4">
          <Skeleton className="size-16 shrink-0 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function BookingsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, hasHydrated } = useAuthStore();
  const [filter, setFilter] = useState<BookingStatus | "all">("all");

  useEffect(() => {
    if (hasHydrated && !user) {
      router.push(`/login?redirect=${encodeURIComponent("/bookings")}`);
    }
  }, [hasHydrated, user, router]);

  const bookingsQuery = useQuery({
    queryKey: ["bookings", filter],
    queryFn: () => fetchBookings({ status: filter === "all" ? undefined : filter, limit: 50 }),
    enabled: hasHydrated && !!user,
  });

  function handleChanged() {
    queryClient.invalidateQueries({ queryKey: ["bookings"] });
  }

  if (!hasHydrated || (hasHydrated && !user)) {
    return null;
  }

  const bookings = bookingsQuery.data?.data ?? [];

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6 sm:py-16">
      <h1 className="font-heading text-3xl font-bold tracking-tight">Đơn của tôi</h1>
      <p className="mt-2 text-muted-foreground">
        Theo dõi và quản lý các đơn thuê thiết bị của bạn.
      </p>

      <div className="mt-6 flex flex-wrap gap-2">
        {FILTERS.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => setFilter(item.value)}
            className={cn(
              "shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
              filter === item.value
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border/60 text-muted-foreground hover:border-primary/40 hover:text-foreground",
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="mt-8">
        {bookingsQuery.isPending ? (
          <BookingListSkeleton />
        ) : bookingsQuery.isError ? (
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border/60 py-16 text-center">
            <WifiOff className="size-12 text-muted-foreground/50" />
            <p className="text-muted-foreground">
              Không thể tải danh sách đơn thuê lúc này.
            </p>
            <Button onClick={() => bookingsQuery.refetch()}>Thử lại</Button>
          </div>
        ) : bookings.length === 0 ? (
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border/60 py-16 text-center">
            <PackageSearch className="size-12 text-muted-foreground/40" />
            <div>
              <p className="font-heading text-lg font-semibold">
                Bạn chưa có đơn thuê nào
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Khám phá danh sách thiết bị và đặt thuê ngay.
              </p>
            </div>
            <Button nativeButton={false} render={<Link href="/devices" />}>
              Khám phá thiết bị
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {bookings.map((booking) => (
              <BookingCard key={booking.id} booking={booking} onChanged={handleChanged} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
