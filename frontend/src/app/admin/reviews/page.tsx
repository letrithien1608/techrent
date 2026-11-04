"use client";

import { cn } from "cn";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BadgeCheck,
  Eye,
  EyeOff,
  Loader2,
  MessageSquareText,
  Package,
  RotateCcw,
  Search,
  WifiOff,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { FormErrorBanner } from "@/components/form-error-banner";
import { StarRating } from "@/components/devices/star-rating";
import { ModeratorDeleteReviewDialog } from "@/components/reviews/moderator-delete-review-dialog";
import {
  fetchAdminReviews,
  restoreReview,
  setReviewVisibility,
  type AdminReview,
  type AdminReviewStatus,
} from "@/lib/reviews-api";
import { useAuthStore } from "@/stores/auth-store";
import { formatDateTimeVi } from "@/lib/device-format";
import { getErrorMessage } from "@/lib/get-error-message";

const PAGE_SIZE = 10;

const RATING_FILTERS = [
  { value: "all", label: "Mọi số sao" },
  ...[5, 4, 3, 2, 1].map((star) => ({ value: String(star), label: `${star} sao` })),
];

const STATUS_TABS: { value: "all" | AdminReviewStatus; label: string }[] = [
  { value: "all", label: "Tất cả" },
  { value: "visible", label: "Đang hiển thị" },
  { value: "hidden", label: "Đã ẩn" },
  { value: "deleted", label: "Đã xoá" },
];

