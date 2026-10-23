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
import {
  createReview,
  REVIEW_COMMENT_MAX,
  REVIEW_COMMENT_MIN,
  updateReview,
  type OwnReview,
} from "@/lib/reviews-api";
import { getErrorMessage } from "@/lib/get-error-message";

interface Props {
  deviceId: string;
  deviceName: string;
  /** Có → chế độ sửa đánh giá cũ. */
  existing?: OwnReview | null;
  onSaved: () => void;
}

/** Kiểm tra trước ở trình duyệt — backend vẫn kiểm tra lại (độ dài, link, ký tự lặp). */
function validate(rating: number, comment: string): string | null {
  if (rating === 0) return "Vui lòng chọn số sao đánh giá";
  const length = comment.replace(/\s+/g, " ").trim().length;
  if (length < REVIEW_COMMENT_MIN) return `Nhận xét cần ít nhất ${REVIEW_COMMENT_MIN} ký tự`;
  return null;
}

export function ReviewFormDialog({ deviceId, deviceName, existing, onSaved }: Props) {
  const isEdit = !!existing;
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(existing?.rating ?? 0);
  const [comment, setComment] = useState(existing?.comment ?? "");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => {
      const payload = { rating, comment: comment.trim() };
      return existing ? updateReview(existing.id, payload) : createReview(deviceId, payload);
    },
    onSuccess: () => {
      toast.success(isEdit ? "Đã cập nhật đánh giá" : "Cảm ơn bạn đã đánh giá!");
      setOpen(false);
      onSaved();
    },
    onError: (submitError) => {
      setError(getErrorMessage(submitError, "Không thể gửi đánh giá, vui lòng thử lại"));
    },
  });

  function handleSubmit() {
    const problem = validate(rating, comment);
    if (problem) {
      setError(problem);
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
          setRating(existing?.rating ?? 0);
          setComment(existing?.comment ?? "");
          setError(null);
        }
      }}
    >
      <DialogTrigger render={<Button variant={isEdit ? "outline" : "default"} size="sm" />}>
        {isEdit ? "Sửa đánh giá" : "Đánh giá thiết bị"}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Sửa đánh giá" : "Đánh giá thiết bị"}</DialogTitle>
          <DialogDescription>{deviceName}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-2 py-2">
          <StarRatingInput value={rating} onChange={setRating} disabled={mutation.isPending} />
          <p className="text-xs text-muted-foreground">
            {rating > 0 ? `${rating}/5 sao` : "Chọn số sao"}
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="review-comment">Nhận xét</Label>
          <Textarea
            id="review-comment"
            value={comment}
            onChange={(event) => setComment(event.target.value.slice(0, REVIEW_COMMENT_MAX))}
            maxLength={REVIEW_COMMENT_MAX}
            rows={5}
            placeholder="Thiết bị hoạt động thế nào, giao nhận ra sao, có điểm gì cần lưu ý?"
            disabled={mutation.isPending}
          />
          <p className="flex justify-between gap-3 text-xs text-muted-foreground">
            <span>Tối thiểu {REVIEW_COMMENT_MIN} ký tự, không chèn link</span>
            <span>
              {comment.length}/{REVIEW_COMMENT_MAX}
            </span>
          </p>
        </div>

        {error && <FormErrorBanner message={error} />}

        <DialogFooter>
          <Button className="w-full" onClick={handleSubmit} disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 className="animate-spin" />}
            {isEdit ? "Lưu thay đổi" : "Gửi đánh giá"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
