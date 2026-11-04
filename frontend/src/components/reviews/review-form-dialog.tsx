"use client";

import { isAxiosError } from "axios";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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

/** Kiểm tra trước ở trình duyệt — backend vẫn kiểm tra lại (độ dài, link, ký tự lặp). */
function validate(rating: number, comment: string): string | null {
  if (rating === 0) return "Vui lòng chọn số sao đánh giá";
  const length = comment.replace(/\s+/g, " ").trim().length;
  if (length < REVIEW_COMMENT_MIN) return `Nhận xét cần ít nhất ${REVIEW_COMMENT_MIN} ký tự`;
  return null;
}

interface FormProps {
  deviceId: string;
  /** Có → sửa đánh giá cũ. */
  existing?: OwnReview | null;
  onSaved: () => void;
}

/** Form chọn sao + viết nhận xét — dùng trực tiếp (viết mới) hoặc trong hộp thoại (sửa). */
export function ReviewForm({ deviceId, existing, onSaved }: FormProps) {
  const isEdit = !!existing;
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
      onSaved();
    },
    onError: (submitError) => {
      const message = getErrorMessage(submitError, "Không thể gửi đánh giá, vui lòng thử lại");
      // Đã có đánh giá (VD gửi từ tab khác) → báo rõ rồi tải lại để hiện nút "Sửa".
      if (isAxiosError(submitError) && submitError.response?.status === 409) {
        toast.error(message);
        onSaved();
        return;
      }
      setError(message);
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

  const commentId = `review-comment-${existing?.id ?? deviceId}`;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <StarRatingInput value={rating} onChange={setRating} disabled={mutation.isPending} />
        <span className="text-sm text-muted-foreground">
          {rating > 0 ? `${rating}/5 sao` : "Chọn số sao"}
        </span>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={commentId}>Nhận xét</Label>
        <Textarea
          id={commentId}
          value={comment}
          onChange={(event) => setComment(event.target.value.slice(0, REVIEW_COMMENT_MAX))}
          maxLength={REVIEW_COMMENT_MAX}
          rows={4}
          placeholder="Thiết bị hoạt động thế nào, có điểm gì cần lưu ý?"
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

      <div className="flex justify-end">
        <Button onClick={handleSubmit} disabled={mutation.isPending}>
          {mutation.isPending && <Loader2 className="animate-spin" />}
          {isEdit ? "Lưu thay đổi" : "Gửi đánh giá"}
        </Button>
      </div>
    </div>
  );
}

/** Nút "Sửa" mở hộp thoại sửa đánh giá của chính mình. */
export function EditReviewDialog({
  deviceId,
  deviceName,
  review,
  onSaved,
}: {
  deviceId: string;
  deviceName: string;
  review: OwnReview;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const noEditsLeft = review.editsLeftToday <= 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={<Button variant="outline" size="sm" disabled={noEditsLeft} />}
      >
        <Pencil className="size-3.5" />
        Sửa
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Sửa đánh giá của bạn</DialogTitle>
          <DialogDescription>
            {deviceName} · còn {review.editsLeftToday} lần sửa hôm nay
          </DialogDescription>
        </DialogHeader>
        {/* key: mở lại hộp thoại luôn bắt đầu từ nội dung đã lưu. */}
        <ReviewForm
          key={String(open)}
          deviceId={deviceId}
          existing={review}
          onSaved={() => {
            setOpen(false);
            onSaved();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
