"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Banknote, Loader2 } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormErrorBanner } from "@/components/form-error-banner";
import { markDepositRefunded, type Booking } from "@/lib/bookings-api";
import { isRefundOverdue, totalRefundAmount } from "@/lib/booking-format";
import { formatDateTimeVi, formatVnd } from "@/lib/device-format";
import { getErrorMessage } from "@/lib/get-error-message";

/** Nhân viên đã chuyển khoản hoàn cọc → nhập mã giao dịch, khách nhận thông báo realtime. */
export function DepositRefundDialog({
  booking,
  onChanged,
  iconOnly = false,
}: {
  booking: Booking;
  onChanged: () => void;
  iconOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [txnRef, setTxnRef] = useState("");
  const [error, setError] = useState<string | null>(null);
  const overdue = isRefundOverdue(booking);

  const mutation = useMutation({
    mutationFn: () => markDepositRefunded(booking.id, txnRef.trim()),
    onSuccess: () => {
      toast.success("Đã ghi nhận hoàn cọc — khách đã nhận thông báo");
      setOpen(false);
      setTxnRef("");
      onChanged();
    },
    onError: (err) => setError(getErrorMessage(err, "Không ghi nhận được hoàn cọc")),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          iconOnly ? (
            <Button variant="ghost" size="icon-sm" aria-label="Đã hoàn cọc" />
          ) : (
            <Button size="sm" variant={overdue ? "destructive" : "default"} />
          )
        }
      >
        <Banknote className="size-4" />
        {!iconOnly && "Đã hoàn cọc"}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Xác nhận đã hoàn cọc</DialogTitle>
          <DialogDescription>
            Chuyển khoản {formatVnd(totalRefundAmount(booking))}
            {Number(booking.rentalRefundAmount ?? 0) > 0 &&
              ` (cọc ${formatVnd(booking.depositRefundAmount ?? 0)} + tiền thuê ${formatVnd(booking.rentalRefundAmount!)})`}{" "}
            cho {booking.user?.name ?? "khách"}
            {booking.user?.phone && ` (SĐT ${booking.user.phone})`}, rồi nhập mã giao dịch ngân hàng.
          </DialogDescription>
        </DialogHeader>
        {booking.depositRefundDueAt && (
          <p className={overdue ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
            {overdue ? "Đã quá hạn" : "Hạn"} hoàn cọc: {formatDateTimeVi(booking.depositRefundDueAt)}
          </p>
        )}
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            if (txnRef.trim().length < 3) {
              setError("Mã giao dịch phải có ít nhất 3 ký tự");
              return;
            }
            mutation.mutate();
          }}
        >
          <div>
            <Label htmlFor={`txn-${booking.id}`} className="mb-1.5 block">
              Mã giao dịch chuyển khoản
            </Label>
            <Input
              id={`txn-${booking.id}`}
              value={txnRef}
              onChange={(e) => setTxnRef(e.target.value)}
              maxLength={100}
              placeholder="VD: FT26307123456"
              autoComplete="off"
            />
          </div>
          {error && <FormErrorBanner message={error} />}
          <Button type="submit" className="w-full" disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 className="animate-spin" />}
            Xác nhận đã chuyển khoản
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
