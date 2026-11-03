"use client";

import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ChevronRight, Loader2, Package, Store } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { BookingCountdown } from "@/components/bookings/booking-countdown";
import { CancelBookingDialog } from "@/components/bookings/cancel-booking-dialog";
import { BookingContractCard } from "@/components/bookings/booking-contract-card";
import { BookingStatusTimeline } from "@/components/bookings/booking-status-timeline";
import { DepositSettlementTable } from "@/components/bookings/deposit-settlement-table";
import { InspectionComparison } from "@/components/bookings/inspection-comparison";
import { IssueEvents } from "@/components/bookings/issue-events";
import { ReportIssueDialog } from "@/components/bookings/report-issue-dialog";
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
      <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-16 sm:px-6">
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
  // Hợp đồng sinh khi đơn được xác nhận — khớp CONTRACT_VISIBLE_STATUSES ở backend.
  const hasContract = ["confirmed", "ongoing", "completed", "lost"].includes(booking.status);

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6 sm:py-16">
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

        <div className="mt-6 border-t border-border/60 pt-5">
          <BookingStatusTimeline booking={booking} />
        </div>

        {!!booking.issueReports?.length && (
          <div className="mt-6 border-t border-border/60 pt-5">
            <h2 className="mb-3 text-sm font-semibold">Báo lỗi &amp; đổi máy</h2>
            <IssueEvents reports={booking.issueReports} />
          </div>
        )}

        {hasContract && (
          <div className="mt-6 border-t border-border/60 pt-5">
            <h2 className="mb-3 text-sm font-semibold">Hợp đồng thuê</h2>
            <BookingContractCard booking={booking} />
          </div>
        )}

        <div className="mt-6 border-t border-border/60 pt-5">
          <h2 className="mb-3 text-sm font-semibold">Tiền thuê &amp; tiền cọc</h2>
          <DepositSettlementTable booking={booking} />
        </div>

        {(booking.status === "ongoing" || booking.status === "completed") && (
          <div className="mt-6 border-t border-border/60 pt-5">
            <h2 className="mb-3 text-sm font-semibold">Biên bản giao / nhận máy</h2>
            <InspectionComparison
              inspections={booking.inspections}
              endedWithoutReturn={!!booking.issueReports?.some((r) => r.resolution === "ended_early")}
            />
          </div>
        )}

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
          <div className="mt-6 flex gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm">
            <Store className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            <p>
              Đơn đã được xác nhận. Vui lòng đến <strong>cửa hàng TechRent</strong> đúng giờ nhận máy, mang theo{" "}
              <strong>CCCD gốc</strong> để đối chiếu, thanh toán <strong>{formatVnd(booking.totalPrice)}</strong>{" "}
              tiền thuê (tiền mặt hoặc chuyển khoản) và ký hợp đồng trực tiếp. TechRent không giao hàng tận nơi.
            </p>
          </div>
        )}
        {booking.status === "ongoing" && (
          <p className="mt-6 border-t border-border/60 pt-6 text-sm text-muted-foreground">
            Bạn đang thuê thiết bị này. Hạn trả: <strong>{formatDateTimeVi(booking.endTime)}</strong> — mang máy
            đến cửa hàng để nhân viên kiểm tra và quyết toán tiền cọc. Trả trễ sẽ bị trừ phí trễ hạn vào cọc.
          </p>
        )}
        {booking.status === "ongoing" && booking.suspectedLostAt && (
          <div role="alert" className="mt-4 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            Đơn đã quá hạn trả lâu. Vui lòng mang máy đến cửa hàng ngay — nếu không, cửa hàng sẽ xác nhận mất
            thiết bị, giữ toàn bộ tiền cọc, ghi nợ phần còn lại và khoá tài khoản đặt thuê.
          </div>
        )}
        {booking.status === "lost" && (
          <p className="mt-6 border-t border-border/60 pt-6 text-sm text-destructive">
            Cửa hàng đã xác nhận thiết bị không được trả. Tiền cọc bị giữ lại và khoản nợ còn lại hiển thị ở bảng
            trên. Vui lòng liên hệ cửa hàng để thanh toán.
          </p>
        )}
        {booking.status === "ongoing" && (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {booking.issueReports?.some((r) => r.status === "open") ? (
              <p className="text-sm text-amber-400">Bạn có 1 báo lỗi đang chờ cửa hàng xử lý.</p>
            ) : (
              <ReportIssueDialog
                bookingId={booking.id}
                onReported={() => queryClient.invalidateQueries({ queryKey: ["booking", params.id] })}
              />
            )}
            <span className="text-xs text-muted-foreground">Máy gặp lỗi khi đang thuê? Báo ngay để được hỗ trợ.</span>
          </div>
        )}
        {booking.status === "completed" && (
          <p className="mt-6 border-t border-border/60 pt-6 text-sm text-muted-foreground">
            Đã trả máy — cảm ơn bạn đã sử dụng dịch vụ của TechRent.
            {booking.depositRefundStatus === "pending" &&
              " Tiền cọc hoàn lại sẽ được chuyển khoản trước hạn ghi ở bảng trên."}
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
