"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck, Ban, EyeOff, LogIn, ShieldAlert, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmDeleteDialog } from "@/components/admin/confirm-delete-dialog";
import { UserAvatar } from "@/components/account/user-avatar";
import { StarRating } from "@/components/devices/star-rating";
import { EditReviewDialog, ReviewForm } from "@/components/reviews/review-form-dialog";
import { deleteReview, fetchMyReview } from "@/lib/reviews-api";
import { useAuthStore } from "@/stores/auth-store";
import Link from "next/link";

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("vi-VN");
}

function Notice({ icon: Icon, children }: { icon: typeof Ban; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-border/60 bg-muted/30 p-4 text-sm text-muted-foreground">
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

/**
 * Khối "đánh giá của bạn" ở trang chi tiết thiết bị: nút đăng nhập / form viết
 * mới / đánh giá của mình kèm Sửa–Xoá. Quyền do backend quyết định
 * (GET /devices/:id/reviews/me); nhân viên/quản trị viên không thấy khối này.
 */
export function MyReviewPanel({
  deviceId,
  deviceName,
  loginRedirect,
}: {
  deviceId: string;
  deviceName: string;
  loginRedirect: string;
}) {
  const queryClient = useQueryClient();
  const { user, hasHydrated } = useAuthStore();
  const isCustomer = user?.role === "customer";
  const query = useQuery({
    queryKey: ["my-review", deviceId],
    queryFn: () => fetchMyReview(deviceId),
    enabled: hasHydrated && isCustomer,
  });

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["my-review", deviceId] });
    queryClient.invalidateQueries({ queryKey: ["reviews", deviceId] });
    queryClient.invalidateQueries({ queryKey: ["review-summary", deviceId] });
  }

  if (!hasHydrated) return null;
  if (!user) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-border/60 p-4">
        <p className="text-sm text-muted-foreground">Bạn đã dùng thiết bị này? Chia sẻ nhận xét của bạn.</p>
        <Button
          variant="outline"
          size="sm"
          nativeButton={false}
          render={<Link href={`/login?redirect=${encodeURIComponent(loginRedirect)}`} />}
        >
          <LogIn className="size-4" />
          Đăng nhập để đánh giá
        </Button>
      </div>
    );
  }
  if (!isCustomer) return null;
  if (query.isPending) return <Skeleton className="h-40 w-full rounded-xl" />;
  if (query.isError) return null;

  const { canCreate, reason, review } = query.data;

  if (reason === "blacklisted") {
    return <Notice icon={Ban}>Tài khoản của bạn đang bị hạn chế nên không thể đánh giá.</Notice>;
  }
  if (reason === "removed_by_moderator") {
    return (
      <Notice icon={ShieldAlert}>
        Đánh giá trước của bạn cho thiết bị này đã bị quản trị viên xoá
        {review?.deleteReason ? (
          <>
            {" "}
            (lý do: <span className="font-medium text-foreground">{review.deleteReason}</span>)
          </>
        ) : null}
        , nên bạn không thể đánh giá lại.
      </Notice>
    );
  }

  if (canCreate) {
    return (
      <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 sm:p-5">
        <p className="font-medium">Viết đánh giá</p>
        <p className="mb-4 text-xs text-muted-foreground">
          Mỗi tài khoản viết 1 đánh giá cho mỗi thiết bị, sửa lại được sau.
        </p>
        <ReviewForm deviceId={deviceId} onSaved={refresh} />
      </div>
    );
  }

  if (!review) return null;
  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
      <div className="flex items-start gap-3">
        <UserAvatar name={user.name} src={user.avatarUrl} size="lg" className="size-10 text-sm ring-0" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium">Đánh giá của bạn</p>
              {review.verifiedRental && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-500">
                  <BadgeCheck className="size-3" />
                  Đã thuê thiết bị này
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <EditReviewDialog
                deviceId={deviceId}
                deviceName={deviceName}
                review={review}
                onSaved={refresh}
              />
              <ConfirmDeleteDialog
                title="Xoá đánh giá của bạn?"
                description="Đánh giá sẽ bị xoá và không còn tính vào điểm của thiết bị. Bạn có thể viết đánh giá mới sau."
                onConfirm={() => deleteReview(review.id)}
                onDeleted={refresh}
                successMessage="Đã xoá đánh giá"
                triggerVariant="outline"
                triggerSize="sm"
              >
                <Trash2 className="size-3.5" />
                Xoá
              </ConfirmDeleteDialog>
            </div>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <StarRating rating={review.rating} size={14} />
            <span className="text-xs text-muted-foreground">
              {formatDate(review.createdAt)}
              {review.editedAt ? " · đã chỉnh sửa" : ""}
            </span>
          </div>
          {review.comment && (
            <p className="mt-2 whitespace-pre-line break-words text-sm text-muted-foreground">
              {review.comment}
            </p>
          )}
          {review.editsLeftToday <= 0 && (
            <p className="mt-2 text-xs text-amber-500">
              Bạn đã dùng hết lượt sửa hôm nay — có thể sửa lại vào ngày mai.
            </p>
          )}
          {review.isHidden && (
            <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-500">
              <EyeOff className="mt-0.5 size-3.5 shrink-0" />
              Đánh giá đang bị ẩn khỏi trang công khai
              {review.hiddenReason ? `: ${review.hiddenReason}` : ""}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
