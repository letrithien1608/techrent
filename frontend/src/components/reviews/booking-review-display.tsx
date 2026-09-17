import { StarRating } from "@/components/devices/star-rating";
import type { OwnReview } from "@/lib/reviews-api";

export function BookingReviewDisplay({ review }: { review: OwnReview }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
      <div className="flex items-center gap-2">
        <StarRating rating={review.rating} size={14} />
        <span className="text-xs text-muted-foreground">Đánh giá của bạn</span>
      </div>
      {review.comment && (
        <p className="mt-1.5 text-sm text-muted-foreground">{review.comment}</p>
      )}
    </div>
  );
}
