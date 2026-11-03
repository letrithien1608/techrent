"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, FileText, HandCoins, Loader2, PackageCheck } from "lucide-react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { PhotoPicker } from "@/components/admin/photo-picker";
import {
  fetchBookingById,
  recordHandover,
  recordRentalPayment,
  setContractSigned,
  startBooking,
  type Booking,
  type RentalPaymentMethod,
} from "@/lib/bookings-api";
import { RENTAL_PAYMENT_METHOD_LABEL } from "@/lib/booking-format";
import { formatDateTimeVi, formatVnd } from "@/lib/device-format";
import { getErrorMessage } from "@/lib/get-error-message";
import { fetchRentalPolicy } from "@/lib/policies-api";

const DEFAULT_MIN_PHOTOS = 3;

function Step({
  index,
  title,
  done,
  children,
}: {
  index: number;
  title: string;
  done: boolean;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-border/60 p-4">
      <div className="mb-3 flex items-center gap-2">
        <span
          className={cn(
            "flex size-6 items-center justify-center rounded-full text-xs font-semibold",
            done ? "bg-emerald-500/20 text-emerald-400" : "bg-muted text-muted-foreground",
          )}
        >
          {done ? <CheckCircle2 className="size-4" /> : index}
        </span>
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      {children}
    </section>
  );
}

/**
 * Giao máy tại quầy — 3 việc bắt buộc trước khi chuyển đơn sang "Đang thuê":
 * lập biên bản giao máy (≥ N ảnh), thu tiền thuê, đánh dấu khách đã ký hợp
 * đồng. Backend kiểm tra lại cả 3 ở `PATCH /bookings/:id/start`.
 */
