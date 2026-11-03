"use client";

import Image from "next/image";
import { useDeferredValue, useState } from "react";
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, PackageOpen } from "lucide-react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { FormErrorBanner } from "@/components/form-error-banner";
import { PhotoPicker } from "@/components/admin/photo-picker";
import {
  confirmReturn,
  fetchBookingById,
  previewReturn,
  type Booking,
  type DeviceCondition,
} from "@/lib/bookings-api";
import { DEVICE_CONDITION_LABEL } from "@/lib/booking-format";
import { formatDateTimeVi, formatVnd } from "@/lib/device-format";
import { getErrorMessage } from "@/lib/get-error-message";

function Row({ label, value, tone, strong }: { label: string; value: string; tone?: string; strong?: boolean }) {
  return (
    <div className={cn("flex justify-between gap-4 px-3 py-2 text-sm", strong && "bg-muted/30 font-medium")}>
      <span className={strong ? undefined : "text-muted-foreground"}>{label}</span>
      <span className={cn("font-semibold tabular-nums", tone)}>{value}</span>
    </div>
  );
}

/**
 * Nhận lại máy tại quầy (thay nút "Hoàn tất" cũ): đối chiếu ảnh lúc giao, chọn
 * tình trạng, nhập bồi thường + ảnh minh chứng nếu hư hỏng/thiếu phụ kiện. Bảng
 * khấu trừ lấy từ `GET /bookings/:id/return-preview` — đúng công thức backend.
 */
