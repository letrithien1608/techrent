"use client";

import { cn } from "cn";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2, Trash2 } from "lucide-react";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { FormErrorBanner } from "@/components/form-error-banner";
import { StarRating } from "@/components/devices/star-rating";
import { MODERATION_REASONS, moderatorDeleteReview } from "@/lib/reviews-api";
import { getErrorMessage } from "@/lib/get-error-message";

const OTHER = "other";

interface Props {
  review: { id: string; rating: number; comment: string | null };
  authorName: string;
  onDeleted: () => void;
  /** "icon" cho bảng quản trị, "text" cho trang chi tiết thiết bị. */
  trigger?: "icon" | "text";
}

/**
 * Nhân viên/quản trị xoá đánh giá vi phạm — bắt buộc chọn/nhập lý do (gửi kèm
 * thông báo cho người viết). Xoá mềm: người viết không viết lại được, quản trị
 * viên khôi phục được ở trang Quản lý đánh giá.
 */
export function ModeratorDeleteReviewDialog({ review, authorName, onDeleted, trigger = "icon" }: Props) {
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<string>("");
  const [otherReason, setOtherReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const reason = choice === OTHER ? otherReason.trim() : choice;

  const mutation = useMutation({
    mutationFn: () => moderatorDeleteReview(review.id, reason),
    onSuccess: () => {
      toast.success("Đã xoá đánh giá và báo cho người viết");
      setOpen(false);
      onDeleted();
    },
    onError: (submitError) => setError(getErrorMessage(submitError, "Không thể xoá đánh giá")),
  });

  const triggerButton =
    trigger === "icon" ? (
      <Tooltip>
        <TooltipTrigger render={<span className="inline-flex" />}>
          <DialogTrigger
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Xoá đánh giá"
                className="text-destructive hover:text-destructive"
              />
            }
          >
            <Trash2 className="size-4" />
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent>Xoá đánh giá</TooltipContent>
      </Tooltip>
    ) : (
      <DialogTrigger
        render={
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-destructive hover:text-destructive" />
        }
      >
        <Trash2 className="size-3.5" />
        Xoá
      </DialogTrigger>
    );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setChoice("");
          setOtherReason("");
          setError(null);
        }
      }}
    >
      {triggerButton}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Xoá đánh giá</DialogTitle>
          <DialogDescription>
            Đánh giá sẽ biến mất khỏi mọi trang và không tính vào điểm thiết bị. Người viết nhận
            thông báo kèm lý do và không thể đánh giá lại thiết bị này.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-sm">
          <div className="flex items-center gap-2">
            <StarRating rating={review.rating} size={12} />
            <span className="text-xs text-muted-foreground">{authorName}</span>
          </div>
          {review.comment && (
            <p className="mt-1.5 line-clamp-4 whitespace-pre-line break-words text-muted-foreground">
              {review.comment}
            </p>
          )}
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">Lý do xoá</legend>
          <div className="flex flex-wrap gap-2">
            {[...MODERATION_REASONS, OTHER].map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={choice === value}
                onClick={() => {
                  setChoice(value);
                  setError(null);
                }}
                className={cn(
                  "rounded-full border px-3 py-1 text-sm transition-colors",
                  choice === value
                    ? "border-destructive bg-destructive/15 text-destructive"
                    : "border-border/60 text-muted-foreground hover:border-destructive/50 hover:text-foreground",
                )}
              >
                {value === OTHER ? "Lý do khác" : value}
              </button>
            ))}
          </div>
          {choice === OTHER && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`delete-reason-${review.id}`} className="sr-only">
                Lý do khác
              </Label>
              <Textarea
                id={`delete-reason-${review.id}`}
                rows={3}
                maxLength={500}
                value={otherReason}
                onChange={(event) => setOtherReason(event.target.value)}
                placeholder="Nhập lý do cụ thể..."
                autoFocus
              />
            </div>
          )}
        </fieldset>

        {error && <FormErrorBanner message={error} />}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={mutation.isPending}>
            Huỷ
          </Button>
          <Button
            variant="destructive"
            disabled={mutation.isPending}
            onClick={() => {
              if (!reason) {
                setError("Vui lòng chọn hoặc nhập lý do xoá");
                return;
              }
              mutation.mutate();
            }}
          >
            {mutation.isPending && <Loader2 className="animate-spin" />}
            Xoá đánh giá
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
