"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Ban, Loader2 } from "lucide-react";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cancelBooking, type Booking, type CancelBookingResult } from "@/lib/bookings-api";
import { estimateRefundPercentage } from "@/lib/booking-format";
import { formatVnd } from "@/lib/device-format";
import { getErrorMessage } from "@/lib/get-error-message";

interface Props {
  booking: Booking;
  onCancelled?: (result: CancelBookingResult) => void;
  variant?: "outline" | "destructive" | "ghost";
  size?: "sm" | "default" | "lg";
  className?: string;
  /** Dùng ở bảng admin — chỉ icon thùng rác + tooltip, không có text "Huỷ đơn". */
  iconOnly?: boolean;
}

export function CancelBookingDialog({
  booking,
  onCancelled,
  variant = "outline",
  size = "sm",
  className,
  iconOnly = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const refundPercentage = estimateRefundPercentage(booking.startTime);
  const refundAmount = (Number(booking.depositAmount) * refundPercentage) / 100;

  const mutation = useMutation({
    mutationFn: () => cancelBooking(booking.id),
    onSuccess: (result) => {
      toast.success(
        `Đã huỷ đơn — hoàn ${result.refundPercentage}% tiền cọc (${formatVnd(result.refundAmount)})`,
      );
      setOpen(false);
      onCancelled?.(result);
    },
    onError: (error) => {
      toast.error(getErrorMessage(error, "Không thể huỷ đơn, vui lòng thử lại"));
    },
  });

  const trigger = (
    <DialogTrigger
      render={
        <Button
          variant={variant}
          size={iconOnly ? "icon-sm" : size}
          className={className}
          aria-label={iconOnly ? "Huỷ đơn" : undefined}
        />
      }
    >
      {iconOnly ? <Ban className="size-4" /> : "Huỷ đơn"}
    </DialogTrigger>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {iconOnly ? (
        <Tooltip>
          <TooltipTrigger render={<span className="inline-flex" />}>{trigger}</TooltipTrigger>
          <TooltipContent>Huỷ đơn</TooltipContent>
        </Tooltip>
      ) : (
        trigger
      )}
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Huỷ đơn thuê này?</DialogTitle>
          <DialogDescription>
            Theo chính sách hoàn cọc, bạn sẽ được hoàn{" "}
            <span className="font-semibold text-foreground">
              {refundPercentage}%
            </span>{" "}
            tiền cọc, tương đương{" "}
            <span className="font-semibold text-foreground">
              {formatVnd(refundAmount)}
            </span>
            .
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={mutation.isPending}
          >
            Không huỷ
          </Button>
          <Button
            variant="destructive"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            {mutation.isPending && <Loader2 className="animate-spin" />}
            Xác nhận huỷ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
