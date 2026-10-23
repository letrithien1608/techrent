"use client";

import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { EyeOff, Info, Trash2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDeleteDialog } from "@/components/admin/confirm-delete-dialog";
import { StarRating } from "@/components/devices/star-rating";
import { ReviewFormDialog } from "@/components/reviews/review-form-dialog";
import { deleteReview, fetchMyReview, INELIGIBLE_MESSAGE } from "@/lib/reviews-api";
import { useAuthStore } from "@/stores/auth-store";

/**
 * Khối "đánh giá của bạn" cho 1 thiết bị — dùng ở trang chi tiết thiết bị và
 * trang Đơn thuê của tôi. Quyền đánh giá do backend quyết định (GET /reviews/me).
 */
export function MyReviewPanel({
  deviceId,
  deviceName,
  loginRedirect,
}: {
  deviceId: string;
  deviceName: string;
  /** Có → hiện lời mời đăng nhập khi chưa đăng nhập (trang chi tiết thiết bị). */
  loginRedirect?: string;
}) {
  const queryClient = useQueryClient();
  const { user, hasHydrated } = useAuthStore();
  const query = useQuery({
    queryKey: ["my-review", deviceId],
    queryFn: () => fetchMyReview(deviceId),
    enabled: hasHydrated && !!user,
  });

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["my-review", deviceId] });
    queryClient.invalidateQueries({ queryKey: ["reviews", deviceId] });
    queryClient.invalidateQueries({ queryKey: ["review-summary", deviceId] });
  }

  if (!hasHydrated) return null;
  if (!user) {
    if (!loginRedirect) return null;
    return (
      <p className="text-sm text-muted-foreground">
        <Link
          href={`/login?redirect=${encodeURIComponent(loginRedirect)}`}
          className="font-medium text-primary hover:underline"
        >
          Đăng nhập
        </Link>{" "}
        để đánh giá nếu bạn đã thuê thiết bị này.
      </p>
    );
  }
  if (query.isPending) return <Skeleton className="h-14 w-full rounded-lg" />;
  if (query.isError) return null;

  const { canReview, reason, review } = query.data;

  if (review) {
    return (
      <div className="rounded-xl border border-border/60 bg-muted/30 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <StarRating rating={review.rating} size={14} />
            <span className="text-xs text-muted-foreground">
              Đánh giá của bạn{review.editedAt ? " · đã chỉnh sửa" : ""}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {canReview && (
              <ReviewFormDialog
                deviceId={deviceId}
                deviceName={deviceName}
                existing={review}
                onSaved={refresh}
              />
            )}
            <ConfirmDeleteDialog
              title="Xoá đánh giá"
              description="Đánh giá của bạn sẽ bị xoá vĩnh viễn và không còn tính vào điểm của thiết bị."
              onConfirm={() => deleteReview(review.id)}
              onDeleted={refresh}
              successMessage="Đã xoá đánh giá"
            >
              <Trash2 />
            </ConfirmDeleteDialog>
          </div>
        </div>
        {review.comment && <p className="mt-2 text-sm text-muted-foreground">{review.comment}</p>}
        {review.isHidden && (
          <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-500">
            <EyeOff className="mt-0.5 size-3.5 shrink-0" />
            Đánh giá đang bị ẩn khỏi trang công khai
            {review.hiddenReason ? `: ${review.hiddenReason}` : ""}
          </p>
        )}
      </div>
    );
  }

  if (!canReview) {
    return (
      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <Info className="size-4 shrink-0" />
        {INELIGIBLE_MESSAGE[reason ?? "not_rented"]}
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-muted-foreground">
        Bạn đã thuê thiết bị này — chia sẻ trải nghiệm để khách khác chọn dễ hơn.
      </p>
      <ReviewFormDialog deviceId={deviceId} deviceName={deviceName} onSaved={refresh} />
    </div>
  );
}
