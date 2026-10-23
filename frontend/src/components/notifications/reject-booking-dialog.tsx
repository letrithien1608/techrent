"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cancelBooking } from "@/lib/bookings-api";
import { getErrorMessage } from "@/lib/get-error-message";
import type { AppNotification } from "@/lib/notifications-api";

const MIN_REASON = 5;

/**
 * Hộp xác nhận từ chối đơn — BẮT BUỘC nhập lý do (gửi kèm thông báo cho khách).
 * Đặt NGOÀI popover thông báo (do component cha quản lý) để popover đóng lại
 * không kéo theo huỷ hộp thoại đang mở.
 */
export function RejectBookingDialog({
  notification,
  onClose,
}: {
  notification: AppNotification | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const meta = notification?.metadata;
  const tooShort = reason.trim().length < MIN_REASON;

  const mutation = useMutation({
    mutationFn: () =>
      cancelBooking(meta!.bookingId!, reason.trim(), { storeFault: true }),
    onSuccess: () => {
      toast.success(`Đã từ chối đơn ${meta?.bookingCode ?? ""}`);
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      void queryClient.invalidateQueries({ queryKey: ["admin"] });
      setReason("");
      setTouched(false);
      onClose();
    },
    onError: (error) => toast.error(getErrorMessage(error)),
  });

  return (
    <Dialog
      open={!!notification}
      onOpenChange={(open) => {
        if (!open && !mutation.isPending) {
          setTouched(false);
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Từ chối đơn {meta?.bookingCode}</DialogTitle>
          <DialogDescription>
            {meta?.customerName ? `${meta.customerName} · ` : ""}
            {meta?.deviceName}. Khách sẽ nhận thông báo kèm lý do và được hoàn toàn bộ cọc nếu đã thanh toán.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            setTouched(true);
            if (!tooShort) mutation.mutate();
          }}
        >
          <Label htmlFor="reject-reason" className="text-sm">
            Lý do từ chối
          </Label>
          <Textarea
            id="reject-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            onBlur={() => setTouched(true)}
            placeholder="VD: Thiết bị đang bảo trì trong khung giờ này"
            maxLength={300}
            rows={3}
            aria-invalid={touched && tooShort}
            className="text-sm"
          />
          {touched && tooShort && (
            <p className="text-[13px] text-red-300">Vui lòng nhập lý do (ít nhất {MIN_REASON} ký tự).</p>
          )}
          <DialogFooter className="mt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={mutation.isPending}>
              Huỷ
            </Button>
            <Button type="submit" variant="destructive" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="animate-spin" />}
              Xác nhận từ chối
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
