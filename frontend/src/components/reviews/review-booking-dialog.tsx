"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormErrorBanner } from "@/components/form-error-banner";
import { StarRatingInput } from "@/components/reviews/star-rating-input";
import { createReview, type OwnReview } from "@/lib/reviews-api";
import { getErrorMessage } from "@/lib/get-error-message";

const MAX_COMMENT_LENGTH = 500;

interface Props {
  bookingId: string;
  onSubmitted: (review: OwnReview) => void;
}

export function ReviewBookingDialog({ bookingId, onSubmitted }: Props) {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () =>
      createReview({ bookingId, rating, comment: comment.trim() || undefined }),
    onSuccess: (review) => {
      toast.success("Cảm ơn bạn đã đánh giá!");
      setOpen(false);
      onSubmitted(review);
    },
    onError: (submitError) => {
      setError(getErrorMessage(submitError, "Không thể gửi đánh giá, vui lòng thử lại"));
    },
  });

  function handleSubmit() {
    if (rating === 0) {
      setError("Vui lòng chọn số sao đánh giá");
      return;
    }
    setError(null);
    mutation.mutate();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (nextOpen) {
          setError(null);
        }
      }}
    >
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        Đánh giá
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Đánh giá thiết bị đã thuê</DialogTitle>
          <DialogDescription>
            Chia sẻ trải nghiệm của bạn để giúp khách hàng khác lựa chọn tốt hơn.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-2 py-2">
          <StarRatingInput
            value={rating}
            onChange={setRating}
            disabled={mutation.isPending}
          />
          <p className="text-xs text-muted-foreground">
            {rating > 0 ? `${rating}/5 sao` : "Chọn số sao"}
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="review-comment">Nhận xét (không bắt buộc)</Label>
          <Textarea
            id="review-comment"
            value={comment}
            onChange={(event) => setComment(event.target.value.slice(0, MAX_COMMENT_LENGTH))}
            maxLength={MAX_COMMENT_LENGTH}
            rows={4}
            placeholder="Thiết bị hoạt động tốt, giao nhận nhanh chóng..."
            disabled={mutation.isPending}
          />
          <p className="text-right text-xs text-muted-foreground">
            {comment.length}/{MAX_COMMENT_LENGTH}
          </p>
        </div>

        {error && <FormErrorBanner message={error} />}

        <DialogFooter>
          <Button className="w-full" onClick={handleSubmit} disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 className="animate-spin" />}
            Gửi đánh giá
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
