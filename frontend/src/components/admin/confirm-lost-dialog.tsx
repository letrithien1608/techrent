"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, SearchX } from "lucide-react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { FormErrorBanner } from "@/components/form-error-banner";
import { confirmLost, fetchLossPreview, type Booking } from "@/lib/bookings-api";
import { formatDateTimeVi, formatVnd } from "@/lib/device-format";
import { getErrorMessage } from "@/lib/get-error-message";

/** Admin xác nhận khách không trả máy: giữ cọc, ghi nợ, thiết bị mất, khách vào danh sách đen. */
export function ConfirmLostDialog({ booking, onChanged }: { booking: Booking; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const previewQuery = useQuery({
    queryKey: ["admin", "booking", booking.id, "loss-preview"],
    queryFn: () => fetchLossPreview(booking.id),
    enabled: open,
  });
  const mutation = useMutation({
    mutationFn: () => confirmLost(booking.id, note.trim() || undefined),
    onSuccess: () => {
      toast.success("Đã xác nhận mất thiết bị — khách đã vào danh sách đen");
      setOpen(false);
      onChanged();
    },
    onError: (err) => setError(getErrorMessage(err, "Không xác nhận được mất thiết bị")),
  });
  const preview = previewQuery.data;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Xác nhận mất thiết bị" />}>
        <SearchX className="size-4 text-destructive" />
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Xác nhận mất thiết bị</DialogTitle>
          <DialogDescription>
            {booking.user?.name ?? "Khách"} chưa trả {booking.device?.name} (hạn trả {formatDateTimeVi(booking.endTime)}).
            Chỉ xác nhận khi đã liên hệ mà khách không trả máy.
          </DialogDescription>
        </DialogHeader>
        {!preview ? (
          <Skeleton className="h-32 rounded-xl" />
        ) : (
          <div className="divide-y divide-border/50 overflow-hidden rounded-xl border border-border/60 text-sm">
            {[
              ["Giá trị thiết bị", formatVnd(preview.originalPrice)],
              ["Phí trễ hạn (đã áp trần)", formatVnd(preview.lateFee)],
              ["Tiền cọc cửa hàng giữ lại", `−${formatVnd(preview.depositAmount)}`],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between px-3 py-2">
                <span className="text-muted-foreground">{label}</span>
                <span className="font-semibold tabular-nums">{value}</span>
              </div>
            ))}
            <div className="flex justify-between bg-muted/30 px-3 py-2 font-medium">
              <span>Khách còn nợ</span>
              <span className="font-semibold tabular-nums text-destructive">{formatVnd(preview.amountOwed)}</span>
            </div>
          </div>
        )}
        <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
          <li>Thiết bị chuyển trạng thái &quot;Đã mất&quot; và ngừng cho thuê.</li>
          <li>Khách tự động vào danh sách đen, lý do kèm bằng chứng: hợp đồng, eKYC, biên bản giao máy.</li>
        </ul>
        <Textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={1000}
          rows={2}
          placeholder="Ghi chú (đã liên hệ khách thế nào...)"
        />
        {error && <FormErrorBanner message={error} />}
        <Button
          variant="destructive"
          className="w-full"
          disabled={mutation.isPending || !preview}
          onClick={() => {
            setError(null);
            mutation.mutate();
          }}
        >
          {mutation.isPending && <Loader2 className="animate-spin" />}
          Xác nhận mất thiết bị
        </Button>
      </DialogContent>
    </Dialog>
  );
}
