"use client";

import { motion } from "framer-motion";
import { MessageSquare } from "lucide-react";
import { StarRating } from "@/components/devices/star-rating";
import type { Review } from "@/lib/devices-api";

function initialsOf(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "?";
}

function formatReviewDate(value: string): string {
  return new Date(value).toLocaleDateString("vi-VN", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
  });
}

export function DeviceReviews({
  reviews,
  avgRating,
  reviewCount,
}: {
  reviews: Review[];
  avgRating: number;
  reviewCount: number;
}) {
  const breakdown = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: reviews.filter((review) => Math.round(review.rating) === star).length,
  }));

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.5 }}
    >
      <h2 className="font-heading text-2xl font-semibold tracking-tight">
        Đánh giá từ khách hàng
      </h2>

      {reviewCount === 0 ? (
        <div className="mt-6 flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border/60 py-16 text-center">
          <MessageSquare className="size-10 text-muted-foreground/40" />
          <p className="text-muted-foreground">
            Chưa có đánh giá nào cho thiết bị này
          </p>
        </div>
      ) : (
        <>
          <div className="mt-6 flex flex-col gap-8 rounded-2xl border border-border/60 bg-card/40 p-6 sm:flex-row sm:items-center">
            <div className="shrink-0 text-center sm:w-40 sm:border-r sm:border-border/60 sm:pr-6">
              <p className="bg-gradient-to-r from-primary to-cyan-300 bg-clip-text font-heading text-5xl font-bold tracking-tight text-transparent">
                {avgRating.toFixed(1)}
              </p>
              <div className="mt-2 flex justify-center">
                <StarRating rating={avgRating} size={18} />
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {reviewCount} đánh giá
              </p>
            </div>

            <div className="flex-1 space-y-1.5">
              {breakdown.map(({ star, count }) => (
                <div key={star} className="flex items-center gap-2 text-sm">
                  <span className="w-10 shrink-0 text-muted-foreground">
                    {star} sao
                  </span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-primary to-cyan-300 transition-all duration-500"
                      style={{
                        width: `${reviewCount ? (count / reviewCount) * 100 : 0}%`,
                      }}
                    />
                  </div>
                  <span className="w-6 shrink-0 text-right text-xs text-muted-foreground">
                    {count}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-8 divide-y divide-border/60">
            {reviews.map((review) => (
              <div
                key={review.id}
                className="-mx-3 flex items-start gap-3 rounded-xl px-3 py-5 transition-colors first:pt-3 hover:bg-muted/30"
              >
                <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-cyan-400 text-sm font-medium text-primary-foreground">
                  {initialsOf(review.booking.user.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                    <p className="font-medium">{review.booking.user.name}</p>
                    <span className="text-xs text-muted-foreground">
                      {formatReviewDate(review.createdAt)}
                    </span>
                  </div>
                  <StarRating rating={review.rating} size={14} />
                  {review.comment && (
                    <p className="mt-2 text-sm text-muted-foreground">
                      {review.comment}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </motion.div>
  );
}