export function BookingHandoverDialog({ booking, onChanged }: { booking: Booking; onChanged: () => void }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [notes, setNotes] = useState("");
  const [method, setMethod] = useState<RentalPaymentMethod>("cash");
  const [retake, setRetake] = useState(false);

  const detailKey = ["admin", "booking", booking.id];
  const detailQuery = useQuery({
    queryKey: detailKey,
    queryFn: () => fetchBookingById(booking.id),
    enabled: open,
  });
  const policyQuery = useQuery({
    queryKey: ["rental-policy"],
    queryFn: fetchRentalPolicy,
    enabled: open,
    staleTime: 5 * 60_000,
  });
  const minPhotos = policyQuery.data?.handoverMinPhotos ?? DEFAULT_MIN_PHOTOS;

  function refresh() {
    queryClient.invalidateQueries({ queryKey: detailKey });
    onChanged();
  }
  const onError = (fallback: string) => (error: unknown) => toast.error(getErrorMessage(error, fallback));

  const handoverMutation = useMutation({
    mutationFn: () => recordHandover(booking.id, files, notes.trim() || undefined),
    onSuccess: () => {
      toast.success("Đã lưu biên bản giao máy");
      setFiles([]);
      setRetake(false);
      refresh();
    },
    onError: onError("Không lưu được biên bản giao máy"),
  });
  const paymentMutation = useMutation({
    mutationFn: () => recordRentalPayment(booking.id, method),
    onSuccess: () => {
      toast.success("Đã ghi nhận thu tiền thuê");
      refresh();
    },
    onError: onError("Không ghi nhận được tiền thuê"),
  });
  const signMutation = useMutation({
    mutationFn: (signed: boolean) => setContractSigned(booking.id, signed),
    onSuccess: refresh,
    onError: onError("Không cập nhật được trạng thái ký hợp đồng"),
  });
  const startMutation = useMutation({
    mutationFn: () => startBooking(booking.id),
    onSuccess: () => {
      toast.success("Đã giao máy — đơn chuyển sang Đang thuê");
      setOpen(false);
      onChanged();
    },
    onError: onError("Chưa thể giao máy"),
  });

  const detail = detailQuery.data;
  const handover = detail?.inspections?.find((i) => i.type === "handover");
  const ready = !!handover && !!detail?.rentalPaid && !!detail?.contractSigned;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Giao máy" />}>
        <PackageCheck className="size-4" />
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Giao máy – {booking.device?.name ?? "Thiết bị"}</DialogTitle>
          <DialogDescription>
            {booking.user?.name ?? "Khách thuê"} · {formatDateTimeVi(booking.startTime)} →{" "}
            {formatDateTimeVi(booking.endTime)}. Đối chiếu CCCD gốc của khách trước khi giao.
          </DialogDescription>
        </DialogHeader>

        {detailQuery.isPending ? (
          <Skeleton className="h-64 w-full rounded-xl" />
        ) : detailQuery.isError || !detail ? (
          <p className="text-sm text-destructive">Không tải được đơn thuê. Vui lòng thử lại.</p>
        ) : (
          <div className="space-y-3">
            <Step index={1} title="Biên bản giao máy" done={!!handover && !retake}>
              {handover && !retake ? (
                <div className="space-y-2">
                  <div className="grid grid-cols-5 gap-1.5">
                    {handover.images.map((src, i) => (
                      <div key={src} className="relative aspect-square overflow-hidden rounded-lg bg-muted">
                        <Image src={src} alt={`Ảnh giao máy ${i + 1}`} fill sizes="90px" className="object-cover" />
                      </div>
                    ))}
                  </div>
                  {handover.notes && <p className="text-xs text-muted-foreground">Ghi chú: {handover.notes}</p>}
                  <Button variant="outline" size="sm" onClick={() => setRetake(true)}>
                    Chụp lại
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <PhotoPicker
                    files={files}
                    onChange={setFiles}
                    hint={`Chụp tối thiểu ${minPhotos} ảnh: mặt trước, mặt sau, các góc/vết trầy, phụ kiện`}
                  />
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Ghi chú tình trạng: vết trầy, phụ kiện kèm theo (sạc, cáp, túi...)"
                    maxLength={2000}
                    rows={2}
                  />
                  <div className="flex items-center justify-between gap-2">
                    <span className={cn("text-xs", files.length < minPhotos ? "text-amber-400" : "text-muted-foreground")}>
                      Đã chọn {files.length}/{minPhotos} ảnh tối thiểu
                    </span>
                    <div className="flex gap-2">
                      {retake && (
                        <Button variant="ghost" size="sm" onClick={() => setRetake(false)}>
                          Huỷ
                        </Button>
                      )}
                      <Button
                        size="sm"
                        disabled={files.length < minPhotos || handoverMutation.isPending}
                        onClick={() => handoverMutation.mutate()}
                      >
                        {handoverMutation.isPending && <Loader2 className="animate-spin" />}
                        Lưu biên bản
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </Step>

            <Step index={2} title={`Thu tiền thuê ${formatVnd(detail.totalPrice)}`} done={!!detail.rentalPaid}>
              {detail.rentalPaid ? (
                <p className="text-sm text-muted-foreground">
                  Đã thu
                  {detail.rentalPaymentMethod && ` bằng ${RENTAL_PAYMENT_METHOD_LABEL[detail.rentalPaymentMethod].toLowerCase()}`}
                  {detail.rentalPaidAt && ` lúc ${formatDateTimeVi(detail.rentalPaidAt)}`}.
                </p>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
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
                  <Button
                    size="sm"
                    className="ml-auto"
                    disabled={paymentMutation.isPending}
                    onClick={() => paymentMutation.mutate()}
                  >
                    {paymentMutation.isPending ? <Loader2 className="animate-spin" /> : <HandCoins />}
                    Đã thu tiền thuê
                  </Button>
                </div>
              )}
            </Step>

            <Step index={3} title="Khách ký hợp đồng" done={!!detail.contractSigned}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  nativeButton={false}
                  render={
                    <Link href={`/admin/bookings/${booking.id}/contract`} target="_blank" rel="noopener noreferrer" />
                  }
                >
                  <FileText className="size-4" />
                  Xem/In hợp đồng
                </Button>
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={!!detail.contractSigned}
                    disabled={signMutation.isPending}
                    onCheckedChange={(checked) => signMutation.mutate(checked)}
                  />
                  Khách đã ký tay
                </label>
              </div>
            </Step>

            <Button className="w-full" size="lg" disabled={!ready || startMutation.isPending} onClick={() => startMutation.mutate()}>
              {startMutation.isPending && <Loader2 className="animate-spin" />}
              Giao máy – bắt đầu cho thuê
            </Button>
            {!ready && (
              <p className="text-center text-xs text-muted-foreground">
                Hoàn tất đủ 3 bước trên để giao máy.
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