export function BookingReturnDialog({ booking, onChanged }: { booking: Booking; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [condition, setCondition] = useState<DeviceCondition>("intact");
  const [description, setDescription] = useState("");
  const [feeInput, setFeeInput] = useState("");
  const [notes, setNotes] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);

  const intact = condition === "intact";
  const damageFee = intact ? 0 : Math.max(Number(feeInput.replace(/\D/g, "")) || 0, 0);
  const deferredFee = useDeferredValue(damageFee);

  const detailQuery = useQuery({
    queryKey: ["admin", "booking", booking.id],
    queryFn: () => fetchBookingById(booking.id),
    enabled: open,
  });
  const previewQuery = useQuery({
    queryKey: ["admin", "booking", booking.id, "return-preview", deferredFee],
    queryFn: () => previewReturn(booking.id, deferredFee),
    enabled: open,
    placeholderData: keepPreviousData,
  });

  const mutation = useMutation({
    mutationFn: () =>
      confirmReturn(booking.id, {
        condition,
        damageDescription: intact ? undefined : description.trim(),
        damageFee: intact ? undefined : damageFee,
        notes: notes.trim() || undefined,
        files,
      }),
    onSuccess: () => {
      toast.success("Đã nhận lại máy và quyết toán tiền cọc");
      setOpen(false);
      onChanged();
    },
    onError: (err) => setError(getErrorMessage(err, "Không xác nhận được trả máy")),
  });

  function submit() {
    setError(null);
    if (!intact) {
      if (!description.trim()) return setError("Vui lòng mô tả hư hỏng hoặc phụ kiện bị thiếu");
      if (damageFee <= 0) return setError("Vui lòng nhập số tiền bồi thường");
      if (files.length === 0) return setError("Cần ít nhất 1 ảnh minh chứng");
    }
    mutation.mutate();
  }

  const handover = detailQuery.data?.inspections?.find((i) => i.type === "handover");
  const preview = previewQuery.data;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Xác nhận trả máy" />}>
        <PackageOpen className="size-4" />
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Xác nhận trả máy – {booking.device?.name ?? "Thiết bị"}</DialogTitle>
          <DialogDescription>
            {booking.user?.name ?? "Khách thuê"} · hạn trả {formatDateTimeVi(booking.endTime)}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Ảnh lúc giao máy</h3>
            {detailQuery.isPending ? (
              <Skeleton className="h-32 rounded-xl" />
            ) : handover ? (
              <>
                <div className="grid grid-cols-3 gap-1.5">
                  {handover.images.map((src, i) => (
                    <a
                      key={src}
                      href={src}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="relative aspect-square overflow-hidden rounded-lg bg-muted"
                    >
                      <Image src={src} alt={`Ảnh giao máy ${i + 1}`} fill sizes="110px" className="object-cover" />
                    </a>
                  ))}
                </div>
                {handover.notes && <p className="text-xs text-muted-foreground">Ghi chú lúc giao: {handover.notes}</p>}
              </>
            ) : (
              <p className="text-xs text-muted-foreground">Đơn không có biên bản giao máy (đơn cũ).</p>
            )}
          </div>

          <div className="space-y-3">
            <div>
              <Label className="mb-1.5 block">Tình trạng khi nhận lại</Label>
              <div role="radiogroup" aria-label="Tình trạng thiết bị" className="flex flex-wrap gap-1.5">
                {(Object.keys(DEVICE_CONDITION_LABEL) as DeviceCondition[]).map((value) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={condition === value}
                    onClick={() => setCondition(value)}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                      condition === value
                        ? value === "intact"
                          ? "border-emerald-500 bg-emerald-500/15 text-emerald-400"
                          : "border-destructive bg-destructive/15 text-destructive"
                        : "border-border text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {DEVICE_CONDITION_LABEL[value]}
                  </button>
                ))}
              </div>
            </div>

            {!intact && (
              <>
                <div>
                  <Label htmlFor="damage-description" className="mb-1.5 block">
                    Mô tả hư hỏng / phụ kiện thiếu
                  </Label>
                  <Textarea
                    id="damage-description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    maxLength={2000}
                    rows={2}
                    placeholder="VD: nứt màn hình góc phải, mất sạc 65W"
                  />
                </div>
                <div>
                  <Label htmlFor="damage-fee" className="mb-1.5 block">
                    Số tiền bồi thường (đ)
                  </Label>
                  <Input
                    id="damage-fee"
                    inputMode="numeric"
                    value={feeInput ? Number(feeInput.replace(/\D/g, "") || 0).toLocaleString("vi-VN") : ""}
                    onChange={(e) => setFeeInput(e.target.value.replace(/\D/g, ""))}
                    placeholder="0"
                  />
                </div>
              </>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-semibold">
            Ảnh lúc trả máy {intact ? "(không bắt buộc)" : "(ít nhất 1 ảnh minh chứng)"}
          </h3>
          <PhotoPicker files={files} onChange={setFiles} hint="Chụp cùng góc với ảnh lúc giao để dễ đối chiếu" />
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={2000}
            rows={2}
            placeholder="Ghi chú khi nhận lại máy (không bắt buộc)"
          />
        </div>

        <div>
          <h3 className="mb-2 text-sm font-semibold">Quyết toán tiền cọc (tính đến bây giờ)</h3>
          {!preview ? (
            <Skeleton className="h-28 rounded-xl" />
          ) : (
            <div className="divide-y divide-border/50 overflow-hidden rounded-xl border border-border/60">
              <Row label="Tiền cọc" value={formatVnd(preview.depositAmount)} />
              <Row
                label="− Phí trễ hạn"
                value={preview.lateFee > 0 ? `−${formatVnd(preview.lateFee)}` : formatVnd(0)}
                tone={preview.lateFee > 0 ? "text-destructive" : undefined}
              />
              <Row
                label="− Phí hư hỏng"
                value={preview.damageFee > 0 ? `−${formatVnd(preview.damageFee)}` : formatVnd(0)}
                tone={preview.damageFee > 0 ? "text-destructive" : undefined}
              />
              <Row label="Hoàn lại cho khách" value={formatVnd(preview.refundAmount)} tone="text-emerald-400" strong />
              {preview.amountOwed > 0 && (
                <Row label="Khách còn nợ" value={formatVnd(preview.amountOwed)} tone="text-destructive" strong />
              )}
            </div>
          )}
        </div>

        {error && <FormErrorBanner message={error} />}

        <Button size="lg" className="w-full" disabled={mutation.isPending} onClick={submit}>
          {mutation.isPending && <Loader2 className="animate-spin" />}
          Xác nhận đã nhận lại máy
        </Button>
      </DialogContent>
    </Dialog>
  );
}
