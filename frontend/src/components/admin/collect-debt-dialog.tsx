"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { HandCoins, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
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
import { Textarea } from "@/components/ui/textarea";
import { FormErrorBanner } from "@/components/form-error-banner";
import { collectDebt, type DebtLine, type RentalPaymentMethod } from "@/lib/bookings-api";
import { RENTAL_PAYMENT_METHOD_LABEL } from "@/lib/booking-format";
import { formatVnd } from "@/lib/device-format";
import { getErrorMessage } from "@/lib/get-error-message";

/** Nhân viên thu nợ tại quầy cho 1 đơn (thu đủ hoặc 1 phần). */
export function CollectDebtDialog({
  line,
  customerName,
  onCollected,
}: {
  line: DebtLine;
  customerName: string;
  onCollected: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [amountInput, setAmountInput] = useState(String(line.outstanding));
  const [method, setMethod] = useState<RentalPaymentMethod>("cash");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const amount = Number(amountInput.replace(/\D/g, "")) || 0;

  const mutation = useMutation({
    mutationFn: () => collectDebt(line.bookingId, { amount, method, note: note.trim() || undefined }),
    onSuccess: () => {
      toast.success("Đã ghi nhận thu nợ — khách đã nhận thông báo");
      setOpen(false);
      onCollected();
    },
    onError: (err) => setError(getErrorMessage(err, "Không ghi nhận được thu nợ")),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          setAmountInput(String(line.outstanding));
          setError(null);
        }
      }}
    >
      <DialogTrigger render={<Button size="sm" />}>
        <HandCoins className="size-4" />
        Đã thu nợ
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Thu nợ – {customerName}</DialogTitle>
          <DialogDescription>
            {line.device.name} · còn nợ {formatVnd(line.outstanding)}
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            if (amount <= 0) return setError("Vui lòng nhập số tiền đã thu");
            if (amount > line.outstanding) return setError(`Số tiền vượt quá số nợ còn lại (${formatVnd(line.outstanding)})`);
            mutation.mutate();
          }}
        >
          <div>
            <Label htmlFor={`debt-amount-${line.bookingId}`} className="mb-1.5 block">
              Số tiền đã thu (đ)
            </Label>
            <Input
              id={`debt-amount-${line.bookingId}`}
              inputMode="numeric"
              value={amount ? amount.toLocaleString("vi-VN") : ""}
              onChange={(e) => setAmountInput(e.target.value.replace(/\D/g, ""))}
            />
          </div>
          <div role="radiogroup" aria-label="Hình thức thanh toán" className="flex gap-1.5">
            {(Object.keys(RENTAL_PAYMENT_METHOD_LABEL) as RentalPaymentMethod[]).map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={method === value}
                onClick={() => setMethod(value)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  method === value
                    ? "border-primary bg-primary/15 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {RENTAL_PAYMENT_METHOD_LABEL[value]}
              </button>
            ))}
          </div>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={1000}
            rows={2}
            placeholder="Ghi chú (mã giao dịch, người nộp thay...)"
          />
          {error && <FormErrorBanner message={error} />}
          <Button type="submit" className="w-full" disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 className="animate-spin" />}
            Xác nhận đã thu
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
