"use client";

import { UserAvatar } from "@/components/account/user-avatar";
import { cn } from "cn";
import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { BadgeCheck, ChevronLeft, ChevronRight, MessageSquare, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StarRating } from "@/components/devices/star-rating";
import { MyReviewPanel } from "@/components/reviews/my-review-panel";
import {
  fetchReviews,
  fetchReviewSummary,
  type PaginatedReviews,
  type Review,
  type ReviewSort,
  type ReviewSummary,
} from "@/lib/devices-api";

const PAGE_SIZE = 5;

const SORT_LABEL: Record<ReviewSort, string> = {
  newest: "Mới nhất",
  highest: "Điểm cao nhất",
  lowest: "Điểm thấp nhất",
};

function formatReviewDate(value: string): string {
  return new Date(value).toLocaleDateString("vi-VN", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
  });
}

function ReviewItem({ review }: { review: Review }) {
  return (
    <div className="-mx-3 flex items-start gap-3 rounded-xl px-3 py-5 transition-colors first:pt-3 hover:bg-muted/30">
      <UserAvatar name={review.reviewerName} src={review.reviewerAvatarUrl} size="lg" className="size-10 text-sm ring-0" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="font-medium">{review.reviewerName}</p>
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-500">
              <BadgeCheck className="size-3" />
              Đã thuê thiết bị này
            </span>
          </div>
          <span className="text-xs text-muted-foreground">
            {formatReviewDate(review.createdAt)}
            {review.editedAt ? " · đã chỉnh sửa" : ""}
          </span>
        </div>
        <div className="mt-1">
          <StarRating rating={review.rating} size={14} />
        </div>
        {review.comment && (
          <p className="mt-2 whitespace-pre-line break-words text-sm text-muted-foreground">
            {review.comment}
          </p>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ summary }: { summary: ReviewSummary }) {
  const avg = summary.avgRating ?? 0;
  return (
    <div className="flex flex-col gap-8 rounded-2xl border border-border/60 bg-card/40 p-6 sm:flex-row sm:items-center">
      <div className="shrink-0 text-center sm:w-40 sm:border-r sm:border-border/60 sm:pr-6">
        <p className="bg-gradient-to-r from-primary to-cyan-300 bg-clip-text font-heading text-5xl font-bold tracking-tight text-transparent">
          {avg.toFixed(1)}
        </p>
        <div className="mt-2 flex justify-center">
          <StarRating rating={avg} size={18} />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{summary.reviewCount} đánh giá</p>
      </div>
      <div className="flex-1 space-y-1.5">
        {([5, 4, 3, 2, 1] as const).map((star) => {
          const count = summary.distribution[star];
          return (
            <div key={star} className="flex items-center gap-2 text-sm">
              <span className="w-10 shrink-0 text-muted-foreground">{star} sao</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-primary to-cyan-300 transition-all duration-500"
                  style={{
                    width: `${summary.reviewCount ? (count / summary.reviewCount) * 100 : 0}%`,
                  }}
                />
              </div>
              <span className="w-6 shrink-0 text-right text-xs text-muted-foreground">{count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function DeviceReviews({
  deviceId,
  deviceName,
  initialSummary,
  initialReviews,
}: {
  deviceId: string;
  deviceName: string;
  initialSummary: ReviewSummary | null;
  initialReviews: PaginatedReviews | null;
}) {
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<ReviewSort>("newest");
  const [rating, setRating] = useState<number | null>(null);
  const isDefaultView = page === 1 && sort === "newest" && rating === null;

  const summaryQuery = useQuery({
    queryKey: ["review-summary", deviceId],
    queryFn: () => fetchReviewSummary(deviceId),
    initialData: initialSummary ?? undefined,
  });
  const listQuery = useQuery({
    queryKey: ["reviews", deviceId, { page, sort, rating }],
    queryFn: () =>
      fetchReviews(deviceId, { page, limit: PAGE_SIZE, sort, rating: rating ?? undefined }),
    initialData: isDefaultView ? (initialReviews ?? undefined) : undefined,
    placeholderData: keepPreviousData,
  });

  const summary = summaryQuery.data;
  const hasAnyReview = (summary?.reviewCount ?? 0) > 0;
  const list = listQuery.data;

  function changeFilter(next: number | null) {
    setRating(next);
    setPage(1);
  }

  return (
    <motion.section
      id="reviews"
      className="scroll-mt-24"
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.5 }}
    >
      <h2 className="font-heading text-2xl font-semibold tracking-tight">Đánh giá từ khách hàng</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Chỉ khách đã thuê và trả thiết bị mới có thể đánh giá.
      </p>

      <div className="mt-6">
        <MyReviewPanel
          deviceId={deviceId}
          deviceName={deviceName}
          loginRedirect={`/devices/${deviceId}#reviews`}
        />
      </div>

      {summaryQuery.isPending ? (
        <Skeleton className="mt-6 h-40 w-full rounded-2xl" />
      ) : summaryQuery.isError && !summary ? (
        <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border/60 py-12 text-center">
          <WifiOff className="size-8 text-muted-foreground/50" />
          <p className="text-muted-foreground">Không tải được đánh giá</p>
          <Button variant="outline" size="sm" onClick={() => summaryQuery.refetch()}>
            Thử lại
          </Button>
        </div>
      ) : !hasAnyReview ? (
        <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border/60 py-16 text-center">
          <MessageSquare className="size-10 text-muted-foreground/40" />
          <p className="text-muted-foreground">Chưa có đánh giá nào cho thiết bị này</p>
        </div>
      ) : (
        <>
          <div className="mt-6">{summary && <SummaryCard summary={summary} />}</div>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Lọc theo số sao">
              {[null, 5, 4, 3, 2, 1].map((value) => {
                const active = rating === value;
                const count = value === null ? summary!.reviewCount : summary!.distribution[value as 1];
                return (
                  <button
                    key={value ?? "all"}
                    type="button"
                    aria-pressed={active}
                    onClick={() => changeFilter(value)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-sm transition-colors",
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border/60 text-muted-foreground hover:border-primary/50 hover:text-foreground",
                    )}
                  >
                    {value === null ? "Tất cả" : `${value} sao`} ({count})
                  </button>
                );
              })}
            </div>
            <Select
              value={sort}
              onValueChange={(value) => {
                setSort((value as ReviewSort) ?? "newest");
                setPage(1);
              }}
            >
              <SelectTrigger className="w-[170px]" aria-label="Sắp xếp đánh giá">
                <SelectValue>{(value: ReviewSort) => SORT_LABEL[value]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(SORT_LABEL) as ReviewSort[]).map((key) => (
                  <SelectItem key={key} value={key}>
                    {SORT_LABEL[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className={cn("mt-4", listQuery.isFetching && "opacity-60 transition-opacity")}>
            {listQuery.isPending ? (
              <div className="space-y-4 py-3">
                {Array.from({ length: 3 }).map((_, index) => (
                  <Skeleton key={index} className="h-20 w-full rounded-xl" />
                ))}
              </div>
            ) : listQuery.isError || !list ? (
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <p className="text-muted-foreground">Không tải được danh sách đánh giá</p>
                <Button variant="outline" size="sm" onClick={() => listQuery.refetch()}>
                  Thử lại
                </Button>
              </div>
            ) : list.data.length === 0 ? (
              <p className="py-10 text-center text-muted-foreground">
                Chưa có đánh giá {rating} sao nào.
              </p>
            ) : (
              <div className="divide-y divide-border/60">
                {list.data.map((review) => (
                  <ReviewItem key={review.id} review={review} />
                ))}
              </div>
            )}
          </div>

          {list && list.meta.totalPages > 1 && (
            <div className="mt-4 flex items-center justify-center gap-3">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((current) => current - 1)}
              >
                <ChevronLeft />
                Trước
              </Button>
              <span className="text-sm text-muted-foreground">
                Trang {list.meta.page}/{list.meta.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= list.meta.totalPages}
                onClick={() => setPage((current) => current + 1)}
              >
                Sau
                <ChevronRight />
              </Button>
            </div>
          )}
        </>
      )}
    </motion.section>
  );
}
