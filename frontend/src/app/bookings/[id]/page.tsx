"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ChevronRight, Loader2, Package } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BookingCountdown } from "@/components/bookings/booking-countdown";
import { CancelBookingDialog } from "@/components/bookings/cancel-booking-dialog";
import { BOOKING_TTL_MINUTES, fetchBookingById } from "@/lib/bookings-api";
import { BOOKING_STATUS_LABEL } from "@/lib/booking-format";
import { formatDateTimeVi, formatVnd } from "@/lib/device-format";
import { getErrorMessage } from "@/lib/get-error-message";
import { createVnpayPaymentUrl } from "@/lib/payments-api";
import { useAuthStore } from "@/stores/auth-store";

export default function BookingDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, hasHydrated } = useAuthStore();

  useEffect(() => {
    if (hasHydrated && !user) {
      router.push(`/login?redirect=${encodeURIComponent(`/bookings/${params.id}`)}`);
    }
  }, [hasHydrated, user, router, params.id]);

  const bookingQuery = useQuery({
    queryKey: ["booking", params.id],
    queryFn: () => fetchBookingById(params.id),
    enabled: hasHydrated && !!user,
    retry: false,
  });

  const payMutation = useMutation({
    mutationFn: () => createVnpayPaymentUrl(params.id),
    onSuccess: ({ paymentUrl }) => {
      window.location.href = paymentUrl;
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "Không thể tạo link thanh toán, vui lòng thử lại"));
    },
  });

  function handleExpire() {
    queryClient.invalidateQueries({ queryKey: ["booking", params.id] });
  }

  if (!hasHydrated || (hasHydrated && !user)) {
    return null;
  }

  if (bookingQuery.isPending) {
    return (
      <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-16 sm:px-6">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="mt-4 h-40 w-full rounded-2xl" />
      </div>
    );
  }

  if (bookingQuery.isError) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-16 text-center">
        <AlertTriangle className="size-12 text-muted-foreground/50" />
        <div>
          <p className="font-heading text-lg font-semibold">
            Không tìm thấy đơn thuê này
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Đơn có thể không tồn tại hoặc bạn không có quyền xem.
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => bookingQuery.refetch()}>
            Thử lại
          </Button>
          <Button nativeButton={false} render={<Link href="/bookings" />}>
            Xem đơn của tôi
          </Button>
        </div>
      </div>
    );
  }

  const booking = bookingQuery.data;
  const status = BOOKING_STATUS_LABEL[booking.status];
  const expiresAt = new Date(
    new Date(booking.createdAt).getTime() + BOOKING_TTL_MINUTES * 60_000,
  );
  const canCancel = booking.status === "pending" || booking.status === "confirmed";

  return (
    <div className="mx-auto w-full max-w-2xl flex-1 px-4 py-10 sm:px-6 sm:py-16">
      <nav className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Link href="/bookings" className="transition-colors hover:text-foreground">
          Đơn của tôi
        </Link>
        <ChevronRight className="size-3.5" />
        <span className="text-foreground">Chi tiết đơn</span>
      </nav>

      <div className="mt-6 rounded-2xl border border-border/60 bg-card/60 p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-muted">
              {booking.device?.images?.[0] ? (
                <Image
                  src={booking.device.images[0]}
                  alt={booking.device.name}
                  fill
                  sizes="64px"
                  className="object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                  <Package className="size-6" />
                </div>
              )}
            </div>
            <div>
              <Link
                href={`/devices/${booking.deviceId}`}
                className="font-heading font-semibold hover:text-primary"
              >
                {booking.device?.name ?? "Thiết bị"}
              </Link>
              <p className="text-sm text-muted-foreground">
                {formatDateTimeVi(booking.startTime)} → {formatDateTimeVi(booking.endTime)}
              </p>
            </div>
          </div>
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${status.className}`}>
            {status.label}
          </span>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 border-t border-border/60 pt-5 text-sm">
          <div>
            <p className="text-muted-foreground">Tổng tiền thuê</p>
            <p className="font-medium">{formatVnd(booking.totalPrice)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Tiền cọc</p>
            <p className="font-medium">{formatVnd(booking.depositAmount)}</p>
          </div>
          {!!Number(booking.lateFeeAmount) && (
            <div className="col-span-2">
              <p className="text-muted-foreground">Phí trễ hạn (đã gồm trong tổng tiền thuê)</p>
              <p className="font-medium text-destructive">
                {formatVnd(booking.lateFeeAmount!)}
              </p>
            </div>
          )}
        </div>

        {booking.status === "pending" && (
          <div className="mt-6 border-t border-border/60 pt-6">
            <BookingCountdown expiresAt={expiresAt} onExpire={handleExpire} />
            <Button
              size="lg"
              className="mt-5 w-full shadow-lg shadow-primary/40 hover:shadow-primary/60"
              disabled={payMutation.isPending}
              onClick={() => payMutation.mutate()}
            >
              {payMutation.isPending && <Loader2 className="animate-spin" />}
              Thanh toán ngay
            </Button>
          </div>
        )}

        {booking.status === "confirmed" && (
          <p className="mt-6 border-t border-border/60 pt-6 text-sm text-muted-foreground">
            Đơn đã được xác nhận — vui lòng đến nhận thiết bị đúng thời gian đã đặt.
          </p>
        )}
        {booking.status === "ongoing" && (
          <p className="mt-6 border-t border-border/60 pt-6 text-sm text-muted-foreground">
            Bạn đang trong thời gian thuê thiết bị này.
          </p>
        )}
        {booking.status === "completed" && (
          <p className="mt-6 border-t border-border/60 pt-6 text-sm text-muted-foreground">
            Đơn đã hoàn tất — cảm ơn bạn đã sử dụng dịch vụ của TechRent.
          </p>
        )}
        {booking.status === "cancelled" && (
          <p className="mt-6 border-t border-border/60 pt-6 text-sm text-muted-foreground">
            Đơn này đã bị huỷ.
          </p>
        )}

        {canCancel && (
          <div className="mt-4">
            <CancelBookingDialog
              booking={booking}
              onCancelled={() =>
                queryClient.invalidateQueries({ queryKey: ["booking", params.id] })
              }
            />
          </div>
        )}
      </div>
    </div>
  );
}