/** Ẩn đánh giá: bắt buộc lý do (backend cũng bắt buộc). Không có chức năng sửa nội dung. */
function HideReviewDialog({ review, onDone }: { review: AdminReview; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => setReviewVisibility(review.id, { hidden: true, reason: reason.trim() }),
    onSuccess: () => {
      toast.success("Đã ẩn đánh giá");
      setOpen(false);
      onDone();
    },
    onError: (submitError) => setError(getErrorMessage(submitError, "Không thể ẩn đánh giá")),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setReason("");
          setError(null);
        }
      }}
    >
      <Tooltip>
        <TooltipTrigger render={<span className="inline-flex" />}>
          <DialogTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Ẩn đánh giá" />}>
            <EyeOff className="size-4" />
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent>Ẩn đánh giá</TooltipContent>
      </Tooltip>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ẩn đánh giá</DialogTitle>
          <DialogDescription>
            Đánh giá sẽ không hiện ở trang công khai và không tính vào điểm của thiết bị. Nội dung
            được giữ nguyên, có thể hiện lại sau.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-sm">
          <div className="flex items-center gap-2">
            <StarRating rating={review.rating} size={12} />
            <span className="text-xs text-muted-foreground">{review.user.name}</span>
          </div>
          <p className="mt-1.5 whitespace-pre-line break-words text-muted-foreground">
            {review.comment}
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="hide-reason">Lý do ẩn</Label>
          <Textarea
            id="hide-reason"
            rows={3}
            maxLength={500}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="VD: Ngôn từ xúc phạm, nội dung không liên quan đến thiết bị..."
          />
        </div>
        {error && <FormErrorBanner message={error} />}
        <DialogFooter>
          <Button
            variant="destructive"
            disabled={mutation.isPending}
            onClick={() => {
              if (!reason.trim()) {
                setError("Vui lòng nhập lý do ẩn đánh giá");
                return;
              }
              mutation.mutate();
            }}
          >
            {mutation.isPending && <Loader2 className="animate-spin" />}
            Ẩn đánh giá
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminReviewsPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [rating, setRating] = useState("all");
  const [status, setStatus] = useState<"all" | AdminReviewStatus>("all");
  const isAdmin = useAuthStore((state) => state.user?.role) === "admin";

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const reviewsQuery = useQuery({
    queryKey: ["admin", "reviews", page, search, rating, status],
    queryFn: () =>
      fetchAdminReviews({
        page,
        limit: PAGE_SIZE,
        search: search || undefined,
        rating: rating === "all" ? undefined : Number(rating),
        status: status === "all" ? undefined : status,
      }),
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin", "reviews"] });

  const showMutation = useMutation({
    mutationFn: (id: string) => setReviewVisibility(id, { hidden: false }),
    onSuccess: () => {
      toast.success("Đã hiện lại đánh giá");
      refresh();
    },
    onError: (error) => toast.error(getErrorMessage(error, "Không thể hiện lại đánh giá")),
  });

  const restoreMutation = useMutation({
    mutationFn: (id: string) => restoreReview(id),
    onSuccess: () => {
      toast.success("Đã khôi phục đánh giá");
      refresh();
    },
    onError: (error) => toast.error(getErrorMessage(error, "Không thể khôi phục đánh giá")),
  });

  const reviews = reviewsQuery.data?.data ?? [];
  const meta = reviewsQuery.data?.meta;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Trạng thái đánh giá">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={status === tab.value}
            onClick={() => {
              setStatus(tab.value);
              setPage(1);
            }}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
              status === tab.value
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border/60 text-muted-foreground hover:border-primary/50 hover:text-foreground",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/50">
        <div className="flex flex-wrap items-center gap-3 border-b border-border/60 p-4">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Tìm theo thiết bị, tên khách, nội dung..."
              className="pl-9"
              aria-label="Tìm đánh giá"
            />
          </div>
          <Select
            value={rating}
            onValueChange={(value) => {
              setRating(value ?? "all");
              setPage(1);
            }}
          >
            <SelectTrigger className="w-36" aria-label="Lọc theo số sao">
              <SelectValue>
                {(value: string) => RATING_FILTERS.find((item) => item.value === value)?.label}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {RATING_FILTERS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {reviewsQuery.isPending ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        ) : reviewsQuery.isError ? (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <WifiOff className="size-10 text-muted-foreground/50" />
            <p className="text-muted-foreground">Không thể tải danh sách đánh giá.</p>
            <Button onClick={() => reviewsQuery.refetch()}>Thử lại</Button>
          </div>
        ) : reviews.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <MessageSquareText className="size-10 text-muted-foreground/40" />
            <p className="text-muted-foreground">Không có đánh giá nào khớp bộ lọc.</p>
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Thiết bị</TableHead>
                  <TableHead>Khách</TableHead>
                  <TableHead>Đánh giá</TableHead>
                  <TableHead>Ngày</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  <TableHead className="text-right">Hành động</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reviews.map((review) => {
                  const image = review.device.images[0];
                  const showingThis = showMutation.isPending && showMutation.variables === review.id;
                  const restoringThis =
                    restoreMutation.isPending && restoreMutation.variables === review.id;
                  const deleted = !!review.deletedAt;
                  return (
                    <TableRow
                      key={review.id}
                      className={cn((review.isHidden || deleted) && "opacity-70")}
                    >
                      <TableCell className="max-w-[200px]">
                        <Link
                          href={`/devices/${review.device.id}`}
                          target="_blank"
                          className="flex items-center gap-2 hover:text-primary"
                        >
                          <span className="relative size-9 shrink-0 overflow-hidden rounded-lg bg-muted">
                            {image ? (
                              <Image src={image} alt="" fill sizes="36px" className="object-cover" />
                            ) : (
                              <Package className="size-9 p-2 text-muted-foreground" />
                            )}
                          </span>
                          <span className="truncate font-medium">{review.device.name}</span>
                        </Link>
                      </TableCell>
                      <TableCell className="max-w-[160px]">
                        <p className="truncate text-sm">{review.user.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{review.user.email}</p>
                        {review.verifiedRental && (
                          <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-emerald-500">
                            <BadgeCheck className="size-3" />
                            Đã thuê
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[320px]">
                        <StarRating rating={review.rating} size={12} />
                        <p
                          className="mt-1 line-clamp-2 text-sm whitespace-normal text-muted-foreground"
                          title={review.comment ?? undefined}
                        >
                          {review.comment}
                        </p>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDateTimeVi(review.createdAt)}
                        {review.editedAt && <span className="block">đã chỉnh sửa</span>}
                      </TableCell>
                      <TableCell className="max-w-[200px]">
                        {deleted ? (
                          <>
                            <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-xs font-medium text-destructive">
                              Đã xoá
                            </span>
                            <p className="mt-1 line-clamp-2 text-xs whitespace-normal text-muted-foreground">
                              {review.deleteReason}
                            </p>
                            <p className="mt-0.5 text-[11px] whitespace-normal text-muted-foreground/80">
                              {review.deletedBy?.name ?? "—"} · {formatDateTimeVi(review.deletedAt!)}
                            </p>
                          </>
                        ) : review.isHidden ? (
                          <>
                            <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-xs font-medium text-destructive">
                              Đã ẩn
                            </span>
                            {review.hiddenReason && (
                              <p className="mt-1 line-clamp-2 text-xs whitespace-normal text-muted-foreground">
                                {review.hiddenReason}
                              </p>
                            )}
                          </>
                        ) : (
                          <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-400">
                            Hiển thị
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end">
                          {deleted ? (
                            isAdmin ? (
                              <Tooltip>
                                <TooltipTrigger render={<span className="inline-flex" />}>
                                  <Button
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label="Khôi phục đánh giá"
                                    disabled={restoringThis}
                                    onClick={() => restoreMutation.mutate(review.id)}
                                  >
                                    {restoringThis ? (
                                      <Loader2 className="size-4 animate-spin" />
                                    ) : (
                                      <RotateCcw className="size-4" />
                                    )}
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Khôi phục</TooltipContent>
                              </Tooltip>
                            ) : (
                              <span className="text-xs text-muted-foreground">Chỉ quản trị viên khôi phục</span>
                            )
                          ) : review.isHidden ? (
                            <Tooltip>
                              <TooltipTrigger render={<span className="inline-flex" />}>
                                <Button
                                  variant="ghost"
                                  size="icon-sm"
                                  aria-label="Hiện lại đánh giá"
                                  disabled={showingThis}
                                  onClick={() => showMutation.mutate(review.id)}
                                >
                                  {showingThis ? (
                                    <Loader2 className="size-4 animate-spin" />
                                  ) : (
                                    <Eye className="size-4" />
                                  )}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Hiện lại</TooltipContent>
                            </Tooltip>
                          ) : (
                            <HideReviewDialog review={review} onDone={refresh} />
                          )}
                          {!deleted && (
                            <ModeratorDeleteReviewDialog
                              review={review}
                              authorName={review.user.name}
                              onDeleted={refresh}
                            />
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <AdminPagination page={page} totalPages={meta?.totalPages ?? 1} onPageChange={setPage} />
          </>
        )}
      </div>
    </div>
  );
}
